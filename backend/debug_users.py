
from app.db.base import SessionLocal
from app.models.user import User

db = SessionLocal()
try:
    users = db.query(User).all()
    for u in users:
        print(f"ID: {u.id}, Username: {u.username}, FullName: {u.full_name}")
finally:
    db.close()
