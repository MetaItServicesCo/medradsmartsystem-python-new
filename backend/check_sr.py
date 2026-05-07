from app.db.base import SessionLocal
from app.models.service_request import ServiceRequest

db = SessionLocal()
srs = db.query(ServiceRequest).order_by(ServiceRequest.id.desc()).limit(5).all()
for sr in srs:
    print(f"ID: {sr.id}, Request Number: {sr.request_number}, Created At: {sr.created_at}")
