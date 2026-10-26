/**
 * One file of a private pack (see lib/local-packs.ts). The phone downloads each file once into its
 * own storage and draws from there; nothing here is cached by the service worker.
 */

import { packFile } from "@/lib/local-packs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ pack: string; file: string }> }) {
  const { pack, file } = await context.params;
  return packFile(pack, file);
}
