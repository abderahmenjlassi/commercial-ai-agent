"""
Webhook endpoint — TikTak Space POSTs new orders here.
Configure TikTak Space to call: POST https://your-domain/webhook/orders
with header:  X-Webhook-Token: <WEBHOOK_SECRET>
"""
import os
from flask import Blueprint, request, jsonify
from app import database as db, notifications

webhook_bp = Blueprint("webhook", __name__)

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "change-this-secret")


def _verify(req) -> bool:
    token = req.headers.get("X-Webhook-Token") or req.args.get("token")
    return token == WEBHOOK_SECRET


@webhook_bp.route("/webhook/orders", methods=["POST"])
def receive_order():
    if not _verify(request):
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}

    # Support both a single order object and a list
    orders = payload if isinstance(payload, list) else [payload]
    saved  = 0

    for o in orders:
        try:
            _process_webhook_order(o)
            saved += 1
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"received": saved}), 200


def _process_webhook_order(o: dict):
    phone = o.get("phone", "")
    name  = o.get("name", "")

    if phone:
        db.upsert_customer(
            phone, name,
            o.get("email", ""),
            o.get("gouvernorat", ""),
            o.get("address", "")
        )

    items = []
    for d in o.get("_details", []):
        pid = d.get("product_id") or d.get("product_parent_id")
        if pid:
            db.cache_product(pid, d.get("product_name",""), str(d.get("category_id","")), d.get("product_thumb",""))
        items.append({
            "product_id":   pid,
            "product_name": d.get("product_name",""),
            "quantity":     d.get("quantity", 1),
            "price_ttc":    d.get("price_ttc", 0),
            "discount":     d.get("discount", 0),
            "final_price":  d.get("final_price", 0),
        })

    db.upsert_order(
        order_id       = str(o["id"]),
        source         = "webhook",
        external_id    = o["id"],
        customer_phone = phone,
        customer_name  = name,
        address        = o.get("address",""),
        gouvernorat    = o.get("gouvernorat",""),
        status         = o.get("step_name","En attente"),
        payment_type   = o.get("payement_type","CASH"),
        total          = o.get("total_amount", 0),
        comment        = o.get("comment",""),
        tracking_number= o.get("transport_system_id","") or "",
        created_at     = (o.get("created_at","")[:19] or "").replace("T"," "),
        items          = items,
    )

    db.refresh_customer_stats(phone)

    # Create an admin notification for new webhook orders
    notifications.add(
        session_id="webhook",
        reason=f"Nouvelle commande #{o['id']} via système",
        summary=f"Client: {name} ({phone})\nGouvernorat: {o.get('gouvernorat','')}\nTotal: {o.get('total_amount',0)} TND",
        customer={"name": name, "phone": phone}
    )


@webhook_bp.route("/webhook/orders/test", methods=["POST"])
def test_webhook():
    """Test endpoint — simulates receiving a webhook order (no auth required in dev)."""
    payload = request.get_json(silent=True) or {}
    if not payload:
        return jsonify({"error": "No payload"}), 400
    try:
        _process_webhook_order(payload)
        return jsonify({"ok": True, "message": "Order processed successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
