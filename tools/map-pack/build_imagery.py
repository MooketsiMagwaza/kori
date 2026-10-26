"""Turn a Sentinel-2 window (from fetch_s2.py) into a true-colour raster MBTiles of 256 px Web
Mercator tiles, ready for `pmtiles convert`.

  1. Reflectance from B04, B03, B02 (DN / 10000; DN 0 is no data and becomes transparent).
  2. A contrast stretch shared by the three bands (so sand stays sand-coloured rather than being
     pushed to white), from low and high percentiles of the valid pixels, then a gentle gamma and
     a small saturation lift. The numbers are printed and recorded in imagery-report.json.
  3. A pyramid of 2x box-filtered copies (10, 20, 40 ... m), so a zoomed-out tile averages the
     pixels under it instead of aliasing.
  4. For each tile, every output pixel centre is projected to the scene's UTM zone and sampled
     bilinearly from the pyramid level just finer than the tile's ground resolution.
  5. WebP tiles (alpha only where the window ends), written to MBTiles with Python's sqlite3.

It also writes a small preview PNG of the whole window and the colours the imagery puts behind the
map's lines and labels (darkest and lightest 2%), for the contrast check.

Usage: python -I build_imagery.py --s2-dir <fetch_s2 output> --out <file.mbtiles> --preview <file.png>
       --report <file.json> [--minzoom 8 --maxzoom 14 --quality 78]

Credit: "Contains modified Copernicus Sentinel data 2025".
"""

import argparse
import json
import math
import pathlib
import sqlite3
import sys
import time
from io import BytesIO

import numpy as np
from PIL import Image
from pyproj import Transformer

TILE = 256


def lonlat_of_pixels(z: int, x: int, y: int):
    """Lon/lat of the centre of every pixel in tile z/x/y."""
    n = TILE * 2**z
    px = (x * TILE + np.arange(TILE) + 0.5) / n
    py = (y * TILE + np.arange(TILE) + 0.5) / n
    lon = px * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py))))
    return np.meshgrid(lon, lat)


def tile_of(lon: float, lat: float, z: int):
    n = 2**z
    x = (lon + 180) / 360 * n
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n
    return int(math.floor(x)), int(math.floor(y))


def box2(rgb: np.ndarray, valid: np.ndarray):
    """Halve resolution by averaging 2x2 blocks of valid pixels."""
    h, w = valid.shape
    h2, w2 = h // 2, w // 2
    v = valid[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2).astype(np.float32)
    weight = v.sum(axis=(1, 3))
    out = np.zeros((h2, w2, 3), np.float32)
    for k in range(3):
        band = rgb[: h2 * 2, : w2 * 2, k].reshape(h2, 2, w2, 2) * v
        out[..., k] = np.where(weight > 0, band.sum(axis=(1, 3)) / np.maximum(weight, 1), 0)
    return out, weight >= 2


def bilinear(rgb: np.ndarray, valid: np.ndarray, col: np.ndarray, row: np.ndarray):
    """Sample rgb at fractional pixel coordinates (pixel centres at +0.5)."""
    h, w = valid.shape
    c = col - 0.5
    r = row - 0.5
    inside = (c >= -0.5) & (c <= w - 0.5) & (r >= -0.5) & (r <= h - 0.5)
    c = np.clip(c, 0, w - 1.001)
    r = np.clip(r, 0, h - 1.001)
    c0 = np.floor(c).astype(np.int64)
    r0 = np.floor(r).astype(np.int64)
    fc = (c - c0)[..., None]
    fr = (r - r0)[..., None]
    a = rgb[r0, c0]
    b = rgb[r0, c0 + 1]
    cc = rgb[r0 + 1, c0]
    d = rgb[r0 + 1, c0 + 1]
    out = (a * (1 - fc) + b * fc) * (1 - fr) + (cc * (1 - fc) + d * fc) * fr
    ok = inside & valid[r0, c0] & valid[r0, c0 + 1] & valid[r0 + 1, c0] & valid[r0 + 1, c0 + 1]
    return out, ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--s2-dir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--minzoom", type=int, default=8)
    parser.add_argument("--maxzoom", type=int, default=14)
    parser.add_argument("--quality", type=int, default=78)
    parser.add_argument("--low", type=float, default=1.0, help="low percentile for the stretch")
    parser.add_argument("--high", type=float, default=99.3, help="high percentile for the stretch")
    parser.add_argument("--gamma", type=float, default=0.85)
    parser.add_argument("--saturation", type=float, default=1.15)
    args = parser.parse_args()
    started = time.time()

    src = pathlib.Path(args.s2_dir)
    log = json.loads((src / "fetch-log.json").read_text(encoding="utf-8"))
    transform = log["bands"]["B04"]["transform"]  # a, b, c, d, e, f (affine)
    res, x0, y0 = transform[0], transform[2], transform[5]
    epsg = int(log["bands"]["B04"]["crs"].split(":")[1])

    dn = {name: np.load(src / f"{name}.npy") for name in ("B04", "B03", "B02")}
    valid = (dn["B04"] > 0) & (dn["B03"] > 0) & (dn["B02"] > 0)
    scl = np.load(src / "SCL.npy")
    scl10 = np.repeat(np.repeat(scl, 2, axis=0), 2, axis=1)[: valid.shape[0], : valid.shape[1]]
    valid &= scl10 != 0
    refl = np.stack([dn[b].astype(np.float32) / 10000.0 for b in ("B04", "B03", "B02")], axis=-1)
    del dn
    report = {"source": log["item"], "datetime": log["datetime"], "valid_share": round(float(valid.mean()), 4),
              "scl_cloud_share": round(float(np.isin(scl10, [3, 8, 9, 10]).mean()), 6)}

    # Shared stretch: one low and one high for all three bands, from their pooled percentiles.
    samples = refl[valid][:: max(1, int(valid.sum() // 2_000_000))]
    lows = np.percentile(samples, args.low, axis=0)
    highs = np.percentile(samples, args.high, axis=0)
    low, high = float(lows.min()), float(highs.max())
    report["stretch"] = {"low_percentile": args.low, "high_percentile": args.high, "per_band_low": [round(float(v), 4) for v in lows],
                         "per_band_high": [round(float(v), 4) for v in highs], "low": round(low, 4), "high": round(high, 4),
                         "gamma": args.gamma, "saturation": args.saturation}
    rgb = np.clip((refl - low) / (high - low), 0, 1) ** args.gamma
    del refl
    grey = rgb.mean(axis=-1, keepdims=True)
    rgb = np.clip(grey + (rgb - grey) * args.saturation, 0, 1)
    rgb[~valid] = 0
    print("stretch", report["stretch"], flush=True)

    # Preview of the whole window (about 1000 px wide).
    step = max(1, valid.shape[1] // 1000)
    preview = (rgb[::step, ::step] * 255).astype(np.uint8)
    Image.fromarray(preview).save(args.preview)

    # Pyramid.
    levels = [(rgb, valid)]
    while levels[-1][1].shape[0] > 64:
        levels.append(box2(*levels[-1]))
    print("pyramid", [lv[1].shape for lv in levels], flush=True)

    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    to_ll = Transformer.from_crs(epsg, 4326, always_xy=True)
    h, w = valid.shape
    corners = [to_ll.transform(x0 + cx * res, y0 - cy * res) for cx in (0, w) for cy in (0, h)]
    west, east = min(c[0] for c in corners), max(c[0] for c in corners)
    south, north = min(c[1] for c in corners), max(c[1] for c in corners)
    report["bounds"] = [round(west, 5), round(south, 5), round(east, 5), round(north, 5)]

    out = pathlib.Path(args.out)
    if out.exists():
        out.unlink()
    db = sqlite3.connect(out)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
    per_zoom = {}
    lum_samples = []
    for z in range(args.minzoom, args.maxzoom + 1):
        tx0, ty0 = tile_of(west, north, z)
        tx1, ty1 = tile_of(east, south, z)
        lat_mid = (south + north) / 2
        ground = 40075016.686 * math.cos(math.radians(lat_mid)) / (TILE * 2**z)  # metres per pixel
        k = max(0, min(len(levels) - 1, int(math.floor(math.log2(max(ground / res, 1.0))))))
        lrgb, lvalid = levels[k]
        lres = res * 2**k
        count = 0
        size = 0
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                lon, lat = lonlat_of_pixels(z, tx, ty)
                ux, uy = to_utm.transform(lon, lat)
                col = (ux - x0) / lres
                row = (y0 - uy) / lres
                sample, ok = bilinear(lrgb, lvalid, col, row)
                if not ok.any():
                    continue
                pixels = (np.clip(sample, 0, 1) * 255 + 0.5).astype(np.uint8)
                buffer = BytesIO()
                if ok.all():
                    Image.fromarray(pixels, "RGB").save(buffer, "WEBP", quality=args.quality, method=6)
                else:
                    alpha = np.where(ok, 255, 0).astype(np.uint8)[..., None]
                    Image.fromarray(np.concatenate([pixels, alpha], axis=-1), "RGBA").save(buffer, "WEBP", quality=args.quality, method=6)
                data = buffer.getvalue()
                db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, tx, (2**z - 1) - ty, data))
                count += 1
                size += len(data)
                if z == 13:
                    lum_samples.append(pixels[ok][::97])
        per_zoom[z] = {"tiles": count, "bytes": size, "ground_m_per_px": round(ground, 1), "source_level_m": lres}
        print(f"z{z}: {count} tiles, {size / 1e6:.2f} MB, {ground:.1f} m/px from the {lres:.0f} m level", flush=True)

    # The colours lines and labels sit on: the darkest and lightest 2% of z13 imagery pixels.
    colours = np.concatenate(lum_samples).astype(np.float64)
    lin = np.where(colours / 255 <= 0.03928, colours / 255 / 12.92, ((colours / 255 + 0.055) / 1.055) ** 2.4)
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    order = np.argsort(lum)
    pick = lambda q: colours[order[int(q * (len(order) - 1))]]
    hexcol = lambda c: "#" + "".join(f"{int(round(v)):02x}" for v in c)
    report["contrast_colours"] = {"dark_p02": hexcol(pick(0.02)), "median": hexcol(pick(0.5)), "light_p98": hexcol(pick(0.98)),
                                  "darkest": hexcol(pick(0.0)), "lightest": hexcol(pick(1.0))}
    print("imagery colours", report["contrast_colours"], flush=True)

    meta = {
        "name": "Kori imagery (Sentinel-2 true colour)",
        "format": "webp",
        "type": "baselayer",
        "version": "1",
        "bounds": ",".join(str(v) for v in report["bounds"]),
        "center": f"{(west + east) / 2:.5f},{(south + north) / 2:.5f},{args.minzoom + 3}",
        "minzoom": str(args.minzoom),
        "maxzoom": str(args.maxzoom),
        "attribution": "Contains modified Copernicus Sentinel data 2025",
        "description": f"Sentinel-2 L2A {log['item']}, bands 4-3-2, 10 m, stretched; private Kori pack",
    }
    db.executemany("INSERT INTO metadata VALUES (?, ?)", list(meta.items()))
    db.commit()
    db.close()
    report["zooms"] = per_zoom
    report["tiles"] = sum(v["tiles"] for v in per_zoom.values())
    report["tile_bytes"] = sum(v["bytes"] for v in per_zoom.values())
    report["mbtiles_bytes"] = out.stat().st_size
    report["seconds"] = round(time.time() - started, 1)
    pathlib.Path(args.report).write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("tiles", "tile_bytes", "mbtiles_bytes", "seconds")}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
