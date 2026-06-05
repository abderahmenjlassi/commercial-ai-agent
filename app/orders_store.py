"""
Local order store — orders are saved here instead of the external API.
When the real API is ready, replace create() with the actual POST call.
"""
from datetime import datetime
import uuid

_orders: list = []


def create(customer_name: str, phone: str, address: str, gouvernorat: str,
           items: list, total: float, payement_type: str = "CASH",
           comment: str = "", session_id: str = "") -> dict:
    order = {
        "id":            str(uuid.uuid4())[:8].upper(),
        "session_id":    session_id,
        "customer_name": customer_name,
        "phone":         phone,
        "address":       address,
        "gouvernorat":   gouvernorat,
        "payement_type": payement_type,
        "comment":       comment,
        "items":         items,
        "total":         total,
        "status":        "pending",      # pending | confirmed | cancelled
        "created_at":    datetime.now().strftime("%Y-%m-%d %H:%M"),
        "confirmed_at":  None,
    }
    _orders.insert(0, order)
    return order


def get_all() -> list:
    return _orders


def update_status(order_id: str, status: str) -> bool:
    for o in _orders:
        if o["id"] == order_id:
            o["status"] = status
            if status == "confirmed":
                o["confirmed_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            return True
    return False


def pending_count() -> int:
    return sum(1 for o in _orders if o["status"] == "pending")
