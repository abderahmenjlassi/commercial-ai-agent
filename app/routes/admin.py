import csv
import io
from flask import Blueprint, render_template, jsonify, request, Response
from app import notifications, orders_store, database as db, importer
from app.agent import memory

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin")
def dashboard():
    return render_template("admin.html")


# ── Notifications ─────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/notifications")
def get_notifications():
    return jsonify({
        "notifications": notifications.get_all(),
        "pending_count": notifications.pending_count(),
    })


@admin_bp.route("/api/admin/notifications/<notif_id>/handle", methods=["POST"])
def handle_notification(notif_id):
    return jsonify({"success": notifications.mark_handled(notif_id)})


# ── Orders ────────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/orders")
def get_orders():
    return jsonify({
        "orders": orders_store.get_all(),
        "pending_count": orders_store.pending_count(),
    })


@admin_bp.route("/api/admin/orders/<order_id>/confirm", methods=["POST"])
def confirm_order(order_id):
    return jsonify({"success": orders_store.update_status(order_id, "confirmed")})


@admin_bp.route("/api/admin/orders/<order_id>/cancel", methods=["POST"])
def cancel_order(order_id):
    return jsonify({"success": orders_store.update_status(order_id, "cancelled")})


@admin_bp.route("/api/admin/orders/export.csv")
def export_orders_csv():
    orders = orders_store.get_all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "Client", "Téléphone", "Adresse", "Gouvernorat",
                     "Produits", "Total (TND)", "Paiement", "Statut", "Date"])
    for o in orders:
        items_str = " | ".join(f"{i['name'][:30]} x{i['quantity']}" for i in o.get("items", []))
        writer.writerow([
            o["id"], o["customer_name"], o["phone"],
            o["address"], o["gouvernorat"], items_str,
            o["total"], o.get("payement_type", "CASH"),
            o["status"], o["created_at"],
        ])
    output = buf.getvalue()
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=commandes.csv"}
    )


# ── Sessions / Conversations ──────────────────────────────────────────────────

@admin_bp.route("/api/admin/sessions")
def get_sessions():
    return jsonify({"sessions": memory.list_sessions()})


@admin_bp.route("/api/admin/session/<session_id>/history")
def session_history(session_id):
    history = memory.get_history(session_id)
    clean = [m for m in history if m.get("role") in ("user", "assistant") and m.get("content")]
    return jsonify({"history": clean})


# ── Statistics ────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/stats")
def get_stats():
    chat_stats = memory.get_stats()
    db_stats   = db.get_db_stats()

    # Top gouvernorats from DB
    with db.get_conn() as conn:
        rows = conn.execute("""
            SELECT gouvernorat, COUNT(*) as cnt FROM orders
            WHERE gouvernorat IS NOT NULL AND gouvernorat != ''
            GROUP BY gouvernorat ORDER BY cnt DESC LIMIT 5
        """).fetchall()
    top_govs = [[r["gouvernorat"], r["cnt"]] for r in rows]

    # Pending from local chat orders store (not yet in DB)
    chat_pending = orders_store.pending_count()

    return jsonify({
        **chat_stats,
        **db_stats,
        "orders_pending":   db_stats["pending_orders"] + chat_pending,
        "notifs_pending":   notifications.pending_count(),
        "top_gouvernorats": top_govs,
    })


# ── Fulfillment ───────────────────────────────────────────────────────────────

@admin_bp.route("/fulfillment")
def fulfillment_page():
    return render_template("fulfillment.html")


@admin_bp.route("/api/fulfillment/stats")
def fulfillment_stats():
    return jsonify(db.get_fulfillment_stats())


@admin_bp.route("/api/fulfillment/orders")
def fulfillment_orders():
    status     = request.args.get("status", "En attente")
    limit      = int(request.args.get("limit", 50))
    offset     = int(request.args.get("offset", 0))
    search     = request.args.get("search", "")
    gouvernorat= request.args.get("gouvernorat", "")
    orders = db.get_orders_by_status(status, limit, offset, search, gouvernorat)
    return jsonify({"orders": orders, "count": len(orders)})


@admin_bp.route("/api/fulfillment/orders/<order_id>/transition", methods=["POST"])
def fulfillment_transition(order_id):
    body       = request.get_json(silent=True) or {}
    new_status = body.get("status")
    note       = body.get("note", "")
    tracking   = body.get("tracking", "")
    if not new_status:
        return jsonify({"error": "Missing status"}), 400
    ok, msg = db.transition_order(order_id, new_status, note, tracking)
    return jsonify({"success": ok, "message": msg}), (200 if ok else 400)


@admin_bp.route("/api/fulfillment/orders/<order_id>/history")
def fulfillment_order_history(order_id):
    return jsonify({"history": db.get_fulfillment_history(order_id)})


@admin_bp.route("/api/fulfillment/transitions")
def fulfillment_transitions():
    return jsonify({
        "stages":      db.FULFILLMENT_STAGES,
        "terminal":    db.TERMINAL_STAGES,
        "transitions": db.TRANSITIONS,
    })


# ── Import ────────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/import/start", methods=["POST"])
def import_start():
    body      = request.get_json(silent=True) or {}
    max_pages = body.get("max_pages")          # None = import everything
    started   = importer.start_import(max_pages)
    return jsonify({"started": started,
                    "message": "Import lancé." if started else "Import déjà en cours."})


@admin_bp.route("/api/admin/import/status")
def import_status():
    return jsonify(importer.get_status())


# ── Customers (DB) ───────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/customers")
def get_customers():
    q      = request.args.get("q", "")
    limit  = int(request.args.get("limit", 50))
    result = db.search_customers(q, limit) if q else []
    if not q:
        with db.get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM customers ORDER BY total_orders DESC LIMIT ?", (limit,)
            ).fetchall()
            result = [dict(r) for r in rows]
    return jsonify({"customers": result, "count": len(result)})
