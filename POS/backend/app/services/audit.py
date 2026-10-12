from sqlalchemy.orm import Session

from app.models import AuditLog


def log_action(
    db: Session,
    *,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    branch_id: int | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    is_offline: bool = False,
) -> None:
    """Append an audit record to the current transaction (committed with it)."""
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            branch_id=branch_id,
            old_value=old_value,
            new_value=new_value,
            is_offline=is_offline,
        )
    )
