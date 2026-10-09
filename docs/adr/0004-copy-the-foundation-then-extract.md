# 0004. Copy the earlier platform's foundation now, extract a shared kit later

- **State:** accepted, 9 October 2026

## Context

The owner owns an earlier product outright and wants Kori built on its foundation: the API
platform (accounts, scoped keys, throttling, audit, uploads, privacy, review), the database setup,
compose, observability, operations tooling and CI. The first build of Kori used only the web-app
structure and design tooling; the owner asked for the whole foundation. A shared `platform-kit`
repository was planned, but extracting it first would delay everything.

## Decision

Copy the foundation into Kori with a fresh history (`git archive` of the source's `main`, never its
working tree, never its `.env` files), rename it, remove the source's domain (transit), and record
every copied file in `PROVENANCE.md`. Extract a shared kit later, once two products use the same
code.

## Consequences

- Kori shows a complete backend, migrations, operations tooling and CI from the start.
- Fixes to the copied platform code must be made in both products until the kit exists.
- The copied code becomes visible if Kori is made public; it is all rights reserved and should be
  reviewed for security before that (KO-14).
- A name gate in CI (`scripts/check-names.mjs`) keeps the source's names out of the tree, except in
  `PROVENANCE.md`.
