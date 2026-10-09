# Contributing

Kori is privately owned and all rights reserved; contributions are by invitation. These are the
conventions every change follows.

## Work orders first

Every piece of work has an entry in `docs/WORK_ORDERS.md`, updated in the same pull request as the
change, with an honest state and the evidence. Every new instruction from the owner gets an entry.

## Git

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `ci:`), small, one topic
  each.
- One branch per piece of work (`feat/...`, `chore/...`, `docs/...`), a pull request with a real
  description, merged with a merge commit so the branch history stays visible. Never rewrite `main`.
- No attribution trailers in commits or pull requests.
- Never commit secrets, `.env` files, tokens or personal data. Check `git status` before committing.

## Before you push

```sh
node scripts/check-names.mjs               # no other product's names in the tree
node scripts/sync-shared.mjs --check       # apps' copies of shared/ match the source
node --test "tests/*.test.ts"              # shared rules, routing and share codes
cd apps/<app> && npm run lint && npx tsc --noEmit && npm run build
cd api && ruff check app tests && pytest
docker compose config --quiet
```

Edit `shared/` and run `node scripts/sync-shared.mjs`; never edit an app's copy. When the API's
public routes change, run `python scripts/export_openapi.py` in `api/` so the API docs match.

## Honesty

Never say something works unless it was run. Label sample data where it appears. Predicted map
features are labelled predicted, with a confidence level.

## Safety

Changes that touch sightings, tracks, guidance or traces must keep the rules in
`docs/SAFETY_AND_PRIVACY.md`. A pull request that weakens one of them needs the owner's explicit
decision, recorded as an ADR in `docs/adr/`.
