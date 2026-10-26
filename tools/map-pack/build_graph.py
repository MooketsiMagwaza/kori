"""Build a park pack's routable track graph, boundary and water layer from Overpass JSON.

Output is the format `shared/routing.ts` and `shared/reserve.ts` use (a `Reserve`), so the field
app routes over real tracks with the same code as the sample reserve:

  graph.json     the Reserve: boundary (the park, clipped to the window), nodes (junctions, gates,
                 camps), edges (OSM ways split at every junction, with highway, surface,
                 tracktype, name, the way id, source "osm" and status "osm", shown as
                 "OSM, not verified" until GPS trips confirm an edge)
  water.geojson  water polygons and waterway lines, for keeping sample sightings off water
  rhino.geojson  every OSM feature in the window with "rhino" in its name (an exclusion list
                 for sample sightings; a name is not evidence of rhino, but nothing is assumed)
  graph-report.json  counts, lengths and what was left out and why

Rules:
  - Routable: highway track, unclassified, service, residential, road, tertiary and above.
    Paths and footways are not for vehicles and are left out of the graph (the base map still
    draws them).
  - access or motor_vehicle "no" or "private": never routed and left out of the graph, like
    the closed tracks in the sample reserve.
  - A way whose name or note tells drivers to avoid it keeps its edge, marked `caution`, and
    routing makes it four times as expensive (shared/routing.ts).
  - Ways are cut where they leave the window (keeping the first vertex outside, so a line
    reaches the edge) and split at every vertex shared with another routable way.
  - Predicted tracks: none. Nothing here is generated or inferred.

Usage: python -I build_graph.py --osm-dir <overpass download> --bbox S,W,N,E --out-dir <staging>
       --version 2026.10.26 [--id savuti --name "..." --park "Chobe National Park" --start-gate "Savuti Gate"]
"""

import argparse
import collections
import json
import math
import pathlib
import re
import sys

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping
from shapely.ops import linemerge, polygonize, unary_union

ROUTABLE = {"track", "unclassified", "service", "residential", "road", "tertiary", "tertiary_link", "secondary", "secondary_link", "primary", "primary_link", "trunk", "trunk_link", "living_street"}
CLOSED_VALUES = {"no", "private"}
AVOID = re.compile(r"\bavoid\b", re.IGNORECASE)
EARTH = 6_371_000.0


def distance(a, b) -> float:
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH * math.asin(math.sqrt(h))


def length(line) -> float:
    return sum(distance(line[i - 1], line[i]) for i in range(1, len(line)))


def r5(v: float) -> float:
    return round(v, 5)


def way_coords(way) -> list[tuple[float, float]]:
    return [(p["lon"], p["lat"]) for p in way.get("geometry") or [] if p]


def relation_polygons(rel) -> list[Polygon]:
    """Assemble a multipolygon relation's outer ring(s) from its member ways' geometry."""
    outers = []
    inners = []
    for member in rel.get("members", []):
        if member.get("type") != "way" or not member.get("geometry"):
            continue
        coords = [(p["lon"], p["lat"]) for p in member["geometry"] if p]
        if len(coords) < 2:
            continue
        (inners if member.get("role") == "inner" else outers).append(LineString(coords))
    polys = list(polygonize(linemerge(outers))) if outers else []
    holes = list(polygonize(linemerge(inners))) if inners else []
    shape = unary_union(polys) if polys else None
    if shape is None or shape.is_empty:
        return []
    if holes:
        shape = shape.difference(unary_union(holes))
    return list(shape.geoms) if isinstance(shape, MultiPolygon) else [shape]


def element_shape(element):
    """A polygon (closed way or multipolygon) or a line, from an Overpass element with geometry."""
    if element["type"] == "way":
        coords = way_coords(element)
        if len(coords) >= 4 and coords[0] == coords[-1]:
            return Polygon(coords)
        if len(coords) >= 2:
            return LineString(coords)
    if element["type"] == "relation":
        polys = relation_polygons(element)
        if polys:
            return unary_union(polys)
    return None


def centre_of(element):
    if element["type"] == "node":
        return (element["lon"], element["lat"])
    shape = element_shape(element)
    if shape is not None and not shape.is_empty:
        point = shape.representative_point()
        return (point.x, point.y)
    if "center" in element:
        return (element["center"]["lon"], element["center"]["lat"])
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--osm-dir", required=True)
    parser.add_argument("--bbox", required=True, help="south,west,north,east")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--id", default="savuti")
    parser.add_argument("--name", default="Savuti, Chobe National Park")
    parser.add_argument("--park", default="Chobe National Park", help="name of the protected area that forms the boundary")
    parser.add_argument("--start-gate", default="Savuti Gate", help="the gate a route starts from when you are outside the park")
    parser.add_argument("--version", required=True)
    args = parser.parse_args()

    south, west, north, east = (float(v) for v in args.bbox.split(","))
    window = box(west, south, east, north)
    osm = pathlib.Path(args.osm_dir)
    out = pathlib.Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ways_json = json.loads((osm / "ways.json").read_text(encoding="utf-8"))
    features_json = json.loads((osm / "features.json").read_text(encoding="utf-8"))
    meta = json.loads((osm / "meta.json").read_text(encoding="utf-8"))

    report = collections.OrderedDict()
    left_out = collections.Counter()
    routable = []
    for way in (e for e in ways_json["elements"] if e["type"] == "way"):
        tags = way.get("tags", {})
        highway = tags.get("highway")
        if highway not in ROUTABLE:
            left_out[f"highway={highway} (not for vehicles)"] += 1
            continue
        if tags.get("access") in CLOSED_VALUES or tags.get("motor_vehicle") in CLOSED_VALUES:
            left_out[f"access={tags.get('access')}, motor_vehicle={tags.get('motor_vehicle')} (closed)"] += 1
            continue
        if len(way.get("nodes", [])) != len(way.get("geometry", [])):
            left_out["geometry incomplete"] += 1
            continue
        routable.append(way)

    # Cut each way to the window: keep runs of vertices that are inside, plus one vertex either
    # side so the line reaches the window's edge.
    pieces = []
    for way in routable:
        coords = way_coords(way)
        inside = [window.contains(Point(c)) for c in coords]
        keep = [inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(inside) and inside[i + 1]) for i in range(len(coords))]
        run: list[int] = []
        for i, k in enumerate(keep + [False]):
            if k:
                run.append(i)
            elif run:
                if len(run) >= 2:
                    pieces.append((way, run))
                run = []
        if not any(inside):
            left_out["outside the window"] += 1

    # Split at vertices shared by two or more pieces, and at every piece's ends.
    use = collections.Counter()
    for way, run in pieces:
        for i in run:
            use[way["nodes"][i]] += 1
    nodes_at: dict[int, tuple[float, float]] = {}
    edges = []
    for way, run in pieces:
        tags = way.get("tags", {})
        ids = [way["nodes"][i] for i in run]
        coords = [way_coords(way)[i] for i in run]
        cut = [0] + [k for k in range(1, len(ids) - 1) if use[ids[k]] > 1] + [len(ids) - 1]
        for part, (a, b) in enumerate(zip(cut, cut[1:])):
            line = [(r5(x), r5(y)) for x, y in coords[a : b + 1]]
            # Drop repeated vertices that rounding can create.
            line = [p for i, p in enumerate(line) if i == 0 or p != line[i - 1]]
            if len(line) < 2:
                continue
            nodes_at[ids[a]] = line[0]
            nodes_at[ids[b]] = line[-1]
            caution = None
            for key in ("name", "note", "description"):
                if tags.get(key) and AVOID.search(tags[key]):
                    caution = f'OSM {key}: "{tags[key]}"'
            edge = {
                "id": f"w{way['id']}-{part}",
                "from": f"n{ids[a]}",
                "to": f"n{ids[b]}",
                "line": [list(p) for p in line],
                "status": "osm",
                "source": "osm",
                "osmWayId": way["id"],
                "highway": tags.get("highway"),
                "lengthMeters": round(length(line)),
            }
            for key in ("surface", "tracktype", "name", "smoothness", "access"):
                if tags.get(key):
                    edge[key if key != "access" else "access"] = tags[key]
            if caution:
                edge["caution"] = caution
            edges.append(edge)

    # Keep the largest connected part routable as one network; report the rest (they are still
    # drawn and routable within themselves).
    adjacency = collections.defaultdict(set)
    for edge in edges:
        adjacency[edge["from"]].add(edge["to"])
        adjacency[edge["to"]].add(edge["from"])
    seen: set[str] = set()
    components = []
    for start in adjacency:
        if start in seen:
            continue
        stack, comp = [start], set()
        while stack:
            node = stack.pop()
            if node in comp:
                continue
            comp.add(node)
            stack.extend(adjacency[node] - comp)
        seen |= comp
        components.append(comp)
    components.sort(key=len, reverse=True)

    junction_nodes = [{"id": f"n{osm_id}", "at": list(at), "kind": "junction"} for osm_id, at in nodes_at.items()]

    # The park boundary, clipped to the window.
    elements = features_json["elements"]
    boundary_shape = None
    protected = []
    for element in elements:
        tags = element.get("tags", {})
        if element["type"] == "relation" and (tags.get("boundary") in ("national_park", "protected_area") or tags.get("leisure") == "nature_reserve"):
            protected.append(tags.get("name"))
            if tags.get("name") == args.park:
                polys = relation_polygons(element)
                if polys:
                    boundary_shape = unary_union(polys).intersection(window)
    if boundary_shape is None or boundary_shape.is_empty:
        print(f"warning: no boundary for {args.park!r}; using the window", file=sys.stderr)
        boundary_shape = window
    parts = list(boundary_shape.geoms) if hasattr(boundary_shape, "geoms") else [boundary_shape]
    parts = [p for p in parts if isinstance(p, Polygon)]
    largest = max(parts, key=lambda p: p.area)
    ring = [[r5(x), r5(y)] for x, y in largest.exterior.coords]

    # Gates and camps, for labels and for the "route from the gate" fallback.
    places = []
    rhino = []
    water_features = []
    for element in elements:
        tags = element.get("tags", {})
        name = tags.get("name")
        if name and re.search("rhino", name, re.IGNORECASE):
            at = centre_of(element)
            if at:
                rhino.append({"type": "Feature", "properties": {"name": name, "osm": f"{element['type']}/{element['id']}", "tags": tags}, "geometry": {"type": "Point", "coordinates": [r5(at[0]), r5(at[1])]}})
        is_water = tags.get("natural") == "water" or "water" in tags or tags.get("landuse") == "reservoir" or "waterway" in tags
        if is_water:
            shape = element_shape(element)
            if shape is not None and not shape.is_empty:
                kind = "line" if isinstance(shape, LineString) else "area"
                if kind == "line" and tags.get("waterway") not in ("river", "canal", "stream", "drain", "ditch"):
                    continue
                water_features.append({"type": "Feature", "properties": {"name": name, "kind": kind, "waterway": tags.get("waterway"), "osm": f"{element['type']}/{element['id']}"}, "geometry": mapping(shape)})
        if not name:
            continue
        at = centre_of(element)
        if not at or not window.contains(Point(at)):
            continue
        gate = tags.get("barrier") in ("gate", "lift_gate", "entrance", "border_control") or "entrance" in tags or re.search(r"\bgate\b", name, re.IGNORECASE)
        camp = tags.get("tourism") in ("camp_site", "caravan_site", "lodge", "hotel", "chalet", "guest_house", "wilderness_hut")
        if gate:
            places.append({"id": f"g{element['id']}", "at": [r5(at[0]), r5(at[1])], "kind": "gate", "name": name})
        elif camp:
            places.append({"id": f"c{element['id']}", "at": [r5(at[0]), r5(at[1])], "kind": "camp", "name": name})
    # One place per name (OSM often has a node and an area for the same camp).
    unique = {}
    for place in places:
        unique.setdefault((place["kind"], place["name"]), place)
    # The gate routes start from when you are outside the park comes first (the app takes the
    # first gate node).
    places = sorted(unique.values(), key=lambda p: (p["kind"] != "gate", p["name"] != args.start_gate, p["kind"], p["name"]))

    total_km = sum(e["lengthMeters"] for e in edges) / 1000
    by_highway = collections.Counter()
    for e in edges:
        by_highway[e["highway"]] += e["lengthMeters"] / 1000
    report["osm_base"] = meta["queries"]["ways"]["osm_base"]
    report["ways_routable"] = len(routable)
    report["left_out"] = dict(left_out)
    report["edges"] = len(edges)
    report["junctions"] = len(junction_nodes)
    report["km_total"] = round(total_km, 1)
    report["km_by_highway"] = {k: round(v, 1) for k, v in by_highway.most_common()}
    report["components"] = [len(c) for c in components[:10]]
    report["components_count"] = len(components)
    report["largest_component_share_of_nodes"] = round(len(components[0]) / max(1, len(adjacency)), 3) if components else 0
    report["edges_with_caution"] = [e["id"] + " " + e["caution"] for e in edges if e.get("caution")]
    report["places"] = [f"{p['kind']}: {p['name']}" for p in places]
    report["protected_areas_crossing_window"] = sorted(n for n in protected if n)
    report["boundary"] = {"park": args.park, "parts_in_window": len(parts), "ring_vertices": len(ring), "share_of_window": round(largest.area / window.area, 3)}
    report["rhino_named_features"] = [f["properties"]["name"] + " " + f["properties"]["osm"] for f in rhino]
    report["water_features"] = len(water_features)

    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    graph = {
        "id": args.id,
        "name": args.name,
        "version": args.version,
        "kind": "real",
        "notice": "Real map, private pack. Tracks are from OpenStreetMap and not verified by Kori: they may be missing, misplaced or closed. Follow park rules and signs, and drive only on tracks.",
        "centre": [r5((west + east) / 2), r5((south + north) / 2)],
        "bounds": [west, south, east, north],
        "boundaryBounds": [min(lons), min(lats), max(lons), max(lats)],
        "boundary": ring,
        "pans": [],
        "river": [],
        "nodes": junction_nodes + places,
        "edges": edges,
        "source": {"osm": {"licence": "ODbL 1.0", "credit": "© OpenStreetMap contributors", "osm_base": report["osm_base"], "endpoint": meta["endpoint"]}},
    }
    (out / "graph.json").write_text(json.dumps(graph, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (out / "water.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": water_features}, ensure_ascii=False), encoding="utf-8")
    (out / "rhino.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": rhino}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "graph-report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
