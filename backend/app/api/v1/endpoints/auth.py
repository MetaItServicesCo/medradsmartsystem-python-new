from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.base import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.utils.logging import log_activity

router = APIRouter()

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    log_activity(db, "users", user.id, "LOGIN", user)
    db.commit()
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role.value if hasattr(user.role, "value") else str(user.role)})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }

from app.schemas.user import UserCreate

@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    from app.core.security import get_password_hash
    # Check if username or email already exists
    existing = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username or email already registered"
        )
    
    from app.models.user import UserType, UserRole
    # Parse role
    role_enum = UserRole(user_in.role) if user_in.role else UserRole.EMPLOYEE

    db_user = User(
        username=user_in.username,
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        user_type=UserType.EMPLOYEE,
        role=role_enum,
        is_active=True
    )
    db.add(db_user)
    log_activity(db, "users", -1, "REGISTER", db_user) # -1 temporarily as ID not yet generated
    db.commit()
    db.refresh(db_user)
    
    return {"message": "User successfully registered", "user_id": db_user.id}
