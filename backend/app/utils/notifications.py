from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility


def create_notification(
    db: Session,
    *,
    user_id: int,
    title: str,
    message: Optional[str] = None,
    notification_type: str = "general",
    link_url: Optional[str] = None,
    actor_id: Optional[int] = None,
) -> Optional[Notification]:
    if not user_id:
        return None

    notification = Notification(
        user_id=user_id,
        actor_id=actor_id,
        title=title,
        message=message,
        notification_type=notification_type,
        link_url=link_url,
    )
    db.add(notification)
    db.flush()
    return notification


def create_notifications(
    db: Session,
    *,
    user_ids: Iterable[int],
    title: str,
    message: Optional[str] = None,
    notification_type: str = "general",
    link_url: Optional[str] = None,
    actor_id: Optional[int] = None,
) -> None:
    seen = set()
    for user_id in user_ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        create_notification(
            db,
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            link_url=link_url,
            actor_id=actor_id,
        )


def notify_admins(
    db: Session,
    *,
    title: str,
    message: Optional[str] = None,
    notification_type: str = "general",
    link_url: Optional[str] = None,
    actor_id: Optional[int] = None,
) -> None:
    users = (
        db.query(User.id)
        .filter(User.is_active.is_(True), User.role.in_([UserRole.SUPERADMIN, UserRole.ADMIN]))
        .all()
    )
    create_notifications(
        db,
        user_ids=[user.id for user in users],
        title=title,
        message=message,
        notification_type=notification_type,
        link_url=link_url,
        actor_id=actor_id,
    )


def notify_facility_users(
    db: Session,
    *,
    facility_id: int,
    title: str,
    message: Optional[str] = None,
    notification_type: str = "facility",
    link_url: Optional[str] = None,
    actor_id: Optional[int] = None,
) -> None:
    primary_users = db.query(User.id).filter(User.facility_id == facility_id, User.is_active.is_(True)).all()
    linked_users = (
        db.query(UserFacility.user_id)
        .join(User, User.id == UserFacility.user_id)
        .filter(UserFacility.facility_id == facility_id, User.is_active.is_(True))
        .all()
    )
    create_notifications(
        db,
        user_ids=[user.id for user in primary_users] + [user.user_id for user in linked_users],
        title=title,
        message=message,
        notification_type=notification_type,
        link_url=link_url,
        actor_id=actor_id,
    )
