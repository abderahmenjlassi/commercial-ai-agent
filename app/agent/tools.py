"""
Tool definitions and implementations for the sales agent.

APIs:
  - TikTakPro    → product catalogue (search, details, categories)
  - TikTak Space → orders (lookup, create) + invoices
  - JAX Delivery → shipment tracking
"""
import json
import requests
from datetime import datetime
from config import Config

# ── Shared HTTP helpers ────────────────────────────────────────────────────────

def _tiktakpro_headers():
    return {"Authorization": f"Token {Config.TIKTAKPRO_TOKEN}"}

def _tiktak_space_headers():
    return {"Authorization": f"Token {Config.TIKTAK_SPACE_TOKEN}"}

def _jax_headers():
    return {"Authorization": f"Bearer {Config.JAX_API_TOKEN}"}

def _get(url, headers, params=None) -> dict:
    try:
        r = requests.get(url, headers=headers, params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError:
        return {"error": f"HTTP {r.status_code}", "detail": r.text[:200]}
    except Exception as e:
        return {"error": str(e)}

def _post(url, headers, payload) -> dict:
    try:
        r = requests.post(url, headers={**headers, "Content-Type": "application/json"},
                          json=payload, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError:
        return {"error": f"HTTP {r.status_code}", "detail": r.text[:300]}
    except Exception as e:
        return {"error": str(e)}

def _format_price(product: dict) -> dict:
    """Compute final price after discount."""
    price = product.get("price", 0)
    discount = product.get("discount", 0) or 0
    dtype = product.get("discount_type", "")
    if discount > 0:
        if dtype == "fixed_amount":
            final = max(0, price - discount)
        elif dtype == "percentage":
            final = round(price * (1 - discount / 100), 2)
        else:
            final = price
    else:
        final = price
    return {"original": price, "final": final, "has_discount": discount > 0}


# ── Tool schemas (sent to OpenAI) ──────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_customer_profile",
            "description": (
                "Fetch the full CRM profile of a customer using their phone number: "
                "order history, total spent, loyalty tag, and previously bought categories. "
                "Always call this when the client provides their phone number, BEFORE making "
                "any recommendations — it enables personalized suggestions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Customer phone number (8 digits, Tunisia)"
                    }
                },
                "required": ["phone"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_recommended_products",
            "description": (
                "Return personalized product recommendations for an identified customer, "
                "based on their purchase history stored in the local catalog. "
                "Finds complementary products in the same categories as what they have bought before. "
                "Falls back to popular products if no history is found. "
                "Call this whenever the customer asks for suggestions, recommendations, "
                "or 'what should I buy', AND when the proactive action is 'upsell'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Customer phone number (8 digits, Tunisia)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of products to return (default 6)",
                        "default": 6
                    }
                },
                "required": ["phone"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "verify_product_live",
            "description": (
                "Verify the CURRENT price and stock of a product by querying the live API. "
                "Use this when: (1) a client asks if a product is still available or its exact price, "
                "(2) local data might be outdated. "
                "This updates the local catalog with the fresh data and reports any price or stock changes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "integer",
                        "description": "Numeric product ID to verify"
                    }
                },
                "required": ["product_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_delivery_info",
            "description": (
                "Return delivery information: zones covered, estimated delays by region, "
                "shipping costs, and payment methods. Use when the client asks about "
                "delivery, shipping, availability in their city, or when an order is due."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "gouvernorat": {
                        "type": "string",
                        "description": "Optional: specific gouvernorat to get targeted info"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_invoice",
            "description": (
                "Retrieve an invoice or receipt for an existing order. "
                "Provide order_id if known, otherwise use phone + customer_name. "
                "Use when the client asks for a facture, reçu, or justificatif."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "integer",
                        "description": "TikTak order ID (optional)"
                    },
                    "phone": {
                        "type": "string",
                        "description": "Customer phone number (optional)"
                    },
                    "customer_name": {
                        "type": "string",
                        "description": "Customer name for search (optional)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_quote",
            "description": (
                "Generate a price quote (devis) for a list of products. "
                "Use when the client asks for a devis or wants to know the total. "
                "Call this IMMEDIATELY with the product IDs provided — do NOT wait "
                "for a customer name, it is optional. Does not create any order."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "description": "Products to quote",
                        "items": {
                            "type": "object",
                            "properties": {
                                "product_id": {"type": "integer"},
                                "quantity":   {"type": "integer"}
                            },
                            "required": ["product_id", "quantity"]
                        }
                    },
                    "customer_name": {
                        "type": "string",
                        "description": "Optional customer name for the quote header"
                    }
                },
                "required": ["items"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_categories",
            "description": (
                "Return the full list of product categories available in the catalogue. "
                "Use this when the client wants to browse by category or asks what types "
                "of products are available."
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": (
                "Search the product catalogue by name, keyword, or category ID. "
                "Returns products with price, stock, and discount info. "
                "Always use this before recommending a product — never invent product data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search term — product name, keyword. Leave empty if filtering by category only."
                    },
                    "category_id": {
                        "type": "integer",
                        "description": "Optional: filter by category ID (from get_categories)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default 8)",
                        "default": 8
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": (
                "Get the complete details of a product by its ID: full description, price, "
                "stock, all variants, specs and promotions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "integer",
                        "description": "Numeric product ID from search_products results"
                    }
                },
                "required": ["product_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_products",
            "description": (
                "Compare 2 or 3 products side by side on price, stock, features and specs. "
                "Use this when a client is hesitating between several products."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of 2 or 3 product IDs to compare",
                        "minItems": 2,
                        "maxItems": 3
                    }
                },
                "required": ["product_ids"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_order_details",
            "description": (
                "Look up an existing order. Provide the order ID or the customer's phone number."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "integer",
                        "description": "Numeric order ID (optional if phone given)"
                    },
                    "phone": {
                        "type": "string",
                        "description": "Customer phone number (optional if order_id given)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_delivery_status",
            "description": (
                "Track a shipment via JAX Delivery using the tracking code from the order."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "tracking_number": {
                        "type": "string",
                        "description": "JAX tracking code (e.g. BIZ2690109201907)"
                    }
                },
                "required": ["tracking_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_order_recap",
            "description": (
                "Generate the order recap card. Call this as soon as you have the product(s) "
                "and the client confirms they want to order. Missing customer fields (name, "
                "phone, address, gouvernorat) are auto-filled from the known profile — "
                "include whatever you already know. The tool will tell you what is still missing. "
                "Do NOT call create_order until the client explicitly confirms the recap."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_ids": {
                        "type": "array",
                        "description": "Products to order",
                        "items": {
                            "type": "object",
                            "properties": {
                                "product_id": {"type": "integer"},
                                "quantity":   {"type": "integer"}
                            },
                            "required": ["product_id", "quantity"]
                        }
                    },
                    "customer_name": {"type": "string", "description": "Full name (skip if already known)"},
                    "phone":         {"type": "string", "description": "Phone number (skip if already known)"},
                    "address":       {"type": "string", "description": "Delivery address (skip if already known)"},
                    "gouvernorat":   {"type": "string", "description": "Gouvernorat (skip if already known)"},
                    "payement_type": {"type": "string", "default": "CASH"},
                    "comment":       {"type": "string"}
                },
                "required": ["product_ids"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_order",
            "description": (
                "Create the order in the system. Only call this AFTER prepare_order_recap "
                "was shown AND the client explicitly said yes/confirmed. "
                "Use exactly the same data from the recap."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_name": {"type": "string"},
                    "phone": {"type": "string"},
                    "address": {"type": "string"},
                    "gouvernorat": {"type": "string"},
                    "products": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "product_id": {"type": "integer"},
                                "quantity": {"type": "integer"}
                            },
                            "required": ["product_id", "quantity"]
                        }
                    },
                    "payement_type": {"type": "string", "default": "CASH"},
                    "comment": {"type": "string"}
                },
                "required": ["customer_name", "phone", "address", "gouvernorat", "products"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_pending_orders",
            "description": (
                "Return all orders for a customer that are confirmed but NOT yet delivered. "
                "Includes status, items, and tracking number (when available). "
                "Use this to give the customer a full picture of their in-progress orders, "
                "or when they ask 'où est ma commande', 'mes commandes en cours', etc. "
                "For individual JAX tracking, follow up with check_delivery_status."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Customer phone number (8 digits, Tunisia)"
                    }
                },
                "required": ["phone"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_to_human",
            "description": (
                "Transfer to a human agent when: client is upset, complaint, "
                "refund/exchange request, or situation is too complex."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "summary": {"type": "string"}
                },
                "required": ["reason", "summary"]
            }
        }
    }
]


# ── Tool implementations ────────────────────────────────────────────────────────

def get_customer_profile(phone: str) -> dict:
    """
    Fetch customer profile from local DB (populated by import + webhook).
    Falls back to live TikTak Space API if customer not found locally.
    """
    from app import database as db_module

    customer = db_module.get_customer(phone)

    _active_statuses = {'En attente', 'Confirmées', 'Prêt à expédier', 'Expédiées'}

    if customer and customer.get("total_orders", 0) > 0:
        # Customer exists in local DB — build profile from stored data
        orders = db_module.get_orders_by_phone(phone, limit=20)
        bought_products = []
        cat_counts: dict = {}
        delivered = 0
        active_orders = []

        for o in orders:
            status = (o.get("status") or "")
            if "livr" in status.lower():
                delivered += 1
            if status in _active_statuses:
                active_orders.append({
                    "order_id":        o.get("external_id") or o["id"],
                    "status":          status,
                    "items":           [i.get("product_name", "") for i in o.get("items", [])[:3]],
                    "tracking_number": o.get("tracking_number", ""),
                    "created_at":      (o.get("created_at", "") or "")[:10],
                    "total":           o.get("total", 0),
                    "gouvernorat":     o.get("gouvernorat", ""),
                })
            for item in o.get("items", []):
                pname = item.get("product_name", "")
                if pname and pname not in bought_products:
                    bought_products.append(pname)
                pid = item.get("product_id")
                if pid:
                    cat_counts[str(pid)] = cat_counts.get(str(pid), 0) + 1

        top_category_id = max(cat_counts, key=cat_counts.get) if cat_counts else None
        last_order = orders[0]["created_at"][:10] if orders else None

        # Build hint that tells the agent what to do next
        hints = []
        if active_orders:
            in_transit = [o for o in active_orders if o["status"] == "Expédiées"]
            waiting    = [o for o in active_orders if o["status"] in ("Confirmées", "Prêt à expédier")]
            pending    = [o for o in active_orders if o["status"] == "En attente"]
            if in_transit:
                hints.append(f"{len(in_transit)} commande(s) en transit — propose le suivi JAX.")
            if waiting:
                hints.append(f"{len(waiting)} commande(s) confirmée(s) en attente d'expédition.")
            if pending:
                hints.append(f"{len(pending)} commande(s) en attente de confirmation.")
        if bought_products:
            hints.append(f"Produits achetés : {', '.join(bought_products[:3])}. Propose des complémentaires.")

        return {
            "phone":             phone,
            "found":             True,
            "customer_name":     customer.get("name", ""),
            "gouvernorat":       customer.get("gouvernorat", ""),
            "tag":               customer.get("tag", "Client régulier"),
            "total_orders":      customer.get("total_orders", 0),
            "delivered_orders":  delivered,
            "cancelled_orders":  0,
            "total_spent":       customer.get("total_spent", 0),
            "last_order_date":   last_order,
            "top_category_id":   top_category_id,
            "bought_products":   bought_products[:5],
            "active_orders":     active_orders,
            "recommendation_hint": " ".join(hints) if hints else "Nouveau profil — accueille chaleureusement.",
        }

    # Fallback: query TikTak Space live (for new customers not yet in DB)
    data = _get(f"{Config.TIKTAK_SPACE_BASE}/orders/", _tiktak_space_headers(),
                params={"phone": phone, "limit": 20})
    if "error" in data:
        return {"phone": phone, "found": False, "tag": "Nouveau client",
                "total_orders": 0, "total_spent": 0,
                "message": "Aucune commande trouvée. C'est un nouveau client."}

    orders = data.get("results", [])
    total_orders = data.get("count", 0)
    if total_orders == 0:
        return {"phone": phone, "found": False, "tag": "Nouveau client",
                "total_orders": 0, "total_spent": 0,
                "message": "Aucune commande trouvée. C'est un nouveau client."}

    total_spent  = sum(o.get("total_amount", 0) for o in orders)
    cancelled    = sum(1 for o in orders if "annul" in o.get("step_name","").lower())
    delivered    = sum(1 for o in orders if "livr"  in o.get("step_name","").lower())
    customer_name= orders[0].get("name","") if orders else ""
    gouvernorat  = orders[0].get("gouvernorat","") if orders else ""
    last_order   = orders[0]["created_at"][:10] if orders else None
    cat_counts: dict = {}
    bought_products = []
    for o in orders:
        for d in o.get("_details",[]):
            cid = d.get("category_id")
            if cid: cat_counts[cid] = cat_counts.get(cid, 0) + 1
            pname = d.get("product_name","")
            if pname and pname not in bought_products:
                bought_products.append(pname)
    top_cat = max(cat_counts, key=cat_counts.get) if cat_counts else None
    if cancelled >= total_orders // 2 and cancelled > 0: tag = "Client à risque"
    elif total_orders >= 10 or total_spent >= 5000:       tag = "Client VIP"
    elif total_orders >= 3:                               tag = "Client fidèle"
    else:                                                 tag = "Client régulier"

    # Save to local DB for next time
    if phone:
        db_module.upsert_customer(phone, customer_name, "", gouvernorat, "")
        db_module.refresh_customer_stats(phone)

    return {
        "phone": phone, "found": True, "customer_name": customer_name,
        "gouvernorat": gouvernorat, "tag": tag,
        "total_orders": total_orders, "delivered_orders": delivered,
        "cancelled_orders": cancelled, "total_spent": round(total_spent, 2),
        "last_order_date": last_order, "top_category_id": top_cat,
        "bought_products": bought_products[:5],
        "recommendation_hint": (
            f"Produits achetés : {', '.join(bought_products[:3])}." if bought_products else ""
        )
    }


DELIVERY_ZONES = {
    "express_24h": ["Tunis", "Ariana", "Ben Arous", "Manouba"],
    "standard_48h": ["Nabeul", "Zaghouan", "Bizerte", "Sousse", "Monastir", "Mahdia", "Sfax"],
    "extended_72h": ["Béja", "Jendouba", "Le Kef", "Siliana", "Kairouan", "Kasserine",
                     "Sidi Bouzid", "Gabès", "Médenine", "Tataouine", "Gafsa", "Tozeur", "Kébili"],
}
DELIVERY_COST = {"express_24h": 7, "standard_48h": 7, "extended_72h": 8}


def get_delivery_info(gouvernorat: str = None) -> dict:
    from datetime import datetime
    all_zones = {gov: zone for zone, govs in DELIVERY_ZONES.items() for gov in govs}

    if gouvernorat:
        # Find matching zone (case-insensitive partial match)
        matched = next(
            (z for g, z in all_zones.items() if gouvernorat.lower() in g.lower() or g.lower() in gouvernorat.lower()),
            None
        )
        delay_map = {"express_24h": "24h", "standard_48h": "48h", "extended_72h": "72h"}
        if matched:
            return {
                "gouvernorat": gouvernorat,
                "zone": matched,
                "delay": delay_map[matched],
                "cost": DELIVERY_COST[matched],
                "covered": True,
                "payment": "Paiement à la livraison (Cash on Delivery)",
            }
        return {"gouvernorat": gouvernorat, "covered": False,
                "message": f"{gouvernorat} n'est pas encore couvert par notre service de livraison."}

    return {
        "transporter": "JAX Delivery",
        "zones": {
            "Express 24h (7 TND)": DELIVERY_ZONES["express_24h"],
            "Standard 48h (7 TND)": DELIVERY_ZONES["standard_48h"],
            "Étendu 72h (8 TND)": DELIVERY_ZONES["extended_72h"],
        },
        "payment": "Paiement à la livraison (Cash on Delivery)",
        "working_days": "Lundi – Samedi",
        "note": "Livraison gratuite sur certains produits (affiché sur la fiche produit).",
    }


def get_invoice(order_id: int = None, phone: str = None, customer_name: str = None) -> dict:
    """Try to find an invoice: by order_id first, then by customer name search."""
    # Strategy 1: get the order → use its data to build/find invoice
    if order_id:
        order_data = _get(f"{Config.TIKTAK_SPACE_BASE}/orders/{order_id}/",
                          _tiktak_space_headers())
        if "error" not in order_data and "id" in order_data:
            return _build_invoice_from_order(order_data)

    if phone:
        orders = _get(f"{Config.TIKTAK_SPACE_BASE}/orders/", _tiktak_space_headers(),
                      params={"phone": phone, "limit": 1})
        if "error" not in orders and orders.get("results"):
            return _build_invoice_from_order(orders["results"][0])

    # Strategy 2: search invoice by customer name
    if customer_name:
        inv_data = _get(f"{Config.TIKTAK_SPACE_BASE}/invoices/", _tiktak_space_headers(),
                        params={"search": customer_name, "limit": 1})
        if "error" not in inv_data and inv_data.get("results"):
            return _format_invoice(inv_data["results"][0])

    return {"found": False, "message": "Aucune facture trouvée. Fournissez l'ID de commande, le téléphone ou le nom."}


def _build_invoice_from_order(order: dict) -> dict:
    """Build a receipt-style invoice from order data."""
    items = []
    for d in order.get("_details", []):
        items.append({
            "product_name": d["product_name"],
            "quantity": d["quantity"],
            "price_ttc": d["price_ttc"],
            "discount": d.get("discount", 0),
            "final_price": d["final_price"],
        })
    return {
        "found": True,
        "source": "order",
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "customer_name": order.get("name"),
        "phone": order.get("phone"),
        "address": f"{order.get('address', '')}, {order.get('gouvernorat', '')}",
        "date": order["created_at"][:10],
        "status": order.get("step_name"),
        "payment_type": order.get("payement_type", "CASH"),
        "is_paid": order.get("is_paid", False),
        "items": items,
        "total": order.get("total_amount", 0),
        "transport_cost": order.get("intern_transport_price", 0),
    }


def _format_invoice(inv: dict) -> dict:
    return {
        "found": True,
        "source": "invoice",
        "invoice_number": inv.get("invoice_number"),
        "order_id": inv.get("order"),
        "customer_name": inv.get("name"),
        "phone": inv.get("phone"),
        "address": f"{inv.get('address','')}, {inv.get('gouvernorat','')}",
        "date": inv.get("created_at", "")[:10],
        "is_paid": inv.get("is_paid", False),
        "items": inv.get("details", []),
        "total": inv.get("total_after_discount", 0),
        "taxes": inv.get("taxes", {}),
        "code_tva": inv.get("code_tva", ""),
    }


def generate_quote(items: list, customer_name: str = "") -> dict:
    """Fetch product details for each item and build a quote."""
    from datetime import datetime, timedelta
    lines = []
    total_ht = 0.0
    total_ttc = 0.0
    errors = []

    for entry in items:
        pid = entry.get("product_id")
        qty = entry.get("quantity", 1)
        detail = get_product_details(pid)
        if "error" in detail:
            errors.append(f"Produit {pid} introuvable.")
            continue
        price_ht  = round(detail["price_final"] / (1 + (detail.get("taxe_rate", 19) or 19) / 100), 3)
        line_ttc  = round(detail["price_final"] * qty, 2)
        line_ht   = round(price_ht * qty, 3)
        total_ht  += line_ht
        total_ttc += line_ttc
        lines.append({
            "product_id":   pid,
            "name":         detail["name"],
            "photo":        detail.get("photo", ""),
            "price_unit":   detail["price_final"],
            "price_ht":     price_ht,
            "quantity":     qty,
            "line_ht":      line_ht,
            "line_ttc":     line_ttc,
            "in_stock":     detail["in_stock"],
        })

    if errors:
        return {"error": " ".join(errors)}

    validity = (datetime.now() + timedelta(days=7)).strftime("%d/%m/%Y")
    return {
        "quote_ready":    True,
        "quote_ref":      f"DEV-{datetime.now().strftime('%Y%m%d-%H%M')}",
        "customer_name":  customer_name,
        "date":           datetime.now().strftime("%d/%m/%Y"),
        "validity":       validity,
        "lines":          lines,
        "total_ht":       round(total_ht, 2),
        "total_ttc":      round(total_ttc, 2),
        "tva_amount":     round(total_ttc - total_ht, 2),
        "payment":        "Paiement à la livraison (COD)",
    }


def get_categories() -> dict:
    """Return categories from local DB (fast). Falls back to API if DB is empty."""
    from app import database as db_module
    local = db_module.get_all_categories_local()
    if local:
        return {"categories": local, "source": "local"}
    # Fallback to API
    data = _get(f"{Config.TIKTAKPRO_BASE}/categories/", _tiktakpro_headers(), params={"limit": 50})
    if "error" in data:
        return data
    seen, unique = set(), []
    for c in data.get("results", []):
        if c.get("name") and c["name"] not in seen:
            seen.add(c["name"]); unique.append({"id": c["id"], "name": c["name"]})
    return {"categories": unique, "source": "api"}


def search_products(query: str = "", category_id: int = None,
                    max_price: float = None, in_stock_only: bool = False,
                    limit: int = 10) -> dict:
    """
    Search products using local DB (instant, ranked by relevance).
    Falls back to TikTakPro API if local catalog is empty (not yet synced).
    """
    from app import database as db_module

    # Try local DB first
    local = db_module.search_products_local(
        query=query, category_id=category_id,
        max_price=max_price, in_stock_only=in_stock_only,
        limit=limit
    )

    if local:
        return {
            "total_found": len(local),
            "showing":     len(local),
            "source":      "local",
            "results": [{
                "id":             p["id"],
                "name":           p["name"],
                "category":       p["category_name"],
                "price_original": p["price"],
                "price_final":    p["price_final"],
                "has_discount":   p["has_discount"],
                "stock":          p["stock"],
                "in_stock":       p["in_stock"],
                "photo":          p["photo_thumb"] or p["photo"],
                "description":    p["description"][:200] if p.get("description") else "",
            } for p in local]
        }

    # Fallback: API search
    params = {"limit": limit, "active": "true"}
    if query:       params["search"]   = query
    if category_id: params["category"] = category_id
    data = _get(f"{Config.TIKTAKPRO_BASE}/products/", _tiktakpro_headers(), params=params)
    if "error" in data:
        return data
    results = []
    for p in data.get("results", []):
        pricing = _format_price(p)
        results.append({
            "id": p["id"], "name": p["name"],
            "category": (p.get("_category") or {}).get("name", ""),
            "price_original": pricing["original"], "price_final": pricing["final"],
            "has_discount": pricing["has_discount"],
            "stock": p["stock"], "in_stock": p["stock"] > 0,
            "photo": p.get("photo_thumb") or p.get("photo", ""),
        })
    return {"total_found": data.get("count", 0), "showing": len(results),
            "source": "api", "results": results}


def get_product_details(product_id: int) -> dict:
    """
    Get product details from local DB.
    Falls back to API if product not found locally (e.g. catalog not yet synced).
    """
    from app import database as db_module

    local = db_module.get_product_local(product_id)
    if local:
        return {
            "id":             local["id"],
            "name":           local["name"],
            "description":    local.get("description", ""),
            "category":       local["category_name"],
            "category_id":    local.get("category_id"),
            "price_original": local["price"],
            "price_final":    local["price_final"],
            "has_discount":   local["has_discount"],
            "discount":       local.get("discount", 0),
            "discount_type":  local.get("discount_type", ""),
            "stock":          local["stock"],
            "in_stock":       local["in_stock"],
            "variants":       local.get("variants", []),
            "photo":          local.get("photo", ""),
            "photo_thumb":    local.get("photo_thumb", ""),
            "features":       local.get("features", []),
            "sold":           local.get("sold", 0),
            "source":         "local",
        }

    # Fallback: API
    data = _get(f"{Config.TIKTAKPRO_BASE}/products/{product_id}/", _tiktakpro_headers())
    if "error" in data:
        return data
    pricing = _format_price(data)
    import re
    clean_desc = re.sub(r'<[^>]+>', '', data.get("description", ""))[:600]
    return {
        "id": data["id"], "name": data["name"], "description": clean_desc,
        "category": (data.get("_category") or {}).get("name", ""),
        "price_original": pricing["original"], "price_final": pricing["final"],
        "has_discount": pricing["has_discount"],
        "stock": data["stock"], "in_stock": data["stock"] > 0,
        "variants": [{"id": d.get("id"), "name": d.get("name",""), "price": d.get("price"), "stock": d.get("stock",0)}
                     for d in data.get("declinaisons", [])],
        "photo": data.get("photo",""), "features": [f.get("name") for f in data.get("features",[]) if f.get("name")],
        "source": "api",
    }


def compare_products(product_ids: list) -> dict:
    products = []
    for pid in product_ids:
        detail = get_product_details(pid)
        if "error" not in detail:
            products.append(detail)
    if not products:
        return {"error": "Could not fetch product details for comparison."}
    return {"comparison": products}


def get_order_details(order_id: int = None, phone: str = None) -> dict:
    """Query local DB first; fall back to live TikTak Space API if not found."""
    from app import database as db_module

    # ── Local DB lookup ──────────────────────────────────────────────────────
    if order_id:
        o = db_module.get_order(str(order_id))
        if o:
            return {"found": True, "orders": [_format_db_order(o)]}
    if phone:
        local = db_module.get_orders_by_phone(phone, limit=5)
        if local:
            return {"found": True, "orders": [_format_db_order(o) for o in local]}

    # ── Fallback: live API ───────────────────────────────────────────────────
    if order_id:
        data   = _get(f"{Config.TIKTAK_SPACE_BASE}/orders/{order_id}/", _tiktak_space_headers())
        orders = [data] if "id" in data else []
    elif phone:
        data   = _get(f"{Config.TIKTAK_SPACE_BASE}/orders/", _tiktak_space_headers(),
                      params={"phone": phone, "limit": 5})
        orders = data.get("results", [])
    else:
        return {"error": "Fournissez un order_id ou un numéro de téléphone."}

    if not orders:
        return {"found": False, "message": "Aucune commande trouvée."}

    result = []
    for o in orders:
        items = [{"product": d["product_name"], "qty": d["quantity"], "price": d["final_price"]}
                 for d in o.get("_details", [])]
        result.append({
            "order_id": o["id"], "status": o["step_name"],
            "customer": o["name"], "phone": o["phone"],
            "gouvernorat": o["gouvernorat"], "address": o["address"],
            "total": o["total_amount"], "payment": o["payement_type"],
            "tracking_number": o.get("transport_system_id"),
            "created_at": o["created_at"][:10], "items": items,
        })
    return {"found": True, "orders": result}


def _format_db_order(o: dict) -> dict:
    items = [{"product": i.get("product_name",""), "qty": i.get("quantity",1),
              "price": i.get("final_price", 0)} for i in o.get("items",[])]
    return {
        "order_id":       o.get("external_id") or o["id"],
        "status":         o.get("status",""),
        "customer":       o.get("customer_name",""),
        "phone":          o.get("customer_phone",""),
        "gouvernorat":    o.get("gouvernorat",""),
        "address":        o.get("address",""),
        "total":          o.get("total", 0),
        "payment":        o.get("payment_type","CASH"),
        "tracking_number":o.get("tracking_number",""),
        "created_at":     (o.get("created_at","") or "")[:10],
        "source":         o.get("source",""),
        "items":          items,
    }


def check_delivery_status(tracking_number: str) -> dict:
    if not Config.JAX_API_TOKEN:
        return {"error": "JAX_API_TOKEN not configured.", "tracking_number": tracking_number}

    data = _get(f"{Config.JAX_BASE}/user/colis/all", _jax_headers(),
                params={"code": tracking_number})

    if "error" in data:
        return data

    colis_list = data.get("data", [])
    if not colis_list:
        return {"found": False, "tracking_number": tracking_number,
                "message": "Aucun colis trouvé pour ce numéro de suivi."}

    c = colis_list[0]
    latest = c.get("latest_statut") or {}

    return {
        "found": True,
        "tracking_number": c.get("code"),
        "reference": c.get("referenceExterne"),
        "recipient": c.get("nomContact"),
        "phone": c.get("tel"),
        "address": c.get("adresseLivraison"),
        "gouvernorat": (c.get("governorats") or {}).get("name", c.get("governorat", "")),
        "status": latest.get("libelle", "Inconnu"),
        "status_color": latest.get("color", ""),
        "cod_amount": c.get("cod"),
        "paid": bool(c.get("paye")),
        "pickup_date": c.get("date_enlev"),
        "delivery_date": c.get("date_liv"),
        "attempts": c.get("tentative", 0),
        "comment": c.get("commentaire", ""),
    }


def prepare_order_recap(customer_name: str = "", phone: str = "", address: str = "",
                        gouvernorat: str = "", product_ids: list = None,
                        payement_type: str = "CASH", comment: str = "") -> dict:
    """
    Fetch product details (local DB + live API verification) and build the order recap.
    Live price/stock is checked for any product whose local data is older than
    Config.PRODUCT_LIVE_CHECK_MINUTES, so the recap always reflects real current prices.
    """
    product_ids = product_ids or []

    # Validate required customer fields
    missing = []
    if not customer_name: missing.append("nom complet")
    if not phone:         missing.append("numéro de téléphone")
    if not address:       missing.append("adresse de livraison")
    if not gouvernorat:   missing.append("gouvernorat")
    if not product_ids:   missing.append("produit(s)")
    if missing:
        return {
            "recap_ready":   False,
            "missing_fields": missing,
            "message": f"Informations manquantes : {', '.join(missing)}. Demande uniquement ces champs au client."
        }

    from datetime import timedelta
    from app import database as db_module
    stale_threshold = timedelta(minutes=Config.PRODUCT_LIVE_CHECK_MINUTES)
    now = datetime.now()

    items       = []
    total       = 0.0
    errors      = []
    price_alerts= []   # products whose price changed since last sync

    for entry in product_ids:
        pid = entry.get("product_id")
        qty = entry.get("quantity", 1)

        # Determine if local data is fresh enough
        local = db_module.get_product_local(pid)
        needs_live_check = True
        if local and local.get("synced_at"):
            try:
                age = now - datetime.strptime(local["synced_at"][:19], "%Y-%m-%d %H:%M:%S")
                needs_live_check = age > stale_threshold
            except Exception:
                pass

        if needs_live_check:
            live = verify_product_live(pid)
            if live.get("verified"):
                price_final = live["price_live"]
                in_stock    = live["in_stock"]
                stock       = live["stock_live"]
                name        = live["name"] or (local.get("name") if local else f"Produit #{pid}")
                photo       = local.get("photo", "") if local else ""
                if live.get("price_changed"):
                    price_alerts.append(
                        f"{name} : prix mis à jour {live['price_local']} → {live['price_live']} TND"
                    )
                if not in_stock:
                    errors.append(f"'{name}' est en rupture de stock (vérifié en direct).")
                    continue
            elif local:
                # Live check failed — fall back to local data with a freshness note
                price_final = local["price_final"]
                in_stock    = bool(local["in_stock"])
                stock       = local["stock"]
                name        = local["name"]
                photo       = local.get("photo", "")
            else:
                errors.append(f"Produit {pid} introuvable.")
                continue
        else:
            # Local data is fresh — use it directly
            detail = get_product_details(pid)
            if "error" in detail:
                errors.append(f"Produit {pid} introuvable.")
                continue
            price_final = detail["price_final"]
            in_stock    = detail["in_stock"]
            stock       = detail["stock"]
            name        = detail["name"]
            photo       = detail.get("photo", "")

        if not in_stock:
            errors.append(f"'{name}' n'est plus disponible.")
            continue

        line_total = round(price_final * qty, 2)
        total += line_total
        items.append({
            "product_id":  pid,
            "name":        name,
            "price_unit":  price_final,
            "quantity":    qty,
            "line_total":  line_total,
            "photo":       photo,
            "in_stock":    in_stock,
            "stock":       stock,
            "price_verified": needs_live_check,
        })

    if errors and not items:
        return {"error": " ".join(errors)}

    recap = {
        "recap_ready":   True,
        "customer_name": customer_name,
        "phone":         phone,
        "address":       address,
        "gouvernorat":   gouvernorat,
        "payement_type": payement_type,
        "comment":       comment,
        "items":         items,
        "total":         round(total, 2),
        "prices_verified": True,
    }
    if price_alerts:
        recap["price_alerts"] = price_alerts
    if errors:
        recap["warnings"] = errors

    return recap


def create_order(customer_name: str, phone: str, address: str, gouvernorat: str,
                 products: list, payement_type: str = "CASH", comment: str = "",
                 session_id: str = "", recap_items: list = None) -> dict:
    """
    Saves the order locally in the admin dashboard.
    TODO: replace with real API call when the external system is ready:
        payload = { "name": customer_name, "phone": phone, ... }
        result = _post(f"{Config.TIKTAK_SPACE_BASE}/orders/", _tiktak_space_headers(), payload)
    """
    from app import orders_store

    # Use enriched recap items if available, otherwise build minimal items list
    items = recap_items or [
        {"product_id": p["product_id"], "quantity": p["quantity"],
         "name": f"Produit #{p['product_id']}", "price_unit": 0, "line_total": 0}
        for p in products
    ]
    total = round(sum(i.get("line_total", 0) for i in items), 2)

    order = orders_store.create(
        customer_name=customer_name,
        phone=phone,
        address=address,
        gouvernorat=gouvernorat,
        items=items,
        total=total,
        payement_type=payement_type,
        comment=comment,
        session_id=session_id,
    )

    # Persist to local DB
    from app import database as db_module
    if phone:
        db_module.upsert_customer(phone, customer_name, "", gouvernorat, address)
    db_module.upsert_order(
        order_id      = order["id"],
        source        = "chat",
        customer_phone= phone,
        customer_name = customer_name,
        address       = address,
        gouvernorat   = gouvernorat,
        status        = "En attente",
        payment_type  = payement_type,
        total         = total,
        comment       = comment,
        items         = items,
    )
    if phone:
        db_module.refresh_customer_stats(phone)

    return {
        "success": True,
        "order_id": order["id"],
        "status": "En attente de confirmation",
        "total": total,
        "message": "Commande enregistrée avec succès. Un agent va confirmer votre commande sous peu."
    }


def get_recommended_products(phone: str, limit: int = 6) -> dict:
    """
    Return personalized product recommendations based on the customer's purchase history.
    Uses local DB — fast and offline-capable. Falls back to popular products.
    """
    from app import database as db_module

    orders = db_module.get_orders_by_phone(phone, limit=30)
    bought_ids   = []
    bought_names = []
    for o in orders:
        for item in o.get("items", []):
            pid   = item.get("product_id")
            pname = item.get("product_name", "")
            if pid and pid not in bought_ids:
                bought_ids.append(int(pid))
            if pname and pname not in bought_names:
                bought_names.append(pname)

    if bought_ids:
        products = db_module.get_complementary_products(bought_ids, limit)
        rtype    = "complementary"
        message  = (
            f"Basé sur vos achats précédents ({', '.join(bought_names[:2])}…)"
            if bought_names else "Produits complémentaires"
        )
    else:
        products = db_module.get_popular_products(limit)
        rtype    = "popular"
        message  = "Produits populaires du moment"

    if not products:
        # Absolute fallback: any active in-stock products
        products = db_module.search_products_local(in_stock_only=True, limit=limit)
        rtype    = "fallback"
        message  = "Produits disponibles"

    return {
        "found":            len(products) > 0,
        "type":             rtype,
        "message":          message,
        "based_on_history": bool(bought_ids),
        "results": [{
            "id":             p["id"],
            "name":           p["name"],
            "category":       p.get("category_name", ""),
            "price_original": p["price"],
            "price_final":    p["price_final"],
            "has_discount":   p.get("has_discount", False),
            "stock":          p["stock"],
            "in_stock":       p["in_stock"],
            "photo":          p.get("photo_thumb") or p.get("photo", ""),
            "description":    (p.get("description") or "")[:150],
        } for p in products],
    }


def verify_product_live(product_id: int) -> dict:
    """
    Check real-time price and stock from the TikTakPro API.
    Updates the local DB if data has changed.
    """
    data = _get(f"{Config.TIKTAKPRO_BASE}/products/{product_id}/", _tiktakpro_headers())
    if "error" in data:
        return {
            "verified":   False,
            "product_id": product_id,
            "error":      data.get("error", "API error"),
            "message":    "Impossible de vérifier le prix en direct. Utilisez les données locales.",
        }

    pricing  = _format_price(data)
    stock    = data.get("stock", 0)
    in_stock = stock > 0

    from app import database as db_module
    local = db_module.get_product_local(product_id)

    price_changed = local is not None and abs((local.get("price_final") or 0) - pricing["final"]) > 0.01
    stock_changed = local is not None and (local.get("stock") or 0) != stock

    # Persist fresh data to local DB
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db_module.refresh_product_from_api(
        product_id, data.get("price", pricing["final"]), pricing["final"],
        stock, in_stock, now
    )

    result = {
        "verified":       True,
        "product_id":     product_id,
        "name":           data.get("name", ""),
        "price_live":     pricing["final"],
        "price_original": pricing["original"],
        "has_discount":   pricing["has_discount"],
        "stock_live":     stock,
        "in_stock":       in_stock,
        "price_changed":  price_changed,
        "stock_changed":  stock_changed,
        "checked_at":     now,
    }
    if price_changed:
        result["price_local"]   = local.get("price_final")
        result["price_message"] = (
            f"Prix mis à jour : {local.get('price_final')} → {pricing['final']} TND"
        )
    if stock_changed:
        result["stock_local"]   = local.get("stock")
        result["stock_message"] = (
            f"Stock mis à jour : {local.get('stock')} → {stock} unité(s)"
        )
    if not in_stock:
        result["warning"] = "Ce produit est actuellement en rupture de stock."

    return result


def get_pending_orders(phone: str) -> dict:
    """Return all undelivered orders for a customer (En attente, Confirmées, Prêt à expédier, Expédiées)."""
    from app import database as db_module

    active_statuses = {'En attente', 'Confirmées', 'Prêt à expédier', 'Expédiées'}
    orders = db_module.get_orders_by_phone(phone, limit=30)
    active = [o for o in orders if o.get("status", "") in active_statuses]

    if not active:
        return {
            "found":   False,
            "phone":   phone,
            "message": "Aucune commande en cours pour ce numéro.",
        }

    result = []
    for o in active:
        items = [i.get("product_name", "") for i in o.get("items", []) if i.get("product_name")]
        result.append({
            "order_id":        o.get("external_id") or o["id"],
            "status":          o.get("status", ""),
            "items":           items[:3],
            "tracking_number": o.get("tracking_number", ""),
            "created_at":      (o.get("created_at", "") or "")[:10],
            "total":           o.get("total", 0),
            "gouvernorat":     o.get("gouvernorat", ""),
        })

    in_transit = [o for o in result if o["status"] == "Expédiées"]
    return {
        "found":        True,
        "phone":        phone,
        "count":        len(result),
        "orders":       result,
        "has_tracking": any(o.get("tracking_number") for o in in_transit),
        "summary": (
            f"{len(result)} commande(s) en cours. "
            + (f"{len(in_transit)} en transit (tracking disponible)." if in_transit else "")
        ),
    }


def escalate_to_human(reason: str, summary: str, session_id: str = "", customer: dict = None) -> dict:
    from app import notifications
    notifications.add(
        session_id=session_id,
        reason=reason,
        summary=summary,
        customer=customer or {}
    )
    return {
        "escalated": True,
        "message": "Un agent humain a été notifié et reprendra la conversation sous peu.",
        "reason": reason,
        "summary": summary
    }


# ── Dispatcher ─────────────────────────────────────────────────────────────────

TOOL_HANDLERS = {
    "get_customer_profile":      lambda a: get_customer_profile(**a),
    "get_recommended_products":  lambda a: get_recommended_products(**a),
    "verify_product_live":       lambda a: verify_product_live(**a),
    "get_pending_orders":        lambda a: get_pending_orders(**a),
    "get_delivery_info":         lambda a: get_delivery_info(**a),
    "get_invoice":           lambda a: get_invoice(**a),
    "generate_quote":        lambda a: generate_quote(**a),
    "get_categories":        lambda a: get_categories(),
    "search_products":       lambda a: search_products(**a),
    "get_product_details":   lambda a: get_product_details(**a),
    "compare_products":      lambda a: compare_products(**a),
    "get_order_details":     lambda a: get_order_details(**a),
    "check_delivery_status": lambda a: check_delivery_status(**a),
    "prepare_order_recap":   lambda a: prepare_order_recap(**a),
    "create_order":          lambda a: create_order(**a),
    "escalate_to_human":     lambda a: escalate_to_human(a["reason"], a["summary"],
                                                         a.get("session_id",""), a.get("customer",{})),
}
