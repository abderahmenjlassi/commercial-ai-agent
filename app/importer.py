"""
Historical data importer from TikTak Space.
Runs in a background thread and updates progress state.
"""
import threading
import requests
from datetime import datetime
from config import Config
from app import database as db

_state = {
    "running":   False,
    "done":      False,
    "total":     0,
    "imported":  0,
    "skipped":   0,
    "errors":    0,
    "started_at": None,
    "finished_at": None,
    "log":       [],
}
_lock = threading.Lock()


def get_status() -> dict:
    with _lock:
        return dict(_state)


def _log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    with _lock:
        _state["log"].append(f"[{ts}] {msg}")
        if len(_state["log"]) > 200:
            _state["log"] = _state["log"][-200:]


def _headers():
    return {"Authorization": f"Token {Config.TIKTAK_SPACE_TOKEN}"}


def start_import(max_pages: int = None):
    """Start import in a background thread. max_pages=None imports everything."""
    with _lock:
        if _state["running"]:
            return False
        _state.update({"running": True, "done": False, "total": 0,
                        "imported": 0, "skipped": 0, "errors": 0,
                        "started_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "finished_at": None, "log": []})

    t = threading.Thread(target=_run_import, args=(max_pages,), daemon=True)
    t.start()
    return True


def _run_import(max_pages: int = None):
    _log("Démarrage de l'import…")
    page = 1
    per_page = 50
    total_pages = None

    while True:
        try:
            r = requests.get(
                f"{Config.TIKTAK_SPACE_BASE}/orders/",
                headers=_headers(),
                params={"limit": per_page, "page": page},
                timeout=20
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            _log(f"Erreur page {page}: {e}")
            with _lock:
                _state["errors"] += 1
            break

        if total_pages is None:
            total_items = data.get("count", 0)
            total_pages = data.get("total_pages", 1)
            with _lock:
                _state["total"] = total_items
            _log(f"Total commandes : {total_items} | Pages : {total_pages}")

        orders = data.get("results", [])
        if not orders:
            break

        for o in orders:
            try:
                _import_order(o)
                with _lock:
                    _state["imported"] += 1
            except Exception as e:
                _log(f"Erreur commande {o.get('id')}: {e}")
                with _lock:
                    _state["errors"] += 1

        _log(f"Page {page}/{total_pages} — {_state['imported']} importées")

        if max_pages and page >= max_pages:
            _log(f"Arrêt après {max_pages} pages (limite demandée).")
            break

        if not data.get("next"):
            break
        page += 1

    with _lock:
        _state["running"]     = False
        _state["done"]        = True
        _state["finished_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    _log(f"Import terminé : {_state['imported']} commandes, {_state['errors']} erreurs.")

    # Refresh all customer stats
    _log("Recalcul des statistiques clients…")
    try:
        with db.get_conn() as conn:
            phones = [r[0] for r in conn.execute("SELECT DISTINCT phone FROM customers").fetchall()]
        for phone in phones:
            db.refresh_customer_stats(phone)
        _log(f"{len(phones)} profils clients mis à jour.")
    except Exception as e:
        _log(f"Erreur recalcul stats : {e}")


def _import_order(o: dict):
    phone = o.get("phone", "")
    name  = o.get("name", "")
    email = o.get("email", "")
    gov   = o.get("gouvernorat", "")
    addr  = o.get("address", "")

    # Upsert customer
    if phone:
        db.upsert_customer(phone, name, email, gov, addr)

    # Build items list
    items = []
    for d in o.get("_details", []):
        pid = d.get("product_id") or d.get("product_parent_id")
        if pid:
            db.cache_product(
                pid,
                d.get("product_name", ""),
                str(d.get("category_id", "")),
                d.get("product_thumb", "")
            )
        items.append({
            "product_id":   pid,
            "product_name": d.get("product_name", ""),
            "quantity":     d.get("quantity", 1),
            "price_ttc":    d.get("price_ttc", 0),
            "discount":     d.get("discount", 0),
            "final_price":  d.get("final_price", 0),
        })

    db.upsert_order(
        order_id       = str(o["id"]),
        source         = "import",
        external_id    = o["id"],
        customer_phone = phone,
        customer_name  = name,
        address        = addr,
        gouvernorat    = gov,
        status         = o.get("step_name", "En attente"),
        payment_type   = o.get("payement_type", "CASH"),
        total          = o.get("total_amount", 0),
        comment        = o.get("comment", ""),
        tracking_number= o.get("transport_system_id", "") or "",
        created_at     = o["created_at"][:19].replace("T", " "),
        items          = items,
    )
