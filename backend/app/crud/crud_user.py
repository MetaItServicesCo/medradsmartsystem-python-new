from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.crud.base import CRUDBase
from app.models.user import User, UserRole, UserType
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash, verify_password


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):

    def get_by_username(self, db: Session, *, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()

    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        role_enum = UserRole(obj_in.role) if obj_in.role else UserRole.EMPLOYEE
        user_type_enum = UserType(obj_in.user_type) if obj_in.user_type else UserType.EMPLOYEE

        db_user = User(
            username=obj_in.username,
            email=obj_in.email,
            full_name=obj_in.full_name,
            hashed_password=get_password_hash(obj_in.password),
            phone=obj_in.phone,
            user_type=user_type_enum,
            role=role_enum,
            is_active=True,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    def update_user(self, db: Session, *, db_obj: User, obj_in: UserUpdate) -> User:
        update_data = obj_in.model_dump(exclude_unset=True)

        if "password" in update_data and update_data["password"]:
            update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
        else:
            update_data.pop("password", None)

        if "role" in update_data and update_data["role"]:
            update_data["role"] = UserRole(update_data["role"])

        if "user_type" in update_data and update_data["user_type"]:
            update_data["user_type"] = UserType(update_data["user_type"])

        # Remove facility_ids — handled separately
        update_data.pop("facility_ids", None)

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_role(self, db: Session, *, db_obj: User, role: str) -> User:
        db_obj.role = UserRole(role)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def toggle_active(self, db: Session, *, db_obj: User) -> User:
        db_obj.is_active = not db_obj.is_active
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def authenticate(self, db: Session, *, username: str, password: str) -> Optional[User]:
        user = self.get_by_username(db, username=username)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def search(
        self, db: Session, *, query: str, skip: int = 0, limit: int = 50
    ) -> List[User]:
        return (
            db.query(User)
            .filter(
                or_(
                    User.full_name.ilike(f"%{query}%"),
                    User.email.ilike(f"%{query}%"),
                    User.username.ilike(f"%{query}%"),
                )
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_multi_filtered(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> tuple:
        q = db.query(User)
        if role:
            q = q.filter(User.role == UserRole(role))
        if is_active is not None:
            q = q.filter(User.is_active == is_active)
        if search:
            q = q.filter(
                or_(
                    User.full_name.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%"),
                    User.username.ilike(f"%{search}%"),
                )
            )
        total = q.count()
        items = q.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
        return items, total


user = CRUDUser(User)
