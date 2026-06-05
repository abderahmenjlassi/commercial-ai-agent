"""
Product catalog sync engine.
Fetches all products from TikTakPro API and stores them in the local DB.
Supports full sync, incremental updates, and automatic background scheduling.
"""
import json
import time
import threading
import requests
from datetime import datetime, timedelta
from config import Config

_state = {
    "running":     False,
    "done":        False,
    "total":       0,
    "synced":      0,
    "new":         0,
    "updated":     0,
    "errors":      0,
    "started_at":  None,
    "finished_at": None,
    "last_full_sync": None,
    "log":         [],
}
_lock = threading.Lock()


def get_status() -> dict:
    with _lock:
        return dict(_state)


def _log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    with _lock:
        _state["log"].append(f"[{ts}] {msg}")
        if len(_state["log"]) > 300:
            _state["log"] = _state["log"][-300:]


def _headers():
    return {"Authorization": f"Token {Config.TIKTAKPRO_TOKEN}"}


def start_sync(incremental: bool = False):
    with _lock:
        if _state["running"]:
            return False
        _state.update({
            "running": True, "done": False,
            "total": 0, "synced": 0, "new": 0, "updated": 0, "errors": 0,
            "started_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "finished_at": None, "log": []
        })
    t = threading.Thread(target=_run_sync, args=(incremental,), daemon=True)
    t.start()
    return True


def _run_sync(incremental: bool):
    from app import database as db
    _log(f"Démarrage {'sync incrémental' if incremental else 'sync complet'}…")

    # Determine last sync time for incremental
    last_sync = None
    if incremental:
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT MAX(synced_at) FROM products WHERE synced_at IS NOT NULL"
            ).fetchone()
            last_sync = row[0] if row and row[0] else None
        if last_sync:
            _log(f"Sync incrémental depuis : {last_sync}")
        else:
            _log("Aucun sync précédent — sync complet lancé.")
            incremental = False

    page = 1
    per_page = 50
    total_pages = None

    while True:
        params = {"limit": per_page, "page": page, "active": "true"}
        if incremental and last_sync:
            params["updated_after"] = last_sync

        try:
            r = requests.get(
                f"{Config.TIKTAKPRO_BASE}/products/",
                headers=_headers(),
                params=params,
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
            _log(f"Produits à synchroniser : {total_items} | Pages : {total_pages}")

        products = data.get("results", [])
        if not products:
            break

        for p in products:
            try:
                is_new = _sync_product(p, db)
                with _lock:
                    _state["synced"] += 1
                    if is_new:
                        _state["new"] += 1
                    else:
                        _state["updated"] += 1
            except Exception as e:
                _log(f"Erreur produit {p.get('id')}: {e}")
                with _lock:
                    _state["errors"] += 1

        _log(f"Page {page}/{total_pages} — {_state['synced']} synchronisés")

        if not data.get("next"):
            break
        page += 1

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        _state["running"]      = False
        _state["done"]         = True
        _state["finished_at"]  = now
        if not incremental:
            _state["last_full_sync"] = now

    _log(f"Sync terminé : {_state['synced']} produits | {_state['new']} nouveaux | {_state['errors']} erreurs.")


def maybe_sync_on_startup():
    """
    Called at app startup. Triggers:
    - A full sync   if the products table is empty.
    - An incremental sync if the catalog is older than PRODUCT_SYNC_STALE_HOURS.
    - Nothing       if the catalog is recent enough.
    Runs in a background daemon thread so it never blocks the app from starting.
    """
    def _check():
        try:
            from app import database as db
            with db.get_conn() as conn:
                count    = conn.execute("SELECT COUNT(*) FROM products WHERE active=1").fetchone()[0]
                last_row = conn.execute("SELECT MAX(synced_at) FROM products").fetchone()
                last_sync = last_row[0] if last_row and last_row[0] else None

            if count == 0:
                _log("Catalogue vide → sync complet automatique au démarrage.")
                start_sync(incremental=False)
                return

            if last_sync:
                age = datetime.now() - datetime.strptime(last_sync[:19], "%Y-%m-%d %H:%M:%S")
                if age > timedelta(hours=Config.PRODUCT_SYNC_STALE_HOURS):
                    _log(f"Catalogue obsolète ({int(age.total_seconds()//3600)}h) → sync incrémental au démarrage.")
                    start_sync(incremental=True)
                    return

            _log(f"Catalogue OK ({count} produits, dernier sync : {last_sync[:16]}).")
        except Exception as e:
            _log(f"Erreur startup check: {e}")

    threading.Thread(target=_check, daemon=True).start()


def start_scheduler():
    """
    Start a background thread that triggers incremental syncs at the interval
    defined by Config.PRODUCT_SYNC_INTERVAL_HOURS. Set to 0 to disable.
    """
    interval = Config.PRODUCT_SYNC_INTERVAL_HOURS
    if interval <= 0:
        return

    def _loop():
        while True:
            time.sleep(interval * 3600)
            _log(f"Sync planifié (intervalle {interval}h) → démarrage sync incrémental.")
            start_sync(incremental=True)

    t = threading.Thread(target=_loop, daemon=True, name="product-sync-scheduler")
    t.start()
    _log(f"Scheduleur de sync démarré — intervalle : {interval}h.")


def _sync_product(p: dict, db) -> bool:
    """Upsert a single product. Returns True if it's a new product."""
    pid = p["id"]
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Compute final price
    price    = p.get("price", 0) or 0
    discount = p.get("discount", 0) or 0
    dtype    = p.get("discount_type", "")
    if discount > 0:
        if dtype == "fixed_amount":
            price_final = max(0, price - discount)
        elif dtype == "percentage":
            price_final = round(price * (1 - discount / 100), 2)
        else:
            price_final = price
    else:
        price_final = price

    # Category
    cat = p.get("_category") or {}
    category_id   = cat.get("id") or p.get("category")
    category_name = cat.get("name", "")

    # Features as JSON
    features_json = json.dumps(
        [f.get("name") for f in p.get("features", []) if f.get("name")],
        ensure_ascii=False
    )

    # Images — pick best available
    images = p.get("images", [])
    photo       = p.get("photo") or (images[0].get("image") if images else "")
    photo_thumb = p.get("photo_thumb") or (images[0].get("image_thumb") if images else "")

    # Variants (declinaisons)
    variants_json = json.dumps([
        {"id": d.get("id"), "name": d.get("name",""),
         "price": d.get("price"), "stock": d.get("stock", 0)}
        for d in p.get("declinaisons", [])
    ], ensure_ascii=False)

    # Clean description (strip HTML)
    import re
    desc = re.sub(r'<[^>]+>', '', p.get("description") or "")[:1000]

    with db.get_conn() as conn:
        existing = conn.execute("SELECT id FROM products WHERE id=?", (pid,)).fetchone()
        conn.execute("""
            INSERT INTO products
              (id, name, description, category_id, category_name,
               price, price_ht, taxe_rate, discount, discount_type, price_final,
               stock, in_stock, active, photo, photo_thumb,
               features, variants, seo_slug, sold,
               api_updated_at, synced_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              name          = excluded.name,
              description   = excluded.description,
              category_id   = excluded.category_id,
              category_name = excluded.category_name,
              price         = excluded.price,
              price_ht      = excluded.price_ht,
              taxe_rate     = excluded.taxe_rate,
              discount      = excluded.discount,
              discount_type = excluded.discount_type,
              price_final   = excluded.price_final,
              stock         = excluded.stock,
              in_stock      = excluded.in_stock,
              active        = excluded.active,
              photo         = excluded.photo,
              photo_thumb   = excluded.photo_thumb,
              features      = excluded.features,
              variants      = excluded.variants,
              seo_slug      = excluded.seo_slug,
              sold          = excluded.sold,
              api_updated_at= excluded.api_updated_at,
              synced_at     = excluded.synced_at
        """, (
            pid,
            p.get("name", ""),
            desc,
            category_id,
            category_name,
            price,
            p.get("price_ht", 0),
            p.get("taxe_rate", 19),
            discount,
            dtype,
            price_final,
            p.get("stock", 0),
            1 if p.get("stock", 0) > 0 else 0,
            1 if p.get("active") else 0,
            photo,
            photo_thumb,
            features_json,
            variants_json,
            p.get("seo_slug", ""),
            p.get("sold", 0),
            (p.get("updated_at") or "")[:19],
            now,
        ))
    return existing is None
