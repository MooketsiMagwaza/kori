// Prints what a vector PMTiles file holds: per layer and zoom, the feature count and the `kind`
// values (with `kind_detail` for roads and water), and a sample of names. Used to write the map
// style against the real data rather than guessing.
//
//   node inspect-pmtiles.mjs <file.pmtiles> [zoom ...]

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PMTiles, TileType } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader as Pbf } from "pbf";

const [path, ...zoomArgs] = process.argv.slice(2);
if (!path) {
  console.error("usage: node inspect-pmtiles.mjs <file.pmtiles> [zoom ...]");
  process.exit(2);
}

const bytes = readFileSync(path);
const source = {
  getKey: () => path,
  getBytes: async (offset, length) => ({ data: bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + length) }),
};
const archive = new PMTiles(source);
const header = await archive.getHeader();
if (header.tileType !== TileType.Mvt) {
  console.log(`not a vector archive (tile type ${header.tileType})`);
  process.exit(0);
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

const zooms = zoomArgs.length ? zoomArgs.map(Number) : [8, 10, 12, 14, 15];
for (const z of zooms) {
  const stats = new Map();
  const [x0, x1] = [lon2x(header.minLon, z), lon2x(header.maxLon, z)];
  const [y0, y1] = [lat2y(header.maxLat, z), lat2y(header.minLat, z)];
  let tiles = 0;
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const tile = await archive.getZxy(z, x, y);
      if (!tile) continue;
      tiles += 1;
      let data = new Uint8Array(tile.data);
      if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
      const vt = new VectorTile(new Pbf(data));
      for (const [name, layer] of Object.entries(vt.layers)) {
        const entry = stats.get(name) ?? { count: 0, kinds: new Map(), names: new Set() };
        for (let i = 0; i < layer.length; i += 1) {
          const f = layer.feature(i);
          entry.count += 1;
          const key = [f.properties.kind, f.properties.kind_detail].filter((v) => v !== undefined).join("/");
          entry.kinds.set(key, (entry.kinds.get(key) ?? 0) + 1);
          if (f.properties.name && entry.names.size < 25) entry.names.add(`${f.properties.name} (${key})`);
        }
        stats.set(name, entry);
      }
    }
  }
  console.log(`\nzoom ${z}: ${tiles} tiles`);
  for (const [name, entry] of stats) {
    const kinds = [...entry.kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(`  ${name}: ${entry.count} features; ${kinds}`);
    if (entry.names.size) console.log(`    names: ${[...entry.names].join("; ")}`);
  }
}
