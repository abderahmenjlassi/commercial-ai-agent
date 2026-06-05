"""
Smart session initialization.

When a session starts with a known phone number:
1. Load full customer profile + order history from DB
2. Build a rich context object
3. Inject it into session memory
4. Generate a proactive personalized greeting via GPT
5. Return the greeting so the frontend can display it immediately

This means the agent NEVER starts a conversation cold.
"""
import json
from datetime import datetime, timedelta
from app.agent import memory
from app import database as db


def build_client_context(phone: str) -> dict:
    """
    Load everything we know about this client and structure it for the agent.
    Returns a rich context dict used both for memory injection and greeting generation.
    """
    customer = db.get_customer(phone)
    if not customer:
        # Unknown client — try live API as fallback
        return {"known": False, "phone": phone}

    orders = db.get_orders_by_phone(phone, limit=20)

    # Categorize orders
    active_statuses   = {'En attente', 'Confirmées', 'Prêt à expédier', 'Expédiées'}
    positive_statuses = {'Livrées', 'Payées'}

    active_orders    = [o for o in orders if o['status'] in active_statuses]
    delivered_orders = [o for o in orders if o['status'] in positive_statuses]
    recent_delivered = delivered_orders[0] if delivered_orders else None

    # Last order (any status)
    last_order = orders[0] if orders else None

    # Bought product names (unique, most recent first)
    bought_products = []
    for o in orders:
        for item in o.get('items', []):
            name = item.get('product_name', '')
            if name and name not in bought_products:
                bought_products.append(name)

    # Days since last order
    days_since_last = None
    if last_order and last_order.get('created_at'):
        try:
            last_dt = datetime.strptime(last_order['created_at'][:10], "%Y-%m-%d")
            days_since_last = (datetime.now() - last_dt).days
        except Exception:
            pass

    # Determine the most relevant proactive action
    proactive = _determine_proactive_action(
        customer, active_orders, recent_delivered, days_since_last, bought_products
    )

    return {
        "known":           True,
        "phone":           phone,
        "name":            customer.get('name', ''),
        "email":           customer.get('email', ''),
        "gouvernorat":     customer.get('gouvernorat', ''),
        "address":         customer.get('address', ''),
        "tag":             customer.get('tag', ''),
        "total_orders":    customer.get('total_orders', 0),
        "total_spent":     customer.get('total_spent', 0),
        "active_orders":   active_orders,
        "delivered_orders":delivered_orders,
        "last_order":      last_order,
        "bought_products": bought_products[:6],
        "days_since_last": days_since_last,
        "proactive":       proactive,
    }


def _determine_proactive_action(customer, active_orders, recent_delivered,
                                 days_since_last, bought_products) -> dict:
    """Pick the single most relevant thing to open with."""

    # 1. Undelivered order in transit → offer tracking
    in_transit = [o for o in active_orders if o['status'] == 'Expédiées']
    if in_transit:
        o = in_transit[0]
        return {
            "type":    "tracking",
            "label":   "commande en transit",
            "order_id": o.get('external_id') or o['id'],
            "tracking": o.get('tracking_number', ''),
            "items":    [i['product_name'][:30] for i in o.get('items', [])],
        }

    # 2. Confirmed order waiting to ship → reassure
    waiting = [o for o in active_orders if o['status'] in ('Confirmées', 'Prêt à expédier')]
    if waiting:
        o = waiting[0]
        return {
            "type":    "order_waiting",
            "label":   "commande confirmée",
            "order_id": o.get('external_id') or o['id'],
            "items":    [i['product_name'][:30] for i in o.get('items', [])],
        }

    # 3. Pending order (needs confirmation) → offer to confirm
    pending = [o for o in active_orders if o['status'] == 'En attente']
    if pending:
        o = pending[0]
        return {
            "type":    "order_pending",
            "label":   "commande en attente",
            "order_id": o.get('external_id') or o['id'],
            "items":    [i['product_name'][:30] for i in o.get('items', [])],
        }

    # 4. Recently delivered (< 14 days) → ask for feedback
    if recent_delivered and days_since_last is not None and days_since_last <= 14:
        return {
            "type":    "feedback",
            "label":   "commande récente",
            "order_id": recent_delivered.get('external_id') or recent_delivered['id'],
            "items":    [i['product_name'][:30] for i in recent_delivered.get('items', [])],
        }

    # 5. Has purchase history → suggest complementary products
    if bought_products:
        return {
            "type":     "upsell",
            "label":    "fidélisation",
            "products": bought_products[:3],
        }

    # 6. New/inactive client → warm welcome
    return {"type": "welcome", "label": "nouveau client"}


def inject_into_session(session_id: str, ctx: dict):
    """Store all known client data into session memory."""
    if not ctx.get("known"):
        return
    memory.update_customer_info(session_id, {
        "name":        ctx.get("name"),
        "phone":       ctx.get("phone"),
        "address":     ctx.get("address"),
        "gouvernorat": ctx.get("gouvernorat"),
        "tag":         ctx.get("tag"),
        "email":       ctx.get("email"),
    })
    # Store active (undelivered) orders so the agent can reference them immediately
    active_statuses = {'En attente', 'Confirmées', 'Prêt à expédier', 'Expédiées'}
    active = [
        {
            "order_id":       o.get("external_id") or o["id"],
            "status":         o.get("status", ""),
            "items":          [i.get("product_name", "") for i in o.get("items", [])[:3]],
            "tracking_number": o.get("tracking_number", ""),
            "created_at":     (o.get("created_at", "") or "")[:10],
            "total":          o.get("total", 0),
        }
        for o in ctx.get("active_orders", [])
        if o.get("status", "") in active_statuses
    ]
    memory.set_active_orders(session_id, active)


_GREETING_PROMPT_TEMPLATE = """Tu es l'assistant commercial de TuniOptique.
Génère un message d'accueil personnalisé et proactif en {lang} pour ce client.
Le message doit être COURT (2-3 phrases max), chaleureux et directement utile.

PROFIL CLIENT :
{profile}

ACTION RECOMMANDÉE : {action_desc}

INSTRUCTIONS :
- Salue le client par son prénom si disponible
- Mentionne directement l'action recommandée
- Pose UNE question ouverte pour inviter à répondre
- NE liste PAS les services disponibles
- NE demande PAS d'informations déjà connues
- Ton : {tone}"""

_ACTION_DESCRIPTIONS = {
    "tracking":      "Informer le client que sa commande ({items}) est en cours de livraison et lui proposer de suivre.",
    "order_waiting": "Rassurer le client : sa commande ({items}) est confirmée et sera bientôt expédiée.",
    "order_pending": "Informer que sa commande ({items}) est en attente de confirmation et demander s'il souhaite un suivi.",
    "feedback":      "Demander son avis sur sa récente commande ({items}) — satisfaction, questions, problèmes.",
    "upsell":        "Proposer des produits complémentaires à ses achats précédents : {products}.",
    "welcome":       "Accueillir chaleureusement le nouveau client et lui demander comment l'aider.",
}

_TONE = {
    "Nouveau client":  "chaleureux et accueillant",
    "Client régulier": "amical et professionnel",
    "Client fidèle":   "personnel et reconnaissant",
    "Client VIP":      "prioritaire et attentionné",
    "Client à risque": "particulièrement patient et rassurant",
}


def generate_greeting(session_id: str, ctx: dict, lang: str = "français") -> str:
    """Call GPT to generate a proactive personalized opening message."""
    from app.agent.core import _get_client
    from config import Config

    if not ctx.get("known"):
        return ("Bonjour ! Je suis l'assistant de TuniOptique. "
                "Pour personnaliser notre échange, pourriez-vous me donner votre numéro de téléphone ?")

    proactive = ctx.get("proactive", {})
    ptype     = proactive.get("type", "welcome")
    items_str = ", ".join(proactive.get("items", [])) or "vos produits"
    prods_str = ", ".join(proactive.get("products", [])) or "produits complémentaires"
    action_tpl= _ACTION_DESCRIPTIONS.get(ptype, "Accueillir le client.")
    action_desc = action_tpl.format(items=items_str, products=prods_str)

    profile_lines = []
    if ctx.get("name"):          profile_lines.append(f"Nom : {ctx['name']}")
    if ctx.get("tag"):           profile_lines.append(f"Tag : {ctx['tag']}")
    if ctx.get("total_orders"):  profile_lines.append(f"Total commandes : {ctx['total_orders']}")
    if ctx.get("total_spent"):   profile_lines.append(f"Total dépensé : {ctx['total_spent']} TND")
    if ctx.get("gouvernorat"):   profile_lines.append(f"Gouvernorat : {ctx['gouvernorat']}")
    if proactive.get("order_id"):profile_lines.append(f"Commande concernée : #{proactive['order_id']}")

    prompt = _GREETING_PROMPT_TEMPLATE.format(
        lang     = lang,
        profile  = "\n".join(profile_lines),
        action_desc = action_desc,
        tone     = _TONE.get(ctx.get("tag", ""), "professionnel et chaleureux"),
    )

    client = _get_client()
    try:
        response = client.chat.completions.create(
            model=Config.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.7,
        )
        greeting = response.choices[0].message.content.strip()
    except Exception:
        # Fallback greeting
        name = ctx.get("name", "").split()[0] if ctx.get("name") else ""
        greeting = f"Bonjour{' ' + name if name else ''} ! Comment puis-je vous aider aujourd'hui ?"

    # Store greeting as first assistant message in history
    memory.add_message(session_id, "assistant", greeting)
    return greeting


def generate_post_identification_greeting(session_id: str, ctx: dict, lang: str = "français") -> str:
    """
    Generate a proactive contextual message right after a client is identified mid-conversation.
    Does NOT add to history — the caller decides whether to store it.
    """
    from app.agent.core import _get_client
    from config import Config

    if not ctx.get("known"):
        return ""

    proactive = ctx.get("proactive", {})
    ptype     = proactive.get("type", "welcome")
    items_str = ", ".join(proactive.get("items", [])) or "vos produits"
    prods_str = ", ".join(proactive.get("products", [])) or "produits complémentaires"
    action_tpl  = _ACTION_DESCRIPTIONS.get(ptype, "Accueillir le client.")
    action_desc = action_tpl.format(items=items_str, products=prods_str)

    profile_lines = []
    if ctx.get("name"):          profile_lines.append(f"Nom : {ctx['name']}")
    if ctx.get("tag"):           profile_lines.append(f"Tag : {ctx['tag']}")
    if ctx.get("total_orders"):  profile_lines.append(f"Total commandes : {ctx['total_orders']}")
    if ctx.get("total_spent"):   profile_lines.append(f"Total dépensé : {ctx['total_spent']} TND")
    if proactive.get("order_id"):profile_lines.append(f"Commande concernée : #{proactive['order_id']}")

    prompt = (
        f"Tu es l'assistant commercial de TuniOptique. Le client vient de s'identifier en cours de conversation.\n"
        f"Génère un message de bienvenue personnalisé en {lang} (2 phrases max).\n\n"
        f"PROFIL CLIENT :\n" + "\n".join(profile_lines) + "\n\n"
        f"ACTION RECOMMANDÉE : {action_desc}\n\n"
        f"INSTRUCTIONS : Salue par le prénom, mentionne directement l'action. Ton : "
        f"{_TONE.get(ctx.get('tag', ''), 'professionnel et chaleureux')}. "
        f"NE demande pas d'informations déjà connues."
    )

    client = _get_client()
    try:
        response = client.chat.completions.create(
            model=Config.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        name = ctx.get("name", "").split()[0] if ctx.get("name") else ""
        return f"Parfait{', ' + name if name else ''} ! Je vous reconnais dans notre système. Comment puis-je vous aider ?"
