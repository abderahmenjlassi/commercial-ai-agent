"""
In-memory conversation store keyed by session_id.
"""
from datetime import datetime

_sessions: dict = {}
MAX_HISTORY = 50


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_or_create_session(session_id: str) -> dict:
    if session_id not in _sessions:
        _sessions[session_id] = {
            "messages":       [],
            "created_at":     _now(),
            "last_activity":  _now(),
            "customer":       {},
            "active_orders":  [],
            "has_order":      False,
            "has_escalation": False,
        }
    return _sessions[session_id]


def add_message(session_id: str, role: str, content: str):
    session = get_or_create_session(session_id)
    session["messages"].append({"role": role, "content": content})
    session["last_activity"] = _now()
    if len(session["messages"]) > MAX_HISTORY:
        session["messages"] = session["messages"][-MAX_HISTORY:]


def add_tool_message(session_id: str, tool_call_id: str, content: str):
    session = get_or_create_session(session_id)
    session["messages"].append({
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": str(content)
    })
    session["last_activity"] = _now()


def add_assistant_tool_call(session_id: str, message: dict):
    session = get_or_create_session(session_id)
    session["messages"].append(message)


def get_history(session_id: str) -> list:
    return get_or_create_session(session_id)["messages"]


def update_customer_info(session_id: str, data: dict):
    session = get_or_create_session(session_id)
    session["customer"].update({k: v for k, v in data.items() if v})


def get_customer_info(session_id: str) -> dict:
    return get_or_create_session(session_id).get("customer", {})


def set_active_orders(session_id: str, orders: list):
    get_or_create_session(session_id)["active_orders"] = orders or []


def get_active_orders(session_id: str) -> list:
    return get_or_create_session(session_id).get("active_orders", [])


def save_pending_recap(session_id: str, recap: dict):
    get_or_create_session(session_id)["pending_recap"] = recap


def get_pending_recap(session_id: str) -> dict:
    return get_or_create_session(session_id).get("pending_recap", {})


def clear_pending_recap(session_id: str):
    get_or_create_session(session_id).pop("pending_recap", None)


def mark_has_order(session_id: str):
    get_or_create_session(session_id)["has_order"] = True


def mark_has_escalation(session_id: str):
    get_or_create_session(session_id)["has_escalation"] = True


def clear_session(session_id: str):
    _sessions.pop(session_id, None)


def list_sessions() -> list:
    result = []
    for sid, data in _sessions.items():
        # Last user message for preview
        user_msgs = [m for m in data["messages"] if m.get("role") == "user" and m.get("content")]
        last_msg  = user_msgs[-1]["content"][:80] if user_msgs else ""
        user_count = len(user_msgs)
        result.append({
            "session_id":     sid,
            "created_at":     data["created_at"],
            "last_activity":  data["last_activity"],
            "message_count":  user_count,
            "last_message":   last_msg,
            "customer":       data.get("customer", {}),
            "has_order":      data.get("has_order", False),
            "has_escalation": data.get("has_escalation", False),
        })
    # Newest activity first
    return sorted(result, key=lambda x: x["last_activity"], reverse=True)


def get_stats() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    total   = len(_sessions)
    today_s = sum(1 for d in _sessions.values() if d["created_at"].startswith(today))
    with_order     = sum(1 for d in _sessions.values() if d.get("has_order"))
    with_escalation= sum(1 for d in _sessions.values() if d.get("has_escalation"))
    total_messages = sum(
        len([m for m in d["messages"] if m.get("role") == "user"])
        for d in _sessions.values()
    )
    # Active in last 30 minutes
    from datetime import timedelta
    cutoff = (datetime.now() - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
    active = sum(1 for d in _sessions.values() if d.get("last_activity", "") >= cutoff)

    return {
        "total_sessions":      total,
        "sessions_today":      today_s,
        "active_sessions":     active,
        "total_messages":      total_messages,
        "sessions_with_order": with_order,
        "escalations":         with_escalation,
        "conversion_rate":     round(with_order / total * 100, 1) if total else 0,
    }
