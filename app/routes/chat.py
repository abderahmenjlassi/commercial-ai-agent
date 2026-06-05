from flask import Blueprint, request, jsonify, render_template
from app.agent.core import run_agent
from app.agent import memory
from app.agent.session_init import build_client_context, inject_into_session, generate_greeting
import uuid

chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/")
def index():
    return render_template("index.html")


@chat_bp.route("/api/chat", methods=["POST"])
def chat():
    data       = request.get_json()
    message    = (data.get("message") or "").strip()
    session_id = data.get("session_id") or str(uuid.uuid4())

    if not message:
        return jsonify({"error": "Empty message"}), 400

    # Auto-detect phone in message if not yet identified
    _try_identify_from_message(session_id, message)

    result = run_agent(session_id, message)
    return jsonify({
        "reply":        result["reply"],
        "products":     result.get("products"),
        "product":      result.get("product"),
        "order_recap":  result.get("order_recap"),
        "order_result": result.get("order_result"),
        "customer":     result.get("customer"),
        "delivery":     result.get("delivery"),
        "invoice":      result.get("invoice"),
        "quote":        result.get("quote"),
        "session_id":   session_id
    })


@chat_bp.route("/api/session/new", methods=["POST"])
def new_session():
    """
    Create a new session, optionally pre-loading a known client.
    Body: { "phone": "22334455" }  (optional)
    Returns: { "session_id", "greeting", "customer" }
    """
    data       = request.get_json(silent=True) or {}
    phone      = (data.get("phone") or "").strip()
    session_id = str(uuid.uuid4())

    memory.get_or_create_session(session_id)

    greeting = None
    customer_ctx = None

    if phone:
        ctx = build_client_context(phone)
        inject_into_session(session_id, ctx)
        greeting     = generate_greeting(session_id, ctx)
        customer_ctx = ctx if ctx.get("known") else None
    else:
        # Generic welcome — no phone yet
        greeting = ("Bonjour ! Je suis l'assistant de TuniOptique. "
                    "Comment puis-je vous aider aujourd'hui ?")
        memory.add_message(session_id, "assistant", greeting)

    return jsonify({
        "session_id": session_id,
        "greeting":   greeting,
        "customer":   customer_ctx,
    })


@chat_bp.route("/api/session/identify", methods=["POST"])
def identify_session():
    """
    Identify (or re-identify) a client mid-session by phone.
    Called by the frontend when the user provides their phone in the chat.
    """
    data       = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "")
    phone      = (data.get("phone") or "").strip()

    if not session_id or not phone:
        return jsonify({"error": "session_id and phone required"}), 400

    ctx = build_client_context(phone)
    inject_into_session(session_id, ctx)

    return jsonify({
        "identified": ctx.get("known", False),
        "customer":   ctx if ctx.get("known") else None,
    })


@chat_bp.route("/api/sessions", methods=["GET"])
def list_sessions():
    return jsonify(memory.list_sessions())


# ── Helpers ───────────────────────────────────────────────────────────────────

import re
_PHONE_RE = re.compile(r'\b([259]\d{7})\b')

def _try_identify_from_message(session_id: str, message: str):
    """
    If we spot a Tunisian phone number in the message and the session
    has no phone yet, silently pre-load the client profile.
    """
    cust = memory.get_customer_info(session_id)
    if cust.get("phone"):
        return  # already identified

    match = _PHONE_RE.search(message)
    if match:
        phone = match.group(1)
        ctx   = build_client_context(phone)
        if ctx.get("known"):
            inject_into_session(session_id, ctx)
