
from app.db.base import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    result = db.execute(text("PRAGMA table_info(friend_requests)"))
    columns = [row[1] for row in result]
    print(f"Columns in friend_requests: {columns}")
finally:
    db.close()
