"""Read a window of one Sentinel-2 L2A scene from the public AWS bucket, found through the Earth
Search STAC catalogue, by HTTP range requests (only the 1024 x 1024 blocks the window touches).

Bands: B04, B03, B02 (red, green, blue, 10 m) and SCL (scene classification, 20 m, used to mask
cloud, shadow and no data). Each is saved as a .npy array in --out-dir, which must be a new,
empty folder, with item.json (the STAC item) and fetch-log.json (exact bytes per band, timings).

The window is given in the scene's own projection (UTM, metres) and should be block-aligned, so
no byte is read that is not used. Before reading anything the script adds up the compressed size
of every block it would read, from the file's tile index, and stops if that exceeds --budget-mb.

Usage (python -I; paths are arguments):
  python -I fetch_s2.py --item S2B_34KHE_20250802_0_L2A --utm-window X0,Y0,X1,Y1 --out-dir <new folder> [--budget-mb 105] [--dry-run]

Licence: Copernicus Sentinel data, free for any use; credit "Contains modified Copernicus
Sentinel data 2025" on anything made from it.
"""

import argparse
import datetime
import io
import json
import pathlib
import sys
import time

import numpy as np
import rasterio
import requests

STAC = "https://earth-search.aws.element84.com/v1"
BANDS = [("red", "B04"), ("green", "B03"), ("blue", "B02"), ("scl", "SCL")]


class ByteCounter:
    """Every byte and request the range reader makes."""

    def __init__(self) -> None:
        self.bytes = 0
        self.requests = 0


class HttpRangeFile(io.RawIOBase):
    """A read-only, seekable file over HTTP range requests, for rasterio's `opener`.

    The rasterio wheel's own curl uses Windows schannel, which fails here when it cannot reach a
    certificate revocation server. `requests` verifies certificates with OpenSSL and certifi, so
    GDAL decodes the blocks while every byte comes through this class (and is counted).
    """

    def __init__(self, url: str, session: requests.Session, counter: ByteCounter) -> None:
        super().__init__()
        self.url, self.session, self.counter, self.pos = url, session, counter, 0
        head = session.head(url, timeout=60)
        if head.status_code in (403, 404):
            raise FileNotFoundError(url)
        head.raise_for_status()
        self.size = int(head.headers["Content-Length"])

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        self.pos = {io.SEEK_SET: offset, io.SEEK_CUR: self.pos + offset, io.SEEK_END: self.size + offset}[whence]
        return self.pos

    def read(self, size: int = -1) -> bytes:
        if self.pos >= self.size:
            return b""
        end = self.size if size is None or size < 0 else min(self.size, self.pos + size)
        for attempt in range(4):
            try:
                response = self.session.get(self.url, headers={"Range": f"bytes={self.pos}-{end - 1}"}, timeout=120)
                response.raise_for_status()
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
        data = response.content
        self.counter.bytes += len(data)
        self.counter.requests += 1
        self.pos += len(data)
        return data

    def readinto(self, buffer) -> int:  # type: ignore[override]
        data = self.read(len(buffer))
        buffer[: len(data)] = data
        return len(data)


def make_opener(session: requests.Session, counter: ByteCounter):
    def opener(path: str, mode: str = "rb", **_kwds):
        if "r" not in mode:
            raise PermissionError("read only")
        url = str(path).replace("\\", "/")
        # rasterio may hand back the URL with its double slash folded by path handling.
        for scheme in ("https:", "http:"):
            if url.startswith(scheme) and not url.startswith(scheme + "//"):
                url = scheme + "//" + url[len(scheme):].lstrip("/")
        if not url.startswith("https://"):
            raise FileNotFoundError(url)
        return HttpRangeFile(url, session, counter)

    return opener


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--item", required=True, help="Earth Search item id in the sentinel-2-l2a collection")
    parser.add_argument("--utm-window", required=True, help="x0,y0,x1,y1 in the scene's UTM metres")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--budget-mb", type=float, default=105.0)
    parser.add_argument("--dry-run", action="store_true", help="report the bytes the read would need, read nothing")
    args = parser.parse_args()

    x0, y0, x1, y1 = (float(v) for v in args.utm_window.split(","))
    out = pathlib.Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if not args.dry_run and any(out.iterdir()):
        parser.error(f"{out} is not empty; give a new, empty folder")

    item = requests.get(f"{STAC}/collections/sentinel-2-l2a/items/{args.item}", timeout=60)
    item.raise_for_status()
    item_json = item.json()
    props = item_json["properties"]
    print("scene", args.item, props["datetime"], "cloud", props.get("eo:cloud_cover"), "nodata", props.get("s2:nodata_pixel_percentage"), flush=True)

    counter = ByteCounter()
    session = requests.Session()
    session.headers["User-Agent"] = "kori-map-pack/0.1 (private offline pack build)"
    opener = make_opener(session, counter)
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", VSI_CACHE="FALSE")

    plan = {}
    with env:
        for key, name in BANDS:
            href = item_json["assets"][key]["href"]
            with rasterio.open(href, opener=opener) as src:
                window = src.window(x0, y0, x1, y1).round_offsets().round_lengths()
                bh, bw = src.block_shapes[0]
                r0, c0 = int(window.row_off) // bh, int(window.col_off) // bw
                r1 = (int(window.row_off + window.height) - 1) // bh
                c1 = (int(window.col_off + window.width) - 1) // bw
                block_bytes = sum(src.block_size(1, i, j) for i in range(r0, r1 + 1) for j in range(c0, c1 + 1))
                aligned = window.row_off % bh == 0 and window.col_off % bw == 0 and window.height % bh == 0 and window.width % bw == 0
                plan[name] = {
                    "href": href,
                    "res_m": src.transform.a,
                    "crs": str(src.crs),
                    "window_col_row_w_h": [int(window.col_off), int(window.row_off), int(window.width), int(window.height)],
                    "blocks": (r1 - r0 + 1) * (c1 - c0 + 1),
                    "block_aligned": bool(aligned),
                    "block_bytes": int(block_bytes),
                }
                print(name, {k: v for k, v in plan[name].items() if k != "href"}, flush=True)
    header_bytes = counter.bytes
    total_mb = sum(p["block_bytes"] for p in plan.values()) / 1e6
    print(f"blocks to read: {total_mb:.1f} MB (budget {args.budget_mb} MB); file headers already read: {header_bytes / 1e6:.2f} MB", flush=True)
    if total_mb > args.budget_mb:
        print("over budget: stopping without reading any block", flush=True)
        return 3
    if args.dry_run:
        return 0

    log = {"item": args.item, "datetime": props["datetime"], "cloud_cover": props.get("eo:cloud_cover"), "nodata_pct": props.get("s2:nodata_pixel_percentage"),
           "utm_window": [x0, y0, x1, y1], "started_utc": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"), "bands": {}}
    (out / "item.json").write_text(json.dumps(item_json, indent=1), encoding="utf-8")
    with env:
        for key, name in BANDS:
            before = counter.bytes
            started = time.time()
            with rasterio.open(plan[name]["href"], opener=opener) as src:
                window = src.window(x0, y0, x1, y1).round_offsets().round_lengths()
                array = src.read(1, window=window)
                transform = src.window_transform(window)
            np.save(out / f"{name}.npy", array)
            log["bands"][name] = {**plan[name], "downloaded_bytes": counter.bytes - before, "seconds": round(time.time() - started, 1),
                                  "transform": list(transform)[:6], "shape": list(array.shape), "dtype": str(array.dtype)}
            print(name, "read", array.shape, f"{(counter.bytes - before) / 1e6:.1f} MB", f"{time.time() - started:.0f}s", flush=True)
    log["total_downloaded_mb"] = round(counter.bytes / 1e6, 1)
    log["range_requests"] = counter.requests
    log["finished_utc"] = datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds")
    (out / "fetch-log.json").write_text(json.dumps(log, indent=1), encoding="utf-8")
    print("total downloaded", log["total_downloaded_mb"], "MB in", counter.requests, "range requests", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
