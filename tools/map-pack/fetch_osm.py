"""Fetch the OpenStreetMap data a park pack needs from the Overpass API, for one bounding box.

Writes raw Overpass JSON and a meta file into --out-dir, which must be a new, empty folder:
  ways.json      roads and tracks with node ids and geometry (for the routable graph)
  features.json  camps, gates, airstrips, named hills, water and wetlands (geometry), anything
                 with "rhino" in its name, and the protected areas that cross the box
  meta.json      endpoint, query text, fetch time, the OSM data timestamp, byte counts

Usage (run with python -I, from anywhere; paths are arguments):
  python -I fetch_osm.py --bbox S,W,N,E --out-dir <new empty folder>

The data is OpenStreetMap, ODbL 1.0: "© OpenStreetMap contributors". Overpass is a shared
service: two queries, a clear User-Agent, and waits on 429 or 504.
"""

import argparse
import datetime
import json
import pathlib
import sys
import time

import requests

ENDPOINT = "https://overpass-api.de/api/interpreter"
USER_AGENT = "kori-map-pack/0.1 (private offline pack build, low volume)"

HIGHWAYS = "track|unclassified|tertiary|secondary|primary|trunk|service|residential|road|path|footway|living_street"

WAYS = """[out:json][timeout:180][bbox:{bbox}];
way["highway"~"^({highways})$"];
out body geom;"""

FEATURES = """[out:json][timeout:180][bbox:{bbox}];
(
  nwr["tourism"~"^(camp_site|caravan_site|lodge|guest_house|hotel|chalet|information|viewpoint|picnic_site|wilderness_hut|attraction)$"];
  node["barrier"~"^(gate|lift_gate|entrance|border_control)$"];
  node["entrance"];
  nwr["aeroway"~"^(aerodrome|airstrip)$"];
  node["natural"~"^(peak|hill|rock)$"]["name"];
  nwr["natural"="water"];
  nwr["water"];
  nwr["natural"="wetland"];
  way["waterway"];
  nwr["landuse"="reservoir"];
  nwr["name"~"rhino",i];
  rel["boundary"~"^(national_park|protected_area)$"];
  rel["leisure"="nature_reserve"];
);
out body geom;"""


def run(query: str, tries: int = 8, wait: int = 40) -> requests.Response:
    last: object = None
    for _ in range(tries):
        try:
            response = requests.post(ENDPOINT, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=240)
            if response.status_code in (429, 502, 503, 504):
                print(f"HTTP {response.status_code}, waiting {wait}s", flush=True)
                last = response.status_code
                time.sleep(wait)
                continue
            response.raise_for_status()
            return response
        except requests.exceptions.ConnectionError as error:
            print(f"connection error {error.__class__.__name__}, waiting {wait}s", flush=True)
            last = error
            time.sleep(wait)
    raise RuntimeError(f"Overpass failed after {tries} tries: {last}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bbox", required=True, help="south,west,north,east in degrees")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    south, west, north, east = (float(v) for v in args.bbox.split(","))
    if not (south < north and west < east):
        parser.error("bbox must be south,west,north,east")
    out = pathlib.Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        parser.error(f"{out} is not empty; give a new, empty folder")

    bbox = f"{south},{west},{north},{east}"
    meta = {"endpoint": ENDPOINT, "bbox": [south, west, north, east], "licence": "ODbL 1.0", "credit": "© OpenStreetMap contributors", "queries": {}}
    for name, template in (("ways", WAYS), ("features", FEATURES)):
        query = template.format(bbox=bbox, highways=HIGHWAYS)
        started = time.time()
        response = run(query)
        data = response.json()
        (out / f"{name}.json").write_bytes(response.content)
        meta["queries"][name] = {
            "query": query,
            "fetched_utc": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
            "osm_base": data.get("osm3s", {}).get("timestamp_osm_base"),
            "bytes": len(response.content),
            "elements": len(data.get("elements", [])),
            "seconds": round(time.time() - started, 1),
        }
        print(name, {k: v for k, v in meta["queries"][name].items() if k != "query"}, flush=True)
        time.sleep(5)
    (out / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
