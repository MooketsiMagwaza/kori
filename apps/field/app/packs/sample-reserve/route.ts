/**
 * The sample reserve pack, served as one JSON file. Built once at build time from the same seeded
 * generator the rest of the app uses. A real pack will be a PMTiles file per park (KO-09); this one
 * is small, vector only and fictional.
 */

import { sampleReserve } from "@/shared/reserve";

export const dynamic = "force-static";

export function GET() {
  return Response.json(sampleReserve(), { headers: { "Cache-Control": "public, max-age=3600" } });
}
