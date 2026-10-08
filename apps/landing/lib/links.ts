/**
 * Where the landing page links to. Set these in the hosting project's environment variables once
 * the other apps are deployed (see docs/DEPLOY.md). Until then the buttons point at the status
 * section, which says plainly what is and is not live.
 */

export const FIELD_APP_URL = process.env.NEXT_PUBLIC_FIELD_APP_URL || "#status";
export const API_DOCS_URL = process.env.NEXT_PUBLIC_API_DOCS_URL || "#status";
export const FIELD_APP_LIVE = Boolean(process.env.NEXT_PUBLIC_FIELD_APP_URL);
