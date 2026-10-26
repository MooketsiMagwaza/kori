"""Assemble a private park pack from the downloads, and write its manifest and build log.

The downloads come first, each into its own new, empty folder (see docs/REAL_MAP.md):
  pmtiles extract <Protomaps daily build> base.pmtiles --bbox=W,S,E,N   (the vector base map)
  python -I fetch_osm.py --bbox S,W,N,E --out-dir <osm folder>          (tracks, places, water)
  python -I fetch_s2.py --item <scene> --utm-window ... --out-dir <s2 folder>

This script then builds, timing each step:
  graph.json, water.geojson, rhino.geojson   build_graph.py
  sightings.json                             place-sightings.ts (Node)
  imagery.mbtiles -> imagery.pmtiles         build_imagery.py, then `pmtiles convert`
  base.pmtiles                               copied from the extract
  manifest.json                              files with sizes and SHA-256, sources and their
                                             dates, licences, credits, the graph and imagery
                                             summaries, and the timings
  build-log.txt                              every step's output

The pack folder (--out-dir) must be outside the repository. The field app serves it only from
the folder named by KORI_LOCAL_PACKS_DIR on the machine running `next start`, and never from a
deployed build. A real park pack must not be published: covering a park publicly waits for DWNP.

Usage:
  python -I build.py --out-dir <packs>/savuti --base <extract>/savuti-base.pmtiles --extract-log <extract folder>
      --osm-dir <osm folder> --s2-dir <s2 folder> --pmtiles <pmtiles.exe> --bbox S,W,N,E
      --core W,S,E,N --version 2026.10.26 [--id savuti --name "..." --python <venv python>]
"""

import argparse
import datetime
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
SERVED = ["manifest.json", "base.pmtiles", "imagery.pmtiles", "graph.json", "sightings.json"]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--base", required=True, help="the extracted vector base map (.pmtiles)")
    parser.add_argument("--extract-log", required=True, help="folder holding extract.log, extract-started.txt, extract-finished.txt")
    parser.add_argument("--build-url", default="https://build.protomaps.com/20261025.pmtiles")
    parser.add_argument("--osm-dir", required=True)
    parser.add_argument("--s2-dir", required=True)
    parser.add_argument("--pmtiles", required=True, help="path to the pmtiles CLI")
    parser.add_argument("--bbox", required=True, help="south,west,north,east of the pack")
    parser.add_argument("--core", required=True, help="west,south,east,north box the sample sightings stay inside")
    parser.add_argument("--version", required=True)
    parser.add_argument("--id", default="savuti")
    parser.add_argument("--name", default="Savuti, Chobe National Park")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()

    out = pathlib.Path(args.out_dir).resolve()
    if REPO in out.parents or out == REPO:
        parser.error("the pack folder must be outside the repository")
    out.mkdir(parents=True, exist_ok=True)
    work = out / "build"
    work.mkdir(exist_ok=True)
    log_lines: list[str] = []
    timings: dict[str, float] = {}

    def step(name: str, command: list[str]) -> None:
        started = time.time()
        log_lines.append(f"\n## {name}\n$ {' '.join(command)}\n")
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
        log_lines.append(result.stdout)
        if result.stderr.strip():
            log_lines.append(result.stderr)
        timings[name] = round(time.time() - started, 1)
        log_lines.append(f"-> exit {result.returncode} in {timings[name]} s\n")
        print(f"{name}: exit {result.returncode} in {timings[name]} s", flush=True)
        if result.returncode != 0:
            (out / "build-log.txt").write_text("".join(log_lines), encoding="utf-8")
            raise SystemExit(f"{name} failed; see {out / 'build-log.txt'}")

    py = [args.python, "-I"]
    step("graph", py + [str(HERE / "build_graph.py"), "--osm-dir", args.osm_dir, "--bbox", args.bbox, "--out-dir", str(work), "--version", args.version, "--id", args.id, "--name", args.name])
    step("sightings", [args.node, str(HERE / "place-sightings.ts"), "--graph", str(work / "graph.json"), "--water", str(work / "water.geojson"), "--rhino", str(work / "rhino.geojson"), "--core", args.core, "--out", str(work / "sightings.json")])
    step("imagery", py + [str(HERE / "build_imagery.py"), "--s2-dir", args.s2_dir, "--out", str(work / "imagery.mbtiles"), "--preview", str(work / "imagery-preview.png"), "--report", str(work / "imagery-report.json")])
    if (work / "imagery.pmtiles").exists():
        (work / "imagery.pmtiles").unlink()
    step("imagery to PMTiles", [args.pmtiles, "convert", str(work / "imagery.mbtiles"), str(work / "imagery.pmtiles")])
    step("verify imagery", [args.pmtiles, "verify", str(work / "imagery.pmtiles")])
    step("verify base", [args.pmtiles, "verify", args.base])

    started = time.time()
    shutil.copyfile(args.base, out / "base.pmtiles")
    for name in ("graph.json", "sightings.json", "imagery.pmtiles"):
        shutil.copyfile(work / name, out / name)
    timings["copy"] = round(time.time() - started, 1)

    extract_dir = pathlib.Path(args.extract_log)
    osm_meta = json.loads((pathlib.Path(args.osm_dir) / "meta.json").read_text(encoding="utf-8"))
    s2_log = json.loads((pathlib.Path(args.s2_dir) / "fetch-log.json").read_text(encoding="utf-8"))
    graph_report = json.loads((work / "graph-report.json").read_text(encoding="utf-8"))
    imagery_report = json.loads((work / "imagery-report.json").read_text(encoding="utf-8"))
    sightings = json.loads((work / "sightings.json").read_text(encoding="utf-8"))
    graph = json.loads((work / "graph.json").read_text(encoding="utf-8"))
    pmtiles_version = subprocess.run([args.pmtiles, "version"], capture_output=True, text=True).stdout.strip()

    files = []
    for name, role in (("base.pmtiles", "base"), ("imagery.pmtiles", "imagery"), ("graph.json", "graph"), ("sightings.json", "sightings")):
        path = out / name
        files.append({"name": name, "role": role, "bytes": path.stat().st_size, "sha256": sha256(path)})
    downloads = {
        "base_extract_seconds": None,
        "osm_seconds": round(sum(q["seconds"] for q in osm_meta["queries"].values()), 1),
        "osm_bytes": sum(q["bytes"] for q in osm_meta["queries"].values()),
        "sentinel2_mb": s2_log["total_downloaded_mb"],
        "sentinel2_seconds": round(sum(b["seconds"] for b in s2_log["bands"].values()), 1),
    }
    try:
        t0 = datetime.datetime.fromisoformat((extract_dir / "extract-started.txt").read_text().strip().replace("Z", "+00:00"))
        t1 = datetime.datetime.fromisoformat((extract_dir / "extract-finished.txt").read_text().strip().replace("Z", "+00:00"))
        downloads["base_extract_seconds"] = (t1 - t0).total_seconds()
    except (OSError, ValueError):
        pass

    manifest = {
        "format": "kori-pack/1",
        "id": args.id,
        "name": args.name,
        "version": args.version,
        "kind": "real",
        "private": True,
        "notice": "Private development pack. Not for publication: covering a real park publicly waits for the Department of Wildlife and National Parks. Tracks are OpenStreetMap's and not verified by Kori. Sightings are sample data.",
        "built_utc": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
        "bounds": graph["bounds"],
        "centre": graph["centre"],
        "imageryBounds": imagery_report["bounds"],
        "files": files,
        "totalBytes": sum(f["bytes"] for f in files),
        "credits": ["© OpenStreetMap contributors", "Contains modified Copernicus Sentinel data 2025"],
        "licences": {
            "base.pmtiles": "ODbL 1.0 (a Produced Work of the Protomaps basemap, from OpenStreetMap)",
            "graph.json": "ODbL 1.0 (derived from OpenStreetMap)",
            "imagery.pmtiles": "Copernicus Sentinel data, free for any use with the credit above (modified: stretched and reprojected)",
            "sightings.json": "Kori sample data (positions placed on OpenStreetMap tracks)",
        },
        "sources": [
            {"what": "vector base map", "source": "Protomaps basemap daily build", "url": args.build_url, "schema": "v4", "osm_replication": "2026-10-25T04:00:00Z",
             "tool": pmtiles_version, "licence": "ODbL 1.0", "terms": "docs.protomaps.com/basemaps/downloads: ODbL Produced Work, OpenStreetMap attribution required; hotlinking discouraged, so the region is extracted once"},
            {"what": "tracks, places, water, park boundary", "source": "OpenStreetMap via the Overpass API", "url": osm_meta["endpoint"],
             "osm_base": {k: v["osm_base"] for k, v in osm_meta["queries"].items()}, "fetched_utc": {k: v["fetched_utc"] for k, v in osm_meta["queries"].items()}, "licence": "ODbL 1.0"},
            {"what": "satellite imagery", "source": "Sentinel-2 L2A, AWS open data (sentinel-cogs) via the Earth Search STAC catalogue", "scene": s2_log["item"], "acquired": s2_log["datetime"],
             "cloud_cover_pct": s2_log["cloud_cover"], "bands": "B04, B03, B02 at 10 m; SCL at 20 m for the mask", "bytes_read_mb": s2_log["total_downloaded_mb"],
             "fetched_utc": s2_log["finished_utc"], "licence": "Copernicus Sentinel data terms: free, with credit"},
        ],
        "imagery": {"zooms": imagery_report["zooms"], "stretch": imagery_report["stretch"], "contrastColours": imagery_report["contrast_colours"],
                    "note": "10 m pixels: soft from zoom 14; tracks a few metres wide are mostly not visible. Context only, never a track source."},
        "graph": {k: graph_report[k] for k in ("edges", "junctions", "km_total", "km_by_highway", "components_count", "left_out", "edges_with_caution", "boundary")},
        "sightings": {"count": sightings["count"], "label": sightings["label"], "rules": sightings["rules"], "assumptions": sightings["assumptions"], "keepClear": sightings["keepClear"]},
        "timings_seconds": {"downloads": downloads, "build": timings, "build_total": round(sum(timings.values()), 1)},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    log_lines.insert(0, f"# Kori pack build: {args.id} {args.version}, {manifest['built_utc']}\n")
    log_lines.append(f"\n## files\n" + "\n".join(f"{f['name']}: {f['bytes']:,} bytes, sha256 {f['sha256']}" for f in files) + f"\ntotal {manifest['totalBytes']:,} bytes\n")
    (out / "build-log.txt").write_text("".join(log_lines), encoding="utf-8")
    print(json.dumps({"files": [(f["name"], f["bytes"]) for f in files], "total": manifest["totalBytes"], "timings": timings}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
