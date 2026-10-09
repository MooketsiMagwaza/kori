# Kori: instructions for working in this repository

Kori is an offline-first safari and wildlife app for Botswana: log sightings with no signal, a
review queue, a keyed API for approved sightings, offline park packs, guidance along tracks, QR
sharing. Owner: Mooketsi Vincent Magwaza. Private repository, all rights reserved; the owner alone
decides when it goes public.

## Layout and commands

- `apps/field` (3100), `apps/landing` (3000), `apps/review` (3300), `apps/api-docs` (3400): Next.js 16.
  In each: `npm ci`, `npm run dev`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- `shared/`: tokens, icons, species, rules, sample reserve, routing, share codes. Edit here, then
  `node scripts/sync-shared.mjs`; never edit an app's `shared/` copy.
- `api/`: FastAPI, SQLAlchemy, Alembic. `python -m venv .venv`, `pip install -e ".[dev]"`,
  `ruff check app tests`, `pytest`. After changing `/v1` routes: `python scripts/export_openapi.py`.
- Whole stack: `docker compose up` (database, API, scheduler, apps, monitoring);
  `docker compose config --quiet` to validate.
- Repository checks: `node scripts/check-names.mjs`, `node scripts/sync-shared.mjs --check`,
  `node --test "tests/*.test.ts"`.
- Long commands (npm installs, builds, a database, compose up): run them in the background with
  output to a log file, and poll the log.

## Git

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `ci:`), small, one topic.
- One branch per piece of work; a pull request with a real description; merge with a merge commit
  (`gh pr merge --merge`) once CI is green. Never rewrite `main`.
- **No attribution trailers** anywhere: no `Co-Authored-By`, no "Generated with" lines, in commits
  or pull requests.
- Never read or commit `.env` files, secrets, tokens or personal data. Check `git status` first.

## Honesty

- Never claim something works unless you ran it, and say what you ran. Say plainly what is a
  scaffold, what is sample data and what is not built.
- Label sample data on every screen and in every document where it appears.

## Wildlife, privacy and safety (from `docs/SAFETY_AND_PRIVACY.md`; non-negotiable)

- No live animal locations: published only after review and a delay (1 hour; 7 days for
  sensitive species), as a 1 km cell (10 km for sensitive species), never the exact point.
- Sensitive species (rhino, pangolin; the list is to be agreed with DWNP), dens and nests: never
  guided to, never shared by QR code. Unknown species are treated as sensitive.
- Guidance stays on existing roads and tracks, ends at a track, never invites off-road driving.
- Anything predicted is labelled "predicted" with a confidence level and is off by default.
- GPS traces are personal data (Data Protection Act, 2024): opt-in per trip, trimmed and delayed
  before sharing, deletable, deleted on expiry.
- The rules exist in `shared/rules.ts` and `api/app/services/publication.py`; keep them identical.

## Records

Keep `docs/WORK_ORDERS.md` current in the same pull request as each change, with honest states and
evidence. Every new instruction from the owner gets a work-order entry. Record lasting decisions as
ADRs in `docs/adr/`, and copied code in `PROVENANCE.md`.
