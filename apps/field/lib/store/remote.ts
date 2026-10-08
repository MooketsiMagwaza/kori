/**
 * Sending queued sightings to the Kori API.
 *
 * The API is not deployed yet, so NEXT_PUBLIC_KORI_API_URL is unset and send() reports "not
 * configured" without touching the network. The request shape below follows the planned API
 * (POST /v1/sightings with an Idempotency-Key, so a retry can never create a duplicate). It has not
 * been run against a server.
 */

import type { Sighting } from "@/shared/sample-sightings.ts";

export const API_URL = process.env.NEXT_PUBLIC_KORI_API_URL?.replace(/\/$/, "") ?? "";

export class SendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export async function sendSighting(sighting: Sighting, idempotencyKey: string): Promise<void> {
  if (!API_URL) throw new SendError("No Kori server is configured.", false);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/sightings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        species_id: sighting.speciesId,
        count: sighting.count,
        seen_at: sighting.seenAt,
        point: { lon: sighting.point[0], lat: sighting.point[1], accuracy_m: sighting.accuracyMeters ?? null },
        den_or_nest: Boolean(sighting.denOrNest),
        notes: sighting.notes ?? null,
      }),
    });
  } catch {
    throw new SendError("No connection.", false);
  }
  if (response.ok) return;
  const permanent = [400, 404, 409, 413, 422].includes(response.status);
  throw new SendError(`The server answered ${response.status}.`, permanent);
}
