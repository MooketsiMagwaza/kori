/**
 * The private packs this computer offers (see lib/local-packs.ts). 404 unless KORI_LOCAL_PACKS_DIR
 * is set where the app runs, which it never is on a deployed build.
 */

import { listPacks } from "@/lib/local-packs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return listPacks();
}
