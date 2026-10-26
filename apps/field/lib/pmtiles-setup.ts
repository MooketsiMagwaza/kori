/**
 * MapLibre reads a real park pack's PMTiles files from the phone's own storage through the
 * `pmtiles://` protocol. Each stored file is registered under a key; the map's source URL is
 * `pmtiles://<key>`, and every tile request is answered by BlobSource with a byte range of the
 * stored file. Nothing goes to the network.
 */

import { addProtocol } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { BlobSource } from "@/lib/pack-files";

let protocol: Protocol | null = null;

function shared(): Protocol {
  if (!protocol) {
    protocol = new Protocol({ metadata: true });
    addProtocol("pmtiles", protocol.tile as Parameters<typeof addProtocol>[1]);
  }
  return protocol;
}

/** Register a stored PMTiles file and return the URL a MapLibre source uses for it. */
export function registerPackFile(key: string, blob: Blob): string {
  shared().add(new PMTiles(new BlobSource(blob, key)));
  return `pmtiles://${key}`;
}
