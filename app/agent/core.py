"""
Core agent logic: GPT-4o with tool use support.
The system prompt is built dynamically to inject known customer context,
eliminating redundant questions.
"""
import json
from openai import OpenAI
from config import Config
from app.agent.tools import TOOLS, TOOL_HANDLERS
from app.agent import memory

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=Config.OPENAI_API_KEY)
    return _client


# ── Base system prompt (static part) ──────────────────────────────────────────
_BASE_PROMPT = """Tu es l'assistant commercial intelligent de TuniOptique, boutique tunisienne spécialisée en optique, instruments scientifiques et matériel médical.
Tu t'adaptes à la langue du client : français, arabe dialectal tunisien, ou anglais.

━━━ OUTILS DISPONIBLES ━━━
- get_customer_profile  : profil CRM + historique (appelle dès que tu as le téléphone)
- get_categories        : catégories du catalogue
- search_products       : chercher par mot-clé ou catégorie
- get_product_details   : détails complets d'un produit (prix live, stock, variantes)
- compare_products      : comparer 2–3 produits
- get_order_details     : consulter une commande (ID ou téléphone)
- check_delivery_status : suivi JAX par numéro de tracking
- get_delivery_info     : zones, délais et coûts de livraison
- get_invoice           : facture/reçu d'une commande
- generate_quote        : devis (appelle immédiatement avec les IDs produits)
- prepare_order_recap   : récapitulatif avant confirmation
- create_order          : créer la commande (après confirmation uniquement)
- escalate_to_human     : transférer vers un agent humain

━━━ IDENTIFICATION DU CLIENT — PRIORITÉ ABSOLUE ━━━
- COMMENCE TOUJOURS par identifier le client avant toute recommandation personnalisée.
- Si le client n'est pas encore identifié, demande son numéro de téléphone DÈS le début de la conversation (même pour une simple question produit).
- Dès que tu as le numéro → appelle get_customer_profile IMMÉDIATEMENT, avant toute autre action.
- Après l'appel get_customer_profile :
  * S'il a des commandes actives (non livrées) → mentionne-les proactivement et propose le suivi.
  * S'il a un historique d'achats → suggère des produits complémentaires basés sur ses achats.
  * S'il a une commande récente livrée → demande s'il est satisfait.
- Adapte le ton : Nouveau client (chaleureux), Client fidèle (personnel), VIP (prioritaire), À risque (patient).

━━━ PROCESSUS DE COMMANDE SIMPLIFIÉ ━━━
RÈGLE FONDAMENTALE : N'INTERROGE JAMAIS le client sur des informations déjà connues.
Les données disponibles dans « PROFIL CLIENT CONNU » ci-dessous sont confirmées — utilise-les directement.

Étapes :
1. Identifie le/les produit(s) — confirme ID et quantité.
2. Vérifie quelles infos manquent parmi : nom, téléphone, adresse, gouvernorat.
   → Ne demande QUE ce qui manque réellement (souvent rien pour un client connu).
3. Dès que tout est complet → appelle prepare_order_recap. JAMAIS create_order avant.
4. Attends confirmation explicite ("oui", "confirmer", "c'est bon", "ok").
5. Appelle create_order avec les mêmes données.
6. Communique le numéro de commande.

━━━ RÈGLES OUTILS OBLIGATOIRES ━━━
- Prix/stock produit → search_products ou get_product_details (jamais de mémoire)
- Livraison/délais   → get_delivery_info (jamais de mémoire)
- Facture/reçu       → get_invoice
- Devis              → generate_quote (dès que tu as les IDs produits, sans attendre le nom)
- Plainte/remboursement → escalate_to_human immédiatement

━━━ STYLE ━━━
Sois concis. Une réponse courte vaut mieux qu'un long paragraphe. Ne liste pas les étapes à suivre — agis directement."""


def _build_system_prompt(session_id: str) -> str:
    """Inject known customer data and active orders into the prompt."""
    customer = memory.get_customer_info(session_id)
    if not customer:
        return _BASE_PROMPT

    # Build the customer context block
    lines = []
    if customer.get("name"):       lines.append(f"  - Nom complet    : {customer['name']}")
    if customer.get("phone"):      lines.append(f"  - Téléphone      : {customer['phone']}")
    if customer.get("address"):    lines.append(f"  - Adresse        : {customer['address']}")
    if customer.get("gouvernorat"):lines.append(f"  - Gouvernorat    : {customer['gouvernorat']}")
    if customer.get("tag"):        lines.append(f"  - Tag CRM        : {customer['tag']}")
    if customer.get("email"):      lines.append(f"  - Email          : {customer['email']}")

    if not lines:
        return _BASE_PROMPT

    context_block = (
        "\n\n━━━ PROFIL CLIENT CONNU (NE PAS RE-DEMANDER) ━━━\n"
        + "\n".join(lines)
        + "\n→ Ces informations sont CONFIRMÉES. Pour toute commande, utilise-les directement "
          "sans poser de questions. Salue le client par son nom si tu le connais."
    )

    # Inject active (undelivered) orders if any exist in session memory
    active_orders = memory.get_active_orders(session_id)
    orders_block = ""
    if active_orders:
        order_lines = []
        for o in active_orders[:4]:
            status   = o.get("status", "")
            oid      = o.get("order_id", "")
            items    = ", ".join(i for i in o.get("items", []) if i)[:60]
            tracking = o.get("tracking_number", "")
            date     = o.get("created_at", "")
            line     = f"  - Commande #{oid} ({date}) : {status}"
            if items:    line += f" — {items}"
            if tracking: line += f" [tracking JAX: {tracking}]"
            order_lines.append(line)

        orders_block = (
            "\n\n━━━ COMMANDES ACTIVES (NON ENCORE LIVRÉES) ━━━\n"
            + "\n".join(order_lines)
            + "\n→ PROPOSE PROACTIVEMENT :\n"
              "   • Si statut 'Expédiées' + tracking → appelle check_delivery_status pour donner le suivi en temps réel.\n"
              "   • Si statut 'Confirmées' ou 'Prêt à expédier' → rassure le client sur le délai.\n"
              "   • Si statut 'En attente' → propose de confirmer la commande."
        )

    return _BASE_PROMPT + context_block + orders_block


# ── Tool category sets for UI routing ────────────────────────────────────────
_PRODUCT_LIST_TOOLS   = {"search_products", "compare_products"}
_PRODUCT_DETAIL_TOOLS = {"get_product_details"}
_ORDER_RECAP_TOOLS    = {"prepare_order_recap"}
_ORDER_CREATE_TOOLS   = {"create_order"}
_CRM_TOOLS            = {"get_customer_profile"}
_PENDING_ORDER_TOOLS  = {"get_pending_orders"}
_LOGISTICS_TOOLS      = {"get_delivery_info"}
_INVOICE_TOOLS        = {"get_invoice"}
_QUOTE_TOOLS          = {"generate_quote"}


def run_agent(session_id: str, user_message: str) -> dict:
    memory.add_message(session_id, "user", user_message)

    client      = _get_client()
    system_prompt = _build_system_prompt(session_id)
    tool_results_by_name: dict = {}
    last_recap: dict = memory.get_pending_recap(session_id)

    messages = [{"role": "system", "content": system_prompt}] + memory.get_history(session_id)

    response = client.chat.completions.create(
        model=Config.OPENAI_MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto"
    )
    assistant_message = response.choices[0].message

    while assistant_message.tool_calls:
        memory.add_assistant_tool_call(session_id, assistant_message.model_dump())

        for tool_call in assistant_message.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)

            # Inject session context into relevant tool calls
            if fn_name == "escalate_to_human":
                fn_args["session_id"] = session_id
                fn_args["customer"]   = memory.get_customer_info(session_id)

            elif fn_name == "create_order":
                fn_args["session_id"] = session_id
                if last_recap.get("items"):
                    fn_args["recap_items"] = last_recap["items"]
                # Auto-fill missing fields from session memory
                cust = memory.get_customer_info(session_id)
                for field, key in [("customer_name","name"),("phone","phone"),
                                    ("address","address"),("gouvernorat","gouvernorat")]:
                    if not fn_args.get(field) and cust.get(key):
                        fn_args[field] = cust[key]

            elif fn_name == "prepare_order_recap":
                # Auto-fill missing customer fields from session memory
                cust = memory.get_customer_info(session_id)
                for field, key in [("customer_name","name"),("phone","phone"),
                                    ("address","address"),("gouvernorat","gouvernorat")]:
                    if not fn_args.get(field) and cust.get(key):
                        fn_args[field] = cust[key]

            handler = TOOL_HANDLERS.get(fn_name)
            result  = handler(fn_args) if handler else {"error": f"Unknown tool: {fn_name}"}

            # ── Post-call side-effects ────────────────────────────────────────
            if fn_name == "get_customer_profile" and result.get("found"):
                # Enrich session customer info with profile data
                memory.update_customer_info(session_id, {
                    "name":        result.get("customer_name"),
                    "phone":       result.get("phone"),
                    "gouvernorat": result.get("gouvernorat"),
                    "tag":         result.get("tag"),
                    "email":       result.get("email", ""),
                })
                # Store active orders in session memory so system prompt includes them
                if result.get("active_orders"):
                    memory.set_active_orders(session_id, result["active_orders"])
                # Also try to get last known address from DB
                _try_load_address(session_id, result.get("phone"))

            elif fn_name == "get_pending_orders" and result.get("found"):
                memory.set_active_orders(session_id, result.get("orders", []))

            elif fn_name == "prepare_order_recap" and result.get("recap_ready"):
                last_recap = result
                memory.save_pending_recap(session_id, result)
                memory.update_customer_info(session_id, {
                    "name":        result.get("customer_name"),
                    "phone":       result.get("phone"),
                    "address":     result.get("address"),
                    "gouvernorat": result.get("gouvernorat"),
                })

            elif fn_name == "escalate_to_human":
                memory.mark_has_escalation(session_id)

            elif fn_name == "create_order" and result.get("success"):
                memory.clear_pending_recap(session_id)
                memory.mark_has_order(session_id)

            all_ui = (_PRODUCT_LIST_TOOLS | _PRODUCT_DETAIL_TOOLS | _ORDER_RECAP_TOOLS |
                      _ORDER_CREATE_TOOLS | _CRM_TOOLS | _PENDING_ORDER_TOOLS |
                      _LOGISTICS_TOOLS | _INVOICE_TOOLS | _QUOTE_TOOLS)
            if fn_name in all_ui:
                tool_results_by_name[fn_name] = result

            memory.add_tool_message(session_id, tool_call.id,
                                    json.dumps(result, ensure_ascii=False))

        # Rebuild prompt after tool calls (customer info may now be richer)
        system_prompt = _build_system_prompt(session_id)
        messages = [{"role": "system", "content": system_prompt}] + memory.get_history(session_id)
        response  = client.chat.completions.create(
            model=Config.OPENAI_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"
        )
        assistant_message = response.choices[0].message

    final_text = assistant_message.content or ""
    memory.add_message(session_id, "assistant", final_text)

    # ── Also run keyword fallback for logistics/invoice/quote ─────────────────
    msg_lower = user_message.lower()

    delivery_ui = None
    invoice_ui  = None
    quote_ui    = None

    if any(k in msg_lower for k in ["livraison","livrez","livrer","délai","delai","frais","port","expédition","expedition"]):
        from app.agent.tools import get_delivery_info
        import re
        gov_match = re.search(
            r'\b(tunis|sfax|sousse|bizerte|nabeul|monastir|mahdia|beja|béja|jendouba|kef|siliana'
            r'|kairouan|kasserine|sidi bouzid|gabes|gabès|medenine|médenine|tataouine|gafsa|tozeur|kebili|kébili'
            r'|ariana|ben arous|manouba|zaghouan)\b', msg_lower)
        gov = gov_match.group(0).title() if gov_match else None
        delivery_ui = get_delivery_info(gov) if gov else get_delivery_info()

    elif any(k in msg_lower for k in ["facture","reçu","recu","invoice","justificatif","duplicata"]):
        from app.agent.tools import get_invoice
        import re
        phone_match = re.search(r'\b[259]\d{7}\b', user_message)
        order_match = re.search(r'\b\d{6,8}\b', user_message)
        cust    = memory.get_customer_info(session_id)
        phone   = phone_match.group(0) if phone_match else cust.get("phone")
        oid     = int(order_match.group(0)) if order_match else None
        res     = get_invoice(order_id=oid, phone=phone)
        if res.get("found"):
            invoice_ui = res

    elif any(k in msg_lower for k in ["devis","estimation","quotation","estimer","combien coûte","quel prix"]):
        from app.agent.tools import generate_quote
        import re
        id_qty_pairs = re.findall(r'(?:id\s*[:#]?\s*)?(\d{5,7})(?:\s*[,xX×]\s*(\d+))?', user_message, re.IGNORECASE)
        items = []
        for pid_str, qty_str in id_qty_pairs:
            pid = int(pid_str)
            qty_before = re.search(rf'(\d+)\s+\w+.*?{pid_str}', user_message)
            qty = int(qty_str) if qty_str else (int(qty_before.group(1)) if qty_before else 1)
            items.append({"product_id": pid, "quantity": qty})
        if items:
            res = generate_quote(items)
            if res.get("quote_ready"):
                quote_ui = res

    # Merge keyword fallback results
    if "get_delivery_info" not in tool_results_by_name and delivery_ui:
        tool_results_by_name["get_delivery_info"] = delivery_ui
    if "get_invoice" not in tool_results_by_name and invoice_ui:
        tool_results_by_name["get_invoice"] = invoice_ui
    if "generate_quote" not in tool_results_by_name and quote_ui:
        tool_results_by_name["generate_quote"] = quote_ui

    # ── Build UI payload ──────────────────────────────────────────────────────
    products_ui      = None
    product_ui       = None
    order_recap_ui   = None
    order_result_ui  = None
    customer_ui      = None
    pending_orders_ui= None
    delivery_out     = None
    invoice_out      = None
    quote_out        = None

    for tool_name, result in tool_results_by_name.items():
        if tool_name == "search_products":
            products_ui = result.get("results", [])
        elif tool_name == "compare_products":
            products_ui = result.get("comparison", [])
        elif tool_name == "get_product_details" and "error" not in result:
            product_ui = result
        elif tool_name == "prepare_order_recap" and result.get("recap_ready"):
            order_recap_ui = result
        elif tool_name == "create_order" and result.get("success"):
            order_result_ui = result
        elif tool_name == "get_customer_profile":
            customer_ui = result
        elif tool_name == "get_pending_orders" and result.get("found"):
            pending_orders_ui = result
        elif tool_name == "get_delivery_info":
            delivery_out = result
        elif tool_name == "get_invoice" and result.get("found"):
            invoice_out = result
        elif tool_name == "generate_quote" and result.get("quote_ready"):
            quote_out = result

    return {
        "reply":          final_text,
        "products":       products_ui,
        "product":        product_ui,
        "order_recap":    order_recap_ui,
        "order_result":   order_result_ui,
        "customer":       customer_ui,
        "pending_orders": pending_orders_ui,
        "delivery":       delivery_out,
        "invoice":        invoice_out,
        "quote":          quote_out,
    }


def _try_load_address(session_id: str, phone: str):
    """Try to load the last known address from the local DB."""
    if not phone:
        return
    try:
        from app import database as db
        orders = db.get_orders_by_phone(phone, limit=1)
        if orders:
            last = orders[0]
            if last.get("address"):
                memory.update_customer_info(session_id, {
                    "address":     last["address"],
                    "gouvernorat": last.get("gouvernorat", ""),
                })
    except Exception:
        pass
