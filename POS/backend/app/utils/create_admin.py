"""Create the super admin user with the owner-provided credentials.

All credentials are read from environment variables for security.
Set these in your .env file:
  SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_USERNAME, SUPER_ADMIN_FULL_NAME
"""

import os

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Role, User

EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "")
PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD", "")
USERNAME = os.environ.get("SUPER_ADMIN_USERNAME", "")
FULL_NAME = os.environ.get("SUPER_ADMIN_FULL_NAME", "Super Admin")


def main() -> None:
    if not EMAIL or not PASSWORD or not USERNAME:
        print("Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, and SUPER_ADMIN_USERNAME in your environment.")
        return
    db = SessionLocal()
    try:
        admin_role = db.execute(select(Role).where(Role.name == "Administrator")).scalar_one()
        existing = db.execute(
            select(User).where((User.username == USERNAME) | (User.email == EMAIL))
        ).scalar_one_or_none()
        if existing is not None:
            # Update password / role / email to ensure the account is current.
            existing.email = EMAIL
            existing.password_hash = hash_password(PASSWORD)
            existing.role_id = admin_role.id
            existing.is_active = True
            existing.full_name = FULL_NAME
            print(f"Updated super admin: {existing.username} ({EMAIL})")
        else:
            user = User(
                username=USERNAME,
                full_name=FULL_NAME,
                email=EMAIL,
                password_hash=hash_password(PASSWORD),
                role_id=admin_role.id,
                branch_id=None,  # no branch restriction — full company access
            )
            db.add(user)
            print(f"Created super admin: {USERNAME} ({EMAIL})")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
