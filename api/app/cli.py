"""Operator commands that need database access but no HTTP surface.

Roles live in Kori's own tables, so promoting an operator is a deliberate, audited
command rather than something an identity-provider claim can do:

    python -m app.cli grant-role you@example.com admin
"""

from __future__ import annotations

import argparse
import json

from sqlalchemy import select

from app.database import SessionLocal
from app.models import DeveloperAccount

ROLES = ("developer", "admin")


def grant_role(email: str, role: str) -> str:
    if role not in ROLES:
        raise SystemExit(f"Unknown role {role!r}; choose one of {', '.join(ROLES)}")
    with SessionLocal() as session:
        account = session.scalar(
            select(DeveloperAccount).where(DeveloperAccount.email == email.strip().lower())
        )
        if account is None:
            raise SystemExit("No account has that email. Sign in once first, then retry.")
        account.role = role
        session.commit()
        return json.dumps({"account": account.id, "email": account.email, "role": role})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    grant = commands.add_parser("grant-role", help="Set an account's role")
    grant.add_argument("email")
    grant.add_argument("role", choices=ROLES)
    args = parser.parse_args()
    if args.command == "grant-role":
        print(grant_role(args.email, args.role))


if __name__ == "__main__":
    main()
