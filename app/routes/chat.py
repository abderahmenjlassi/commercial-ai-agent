import re
import uuid
from flask import Blueprint, request, jsonify, render_template
from app.agent.core import run_agent
from app.agent import memory
from app.agent.session_init import (
    build_client_context, inject_into_session,
    generate_greeting, generate_post_identification_greeting,
)

chat_bp = Blueprint("chat", __name__)

_PHONE_RE = re.compile(r'\b([259]\d{7})\b')


# ── Pages ─────────────────────────────────────────────────────────────────────

@chat_bp.route("/")
def index():
    return render_template("index.html")


# ── Visitor tracking ──────────────────────────────────────────────────────────

@chat_bp.route("/api/visitor/init", methods=["POST"])
def visitor_init():
    """
    Called by widget.js on every page load.
    Creates or updates the visitor record and returns the known customer phone
    if this visitor has been identified before.
    """
    data       = request.get_json(silent=True) or {}
    visitor_id = (data.get("visitor_id") or "").strip()
    referrer   = (data.get("referrer") or "")[:500]
    user_agent = (data.get("user_agent") or request.headers.get("User-Agent", ""))[:300]

    if not visitor_id:
        return jsonify({"error": "visitor_id required"}), 400

    from app import database as db
    visitor = db.upsert_visitor(visitor_id, referrer, user_agent)

    return jsonify({
        "visitor_id":    visitor_id,
        "is_returning":  (visitor.get("page_views", 1) > 1),
        "customer_phone": visitor.get("customer_phone") or None,
        "is_converted":  bool(visitor.get("is_converted")),
    })


# ── Chat session ──────────────────────────────────────────────────────────────

@chat_bp.route("/api/session/new", methods=["POST"])
def new_session():
    """
    Create a new chat session.
    Accepts visitor_id to auto-identify returning clients even without a phone.
    Body: { phone?, visitor_id? }
    """
    data       = request.get_json(silent=True) or {}
    phone      = (data.get("phone") or "").strip()
    visitor_id = (data.get("visitor_id") or "").strip()
    session_id = str(uuid.uuid4())

    memory.get_or_create_session(session_id)

    # Link visitor to session
    if visitor_id:
        memory.set_visitor_id(session_id, visitor_id)
        try:
            from app import database as db
            db.increment_visitor_chat(visitor_id)
            # Auto-identify from visitor record if no phone provided
            if not phone:
                v = db.get_visitor(visitor_id)
                if v and v.get("customer_phone"):
                    phone = v["customer_phone"]
        except Exception:
            pass

    greeting     = None
    customer_ctx = None

    if phone:
        ctx = build_client_context(phone)
        inject_into_session(session_id, ctx)
        greeting     = generate_greeting(session_id, ctx)
        customer_ctx = ctx if ctx.get("known") else None
    else:
        greeting = (
            "Bonjour ! Je suis l'assistant de TuniOptique. "
            "Pour vous offrir un service personnalisé — suivi de commandes, "
            "recommandations adaptées et assistance prioritaire — "
            "pouvez-vous me communiquer votre numéro de téléphone ?"
        )
        memory.add_message(session_id, "assistant", greeting)

    return jsonify({
        "session_id": session_id,
        "greeting":   greeting,
        "customer":   customer_ctx,
    })


@chat_bp.route("/api/chat", methods=["POST"])
def chat():
    data       = request.get_json()
    message    = (data.get("message") or "").strip()
    session_id = data.get("session_id") or str(uuid.uuid4())
    visitor_id = (data.get("visitor_id") or "").strip()

    if not message:
        return jsonify({"error": "Empty message"}), 400

    # Attach visitor to session if not already linked
    if visitor_id and not memory.get_visitor_id(session_id):
        memory.set_visitor_id(session_id, visitor_id)

    was_anonymous = not memory.get_customer_info(session_id).get("phone")

    # Auto-detect phone in message if not yet identified
    _try_identify_from_message(session_id, message)

    result = run_agent(session_id, message)

    # If visitor was just identified, persist the link in the visitors table
    cust = memory.get_customer_info(session_id)
    vid  = visitor_id or memory.get_visitor_id(session_id)
    if was_anonymous and cust.get("phone") and vid:
        try:
            from app import database as db
            db.convert_visitor(vid, cust["phone"])
        except Exception:
            pass

    return jsonify({
        "reply":          result["reply"],
        "products":       result.get("products"),
        "product":        result.get("product"),
        "order_recap":    result.get("order_recap"),
        "order_result":   result.get("order_result"),
        "customer":       result.get("customer"),
        "pending_orders": result.get("pending_orders"),
        "delivery":       result.get("delivery"),
        "invoice":        result.get("invoice"),
        "quote":          result.get("quote"),
        "session_id":     session_id,
    })


@chat_bp.route("/api/session/identify", methods=["POST"])
def identify_session():
    """
    Explicitly identify a client mid-session by phone.
    Also converts the visitor record if visitor_id is known.
    """
    data       = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "")
    phone      = (data.get("phone") or "").strip()

    if not session_id or not phone:
        return jsonify({"error": "session_id and phone required"}), 400

    ctx = build_client_context(phone)
    inject_into_session(session_id, ctx)

    # Convert visitor record
    visitor_id = memory.get_visitor_id(session_id)
    if visitor_id and ctx.get("known"):
        try:
            from app import database as db
            db.convert_visitor(visitor_id, phone)
        except Exception:
            pass

    proactive_message = None
    if ctx.get("known"):
        proactive_message = generate_post_identification_greeting(session_id, ctx)
        if proactive_message:
            memory.add_message(session_id, "assistant", proactive_message)

    return jsonify({
        "identified":        ctx.get("known", False),
        "customer":          ctx if ctx.get("known") else None,
        "proactive_message": proactive_message,
    })


@chat_bp.route("/api/sessions", methods=["GET"])
def list_sessions():
    return jsonify(memory.list_sessions())


# ── Helpers ───────────────────────────────────────────────────────────────────

def _try_identify_from_message(session_id: str, message: str):
    """
    If a Tunisian phone number is found in the message and the session has no
    phone yet, silently pre-load the client profile.
    """
    cust = memory.get_customer_info(session_id)
    if cust.get("phone"):
        return

    match = _PHONE_RE.search(message)
    if match:
        phone = match.group(1)
        ctx   = build_client_context(phone)
        if ctx.get("known"):
            inject_into_session(session_id, ctx)
