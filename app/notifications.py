"""
In-memory notification store for human escalations.
Each notification is created when the agent calls escalate_to_human.
"""
from datetime import datetime
import uuid

_notifications: list = []


def add(session_id: str, reason: str, summary: str, customer: dict) -> dict:
    notif = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "reason": reason,
        "summary": summary,
        "customer": customer,
        "status": "pending",       # pending | handled
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "handled_at": None,
    }
    _notifications.insert(0, notif)   # newest first
    return notif


def get_all() -> list:
    return _notifications


def mark_handled(notif_id: str) -> bool:
    for n in _notifications:
        if n["id"] == notif_id:
            n["status"] = "handled"
            n["handled_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            return True
    return False


def pending_count() -> int:
    return sum(1 for n in _notifications if n["status"] == "pending")
