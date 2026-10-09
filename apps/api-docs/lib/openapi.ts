/**
 * The keyed public API as the API itself describes it: content/openapi.json is exported from the
 * FastAPI app by api/scripts/export_openapi.py, and an API test fails when it is out of date.
 */

import document from "@/content/openapi.json";

export type Operation = { method: string; path: string; summary: string; operationId: string; responses: string[] };

type PathItem = Record<string, { summary?: string; operationId?: string; responses?: Record<string, unknown> }>;

export const OPENAPI_VERSION: string = document.info.version;

export const OPERATIONS: Operation[] = Object.entries(document.paths as Record<string, PathItem>).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({
    method: method.toUpperCase(),
    path,
    summary: op.summary ?? "",
    operationId: op.operationId ?? "",
    responses: Object.keys(op.responses ?? {}),
  })),
);
