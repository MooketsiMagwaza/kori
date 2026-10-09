# Security

## State

Kori is a private prototype. The web apps run with sample data; the API is a scaffold that passes
its tests and runs its migrations on PostGIS in CI, but has not been deployed. Report a
vulnerability privately to the repository owner, never in a public issue.

## Defences in the code today

Most of these come from the owner's earlier platform (see `PROVENANCE.md`) and are covered by its
tests, which pass in Kori.

- SQLAlchemy parameter binding everywhere; no user input is formatted into SQL.
- Pydantic validation with length and range limits; free text is normalised to plain text.
- PBKDF2-SHA256 password hashing with per-password salts; session, API-key and reset tokens are
  stored only as SHA-256 digests (`kori_live_`, `kori_session_`, `kori_reset_` prefixes).
- Scoped API keys (`sightings:read`, `species:read`, `tracks:read`) with hourly limits, monthly
  quotas, expiry, rotation lineage and a gate on repeated invalid keys.
- A shared throttle for sign-in, recovery, sighting submission and trip sharing.
- JSON-only request bodies with a size ceiling; `nosniff`, frame denial, referrer and permissions
  headers on the API and every web app.
- An append-only audit log, and review decisions that the database refuses to edit.
- Outbound HTTP only to an exact host allowlist, with DNS and IP checks, redirect checks, timeouts
  and response-size limits.
- Administrator access needs a multi-factor identity-provider session in production.
- In production the API refuses to start with the local token secret or sandbox key.

## Kori-specific protections

- **Animals:** the exact point of a sighting is never in a public response; sightings are
  published only after review and a delay, as a 1 km or 10 km cell; sensitive species get no
  guidance and no QR share; a not-yet-public sighting answers 404. See
  `docs/SAFETY_AND_PRIVACY.md` and `docs/adr/0003-sightings-are-delayed-and-coarse.md`.
- **People:** GPS trips are trimmed again on the server, held back, and deleted on expiry; photos
  are redrawn on the phone, which strips their location metadata.
- **QR codes:** the scanner opens only valid Kori codes; anything else is shown as text, never
  followed.

## Required before any public launch

- A security review of the copied platform code and the new domain code (KO-14).
- HTTPS, HSTS and a nonce-based Content Security Policy on every app. The field app uses
  `dangerouslySetInnerHTML` in two places only: the inline theme script (a constant) and the QR code
  SVG generated on the phone from Kori's own link.
- Rate limits in a shared store (Redis or the gateway), not process memory.
- `Origin` checks and CSRF protection for cookie-authenticated mutations.
- A data-protection review under Botswana's Data Protection Act, 2024, and the sensitive-species
  list agreed with the Department of Wildlife and National Parks.

## Automated checks

CI runs the name gate, ruff, pytest, migrations on PostGIS, and lint, typecheck and build for each
app. The security workflow runs a Trivy secret and misconfiguration scan, `pip-audit`, and
`npm audit` (runtime dependencies must be clean). Dependabot proposes monthly grouped updates.
