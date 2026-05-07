import sys
import os

# Add the root directory to the sys path so app can be imported
sys.path.insert(0, os.path.dirname(__file__))

from app.db.base import SessionLocal
from app.models.user import User, UserType, UserRole
from app.core.security import get_password_hash

db = SessionLocal()
try:
    if not db.query(User).filter_by(username='admin').first():
        user = User(
            username='admin',
            email='admin@medrad.com',
            full_name='Admin User',
            hashed_password=get_password_hash('password'),
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN
        )
        db.add(user)
        db.commit()
        print('Admin user created successfully!')
    else:
        print('Admin user already exists!')
except Exception as e:
    print("Error:", e)
finally:
    db.close()
