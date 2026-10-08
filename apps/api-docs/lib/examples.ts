/**
 * Example requests and responses for the docs, built from the shared sample data through the same
 * publication rules the app uses (areas, delays, sensitive species). The API server itself is not
 * deployed yet; these show the planned shape, labelled as sample data.
 */

import { visibleEdges, sampleReserve } from "@/shared/reserve";
import { publicSightings, sampleSightings } from "@/shared/sample-sightings";
import { RULES } from "@/shared/rules";
import { SPECIES } from "@/shared/species";

export const NOW = new Date("2026-10-07T15:00:00Z");
export const BASE_URL = "https://api.kori.example/v1";

const json = (value: unknown) => JSON.stringify(value, null, 2);

function wireSighting(s: ReturnType<typeof publicSightings>[number]) {
  return {
    id: s.id,
    species: s.speciesId,
    count: s.count,
    seen_at: s.seenAt,
    area: { cell: s.cell.id, centre: { lon: s.cell.centre[0], lat: s.cell.centre[1] }, size_m: s.cell.sizeMeters },
    sensitive: s.sensitive,
  };
}

export function listSightingsExample() {
  const visible = publicSightings(sampleSightings(NOW), NOW);
  return json({ data: visible.slice(0, 2).map(wireSighting), next_cursor: "c2FtcGxlLTAz", sample: true });
}

export function sensitiveExample() {
  const visible = publicSightings(sampleSightings(NOW), NOW).find((s) => s.sensitive);
  return visible ? json(wireSighting(visible)) : "{}";
}

export function oneSightingExample() {
  const first = publicSightings(sampleSightings(NOW), NOW)[0];
  return json({ ...wireSighting(first), sample: true });
}

export function speciesExample() {
  return json({
    data: SPECIES.slice(0, 2)
      .concat(SPECIES.filter((s) => s.sensitivity === "sensitive").slice(0, 1))
      .map((s) => ({ id: s.id, common_name: s.common, setswana_name: s.setswana ?? null, scientific_name: s.scientific, tier: s.sensitivity, area_m: RULES[s.sensitivity].cellMeters, delay_minutes: RULES[s.sensitivity].delayMinutes })),
  });
}

export function tracksExample() {
  const edge = visibleEdges(sampleReserve(), { predicted: false }).find((e) => e.status === "gps") ?? visibleEdges(sampleReserve(), { predicted: false })[0];
  return json({
    type: "FeatureCollection",
    license: "ODbL-1.0",
    attribution: "Kori contributors; includes data from OpenStreetMap contributors where noted",
    sample: true,
    features: [
      {
        type: "Feature",
        properties: { id: edge.id, status: edge.status, trips: edge.trips ?? null, length_m: edge.lengthMeters },
        geometry: { type: "LineString", coordinates: edge.line.slice(0, 3) },
      },
    ],
  });
}

export const ERROR_EXAMPLE = json({ error: { code: "rate_limited", message: "Hourly limit of 600 requests reached for this key.", retry_after_s: 1260 }, request_id: "req_sample_8f2c" });
