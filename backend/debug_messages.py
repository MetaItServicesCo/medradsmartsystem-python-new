
from app.db.base import SessionLocal
from app.models.chat import WorkspaceMessage
from app.models.user import User

db = SessionLocal()
try:
    msgs = db.query(WorkspaceMessage).order_by(WorkspaceMessage.created_at.desc()).limit(5).all()
    for m in msgs:
        sender = db.query(User).filter(User.id == m.sender_id).first()
        print(f"ID: {m.id}, Workspace: {m.workspace_id}, SenderID: {m.sender_id}, Content: {m.content}, SenderName: {sender.full_name if sender else 'Unknown'}")
finally:
    db.close()
