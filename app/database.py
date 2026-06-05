"""
SQLite database layer.
Centralises customers, orders, and order_items.
Product prices are never stored — always fetched live from TikTakPro API.
"""
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent.parent / "data" / "tunioptique.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS customers (
            phone        TEXT PRIMARY KEY,
            name         TEXT,
            email        TEXT,
            gouvernorat  TEXT,
            address      TEXT,
            tag          TEXT DEFAULT 'Nouveau client',
            total_orders INTEGER DEFAULT 0,
            total_spent  REAL    DEFAULT 0,
            created_at   TEXT,
            updated_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS orders (
            id              TEXT PRIMARY KEY,
            source          TEXT NOT NULL,   -- 'import' | 'webhook' | 'chat'
            external_id     INTEGER,         -- TikTak Space order ID
            customer_phone  TEXT,
            customer_name   TEXT,
            address         TEXT,
            gouvernorat     TEXT,
            status          TEXT DEFAULT 'En attente',
            payment_type    TEXT DEFAULT 'CASH',
            total           REAL DEFAULT 0,
            comment         TEXT,
            tracking_number TEXT,
            created_at      TEXT,
            updated_at      TEXT,
            FOREIGN KEY (customer_phone) REFERENCES customers(phone)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id     TEXT NOT NULL,
            product_id   INTEGER,
            product_name TEXT,
            quantity     REAL DEFAULT 1,
            price_ttc    REAL DEFAULT 0,
            discount     REAL DEFAULT 0,
            final_price  REAL DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        );

        CREATE TABLE IF NOT EXISTS products_cache (
            id         INTEGER PRIMARY KEY,
            name       TEXT,
            category   TEXT,
            photo      TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS products (
            id             INTEGER PRIMARY KEY,
            name           TEXT NOT NULL,
            description    TEXT DEFAULT '',
            category_id    INTEGER,
            category_name  TEXT DEFAULT '',
            price          REAL DEFAULT 0,
            price_ht       REAL DEFAULT 0,
            taxe_rate      REAL DEFAULT 19,
            discount       REAL DEFAULT 0,
            discount_type  TEXT DEFAULT 'fixed_amount',
            price_final    REAL DEFAULT 0,
            stock          INTEGER DEFAULT 0,
            in_stock       INTEGER DEFAULT 0,
            active         INTEGER DEFAULT 1,
            photo          TEXT DEFAULT '',
            photo_thumb    TEXT DEFAULT '',
            features       TEXT DEFAULT '[]',
            variants       TEXT DEFAULT '[]',
            seo_slug       TEXT DEFAULT '',
            sold           REAL DEFAULT 0,
            api_updated_at TEXT,
            synced_at      TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_prod_category ON products(category_id);
        CREATE INDEX IF NOT EXISTS idx_prod_stock    ON products(stock);
        CREATE INDEX IF NOT EXISTS idx_prod_active   ON products(active);
        CREATE INDEX IF NOT EXISTS idx_prod_price    ON products(price_final);

        CREATE INDEX IF NOT EXISTS idx_orders_phone    ON orders(customer_phone);
        CREATE INDEX IF NOT EXISTS idx_orders_ext      ON orders(external_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_items_order     ON order_items(order_id);
        """)


# ── Customer helpers ──────────────────────────────────────────────────────────

def upsert_customer(phone: str, name: str = "", email: str = "",
                    gouvernorat: str = "", address: str = "") -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO customers (phone, name, email, gouvernorat, address, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                name        = COALESCE(NULLIF(excluded.name, ''), customers.name),
                email       = COALESCE(NULLIF(excluded.email,''), customers.email),
                gouvernorat = COALESCE(NULLIF(excluded.gouvernorat,''), customers.gouvernorat),
                address     = COALESCE(NULLIF(excluded.address,''), customers.address),
                updated_at  = excluded.updated_at
        """, (phone, name, email, gouvernorat, address, now, now))


def refresh_customer_stats(phone: str) -> None:
    """Recompute total_orders, total_spent and tag from the orders table."""
    with get_conn() as conn:
        row = conn.execute("""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(total), 0) as spent,
                   SUM(CASE WHEN LOWER(status) LIKE '%annul%' THEN 1 ELSE 0 END) as cancelled
            FROM orders WHERE customer_phone = ?
        """, (phone,)).fetchone()
        cnt      = row["cnt"]
        spent    = round(row["spent"], 2)
        cancelled= row["cancelled"]
        if cnt == 0:
            tag = "Nouveau client"
        elif cancelled >= cnt // 2 and cancelled > 0:
            tag = "Client à risque"
        elif cnt >= 10 or spent >= 5000:
            tag = "Client VIP"
        elif cnt >= 3:
            tag = "Client fidèle"
        else:
            tag = "Client régulier"
        conn.execute("""
            UPDATE customers SET total_orders=?, total_spent=?, tag=?, updated_at=?
            WHERE phone=?
        """, (cnt, spent, tag, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), phone))


def get_customer(phone: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM customers WHERE phone=?", (phone,)).fetchone()
        return dict(row) if row else None


def search_customers(query: str, limit: int = 20) -> list:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM customers
            WHERE name LIKE ? OR phone LIKE ? OR gouvernorat LIKE ?
            ORDER BY total_orders DESC LIMIT ?
        """, (f"%{query}%",)*3 + (limit,)).fetchall()
        return [dict(r) for r in rows]


# ── Order helpers ─────────────────────────────────────────────────────────────

def upsert_order(order_id: str, source: str, external_id: int = None,
                 customer_phone: str = "", customer_name: str = "",
                 address: str = "", gouvernorat: str = "", status: str = "En attente",
                 payment_type: str = "CASH", total: float = 0,
                 comment: str = "", tracking_number: str = "",
                 created_at: str = None, items: list = None) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    created_at = created_at or now
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO orders
              (id, source, external_id, customer_phone, customer_name, address,
               gouvernorat, status, payment_type, total, comment, tracking_number,
               created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                status          = excluded.status,
                tracking_number = COALESCE(NULLIF(excluded.tracking_number,''), orders.tracking_number),
                updated_at      = excluded.updated_at
        """, (order_id, source, external_id, customer_phone, customer_name, address,
              gouvernorat, status, payment_type, total, comment, tracking_number,
              created_at, now))

        if items:
            conn.execute("DELETE FROM order_items WHERE order_id=?", (order_id,))
            conn.executemany("""
                INSERT INTO order_items
                  (order_id, product_id, product_name, quantity, price_ttc, discount, final_price)
                VALUES (?,?,?,?,?,?,?)
            """, [(order_id,
                   i.get("product_id"), i.get("product_name") or i.get("name", ""),
                   i.get("quantity", 1), i.get("price_ttc") or i.get("price_unit", 0),
                   i.get("discount", 0), i.get("final_price") or i.get("line_total") or i.get("final_price", 0))
                  for i in items])


def get_orders_by_phone(phone: str, limit: int = 20) -> list:
    with get_conn() as conn:
        orders = conn.execute("""
            SELECT * FROM orders WHERE customer_phone=?
            ORDER BY created_at DESC LIMIT ?
        """, (phone, limit)).fetchall()
        result = []
        for o in orders:
            od = dict(o)
            od["items"] = [dict(r) for r in conn.execute(
                "SELECT * FROM order_items WHERE order_id=?", (o["id"],)).fetchall()]
            result.append(od)
        return result


def get_order(order_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM orders WHERE id=? OR CAST(external_id AS TEXT)=?",
                           (order_id, order_id)).fetchone()
        if not row:
            return None
        od = dict(row)
        od["items"] = [dict(r) for r in conn.execute(
            "SELECT * FROM order_items WHERE order_id=?", (od["id"],)).fetchall()]
        return od


def get_all_orders(status: str = None, limit: int = 200) -> list:
    with get_conn() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM orders WHERE status=? ORDER BY created_at DESC LIMIT ?",
                (status, limit)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        result = []
        for o in rows:
            od = dict(o)
            od["items"] = [dict(r) for r in conn.execute(
                "SELECT * FROM order_items WHERE order_id=?", (o["id"],)).fetchall()]
            result.append(od)
        return result


def update_order_status(order_id: str, status: str) -> bool:
    with get_conn() as conn:
        c = conn.execute(
            "UPDATE orders SET status=?, updated_at=? WHERE id=?",
            (status, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), order_id))
        return c.rowcount > 0


# ── Fulfillment helpers ───────────────────────────────────────────────────────

# Ordered pipeline stages
FULFILLMENT_STAGES = [
    "En attente",
    "Confirmées",
    "Prêt à expédier",
    "Expédiées",
    "Livrées",
    "Payées",
]
TERMINAL_STAGES = ["Annulées", "Retour non reçues", "Retour reçues", "Panier abandonné"]

# Valid transitions for each stage
TRANSITIONS = {
    "En attente":       ["Confirmées",        "Annulées"],
    "Confirmées":       ["Prêt à expédier",   "Annulées"],
    "Prêt à expédier":  ["Expédiées",         "Annulées"],
    "Expédiées":        ["Livrées",           "Retour non reçues", "Annulées"],
    "Livrées":          ["Payées",            "Retour non reçues"],
    "Payées":           ["Retour non reçues"],
    "Retour non reçues":["Retour reçues",     "Expédiées"],
    "Retour reçues":    [],
    "Annulées":         [],
    "Panier abandonné": ["En attente",        "Annulées"],
}


def get_fulfillment_stats() -> dict:
    """Return order count and revenue for each stage."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT status, COUNT(*) as cnt,
                   COALESCE(SUM(CASE WHEN total < 1000000 THEN total ELSE 0 END), 0) as revenue
            FROM orders GROUP BY status
        """).fetchall()
    stats = {r["status"]: {"count": r["cnt"], "revenue": round(r["revenue"], 2)} for r in rows}
    return stats


def get_orders_by_status(status: str, limit: int = 100, offset: int = 0,
                          search: str = "", gouvernorat: str = "") -> list:
    with get_conn() as conn:
        params = [status]
        where  = "WHERE o.status = ?"
        if search:
            where += " AND (o.customer_name LIKE ? OR o.customer_phone LIKE ?)"
            params += [f"%{search}%", f"%{search}%"]
        if gouvernorat:
            where += " AND o.gouvernorat = ?"
            params.append(gouvernorat)
        params += [limit, offset]

        orders = conn.execute(f"""
            SELECT o.* FROM orders o
            {where}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        """, params).fetchall()

        result = []
        for o in orders:
            od = dict(o)
            od["items"] = [dict(r) for r in conn.execute(
                "SELECT * FROM order_items WHERE order_id=?", (o["id"],)).fetchall()]
            result.append(od)
        return result


def transition_order(order_id: str, new_status: str,
                     note: str = "", tracking: str = "") -> tuple[bool, str]:
    """Move an order to a new fulfillment status with validation."""
    with get_conn() as conn:
        row = conn.execute("SELECT status FROM orders WHERE id=?", (order_id,)).fetchone()
        if not row:
            return False, "Commande introuvable."

        current = row["status"]
        allowed = TRANSITIONS.get(current, [])
        if new_status not in allowed:
            return False, f"Transition '{current}' → '{new_status}' non autorisée."

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        updates = ["status=?", "updated_at=?"]
        vals    = [new_status, now]

        if tracking:
            updates.append("tracking_number=?")
            vals.append(tracking)
        if note:
            updates.append("fulfillment_note=?")
            vals.append(note)
        if new_status == "Confirmées":
            updates.append("confirmed_at=?"); vals.append(now)
        elif new_status == "Expédiées":
            updates.append("shipped_at=?"); vals.append(now)
        elif new_status in ("Livrées", "Payées"):
            updates.append("delivered_at=?"); vals.append(now)

        vals.append(order_id)
        conn.execute(f"UPDATE orders SET {', '.join(updates)} WHERE id=?", vals)
        conn.execute("""
            INSERT INTO fulfillment_events (order_id, from_status, to_status, note, created_at)
            VALUES (?,?,?,?,?)
        """, (order_id, current, new_status, note, now))

    return True, f"Commande passée à '{new_status}'."


def get_fulfillment_history(order_id: str) -> list:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM fulfillment_events WHERE order_id=?
            ORDER BY created_at ASC
        """, (order_id,)).fetchall()
    return [dict(r) for r in rows]


def get_db_stats() -> dict:
    with get_conn() as conn:
        today = datetime.now().strftime("%Y-%m-%d")
        total_customers = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        total_orders    = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        today_orders    = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE created_at LIKE ?", (f"{today}%",)).fetchone()[0]
        pending         = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE status='En attente'").fetchone()[0]
        revenue         = conn.execute(
            "SELECT COALESCE(SUM(total),0) FROM orders WHERE status='Confirmée'").fetchone()[0]
        return {
            "total_customers": total_customers,
            "total_orders":    total_orders,
            "today_orders":    today_orders,
            "pending_orders":  pending,
            "revenue":         round(revenue, 2),
        }


# ── Product catalog helpers ───────────────────────────────────────────────────

def search_products_local(query: str = "", category_id: int = None,
                           max_price: float = None, in_stock_only: bool = False,
                           limit: int = 12) -> list:
    """
    Full-text-like search on local products table.
    Ranks: exact name match > name contains > description/category contains.
    """
    with get_conn() as conn:
        conditions = ["active = 1"]
        params     = []

        if category_id:
            conditions.append("category_id = ?")
            params.append(category_id)

        if max_price is not None and max_price > 0:
            conditions.append("price_final <= ?")
            params.append(max_price)

        if in_stock_only:
            conditions.append("stock > 0")

        base_where = " AND ".join(conditions)

        if query:
            q = f"%{query}%"
            # Score: 3 = name contains, 2 = category contains, 1 = description contains
            sql = f"""
                SELECT *,
                  CASE
                    WHEN LOWER(name)           LIKE LOWER(?) THEN 3
                    WHEN LOWER(category_name)  LIKE LOWER(?) THEN 2
                    WHEN LOWER(description)    LIKE LOWER(?) THEN 1
                    ELSE 0
                  END AS relevance
                FROM products
                WHERE {base_where}
                  AND (LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)
                       OR LOWER(category_name) LIKE LOWER(?))
                ORDER BY relevance DESC, stock DESC, sold DESC
                LIMIT ?
            """
            params = [q, q, q] + params + [q, q, q, limit]
        else:
            sql = f"""
                SELECT *, 0 AS relevance FROM products
                WHERE {base_where}
                ORDER BY sold DESC, stock DESC
                LIMIT ?
            """
            params = params + [limit]

        rows = conn.execute(sql, params).fetchall()
        return [_product_row_to_dict(r) for r in rows]


def get_product_local(product_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
        return _product_row_to_dict(row) if row else None


def get_products_by_category(category_id: int, exclude_id: int = None, limit: int = 6) -> list:
    with get_conn() as conn:
        if exclude_id:
            rows = conn.execute("""
                SELECT * FROM products WHERE category_id=? AND active=1 AND id!=?
                ORDER BY stock DESC, sold DESC LIMIT ?
            """, (category_id, exclude_id, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT * FROM products WHERE category_id=? AND active=1
                ORDER BY stock DESC, sold DESC LIMIT ?
            """, (category_id, limit)).fetchall()
        return [_product_row_to_dict(r) for r in rows]


def get_complementary_products(bought_product_ids: list, limit: int = 6) -> list:
    """
    Find products in the same categories as previously bought products,
    excluding already-bought ones.
    """
    if not bought_product_ids:
        return []
    with get_conn() as conn:
        # Get category IDs of bought products
        placeholders = ",".join("?" * len(bought_product_ids))
        cats = conn.execute(
            f"SELECT DISTINCT category_id FROM products WHERE id IN ({placeholders})",
            bought_product_ids
        ).fetchall()
        cat_ids = [r[0] for r in cats if r[0]]
        if not cat_ids:
            return []

        cat_ph = ",".join("?" * len(cat_ids))
        excl_ph= ",".join("?" * len(bought_product_ids))
        rows = conn.execute(f"""
            SELECT * FROM products
            WHERE category_id IN ({cat_ph})
              AND id NOT IN ({excl_ph})
              AND active = 1 AND stock > 0
            ORDER BY sold DESC, stock DESC
            LIMIT ?
        """, cat_ids + bought_product_ids + [limit]).fetchall()
        return [_product_row_to_dict(r) for r in rows]


def get_popular_products(limit: int = 8) -> list:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM products WHERE active=1 AND stock > 0
            ORDER BY sold DESC LIMIT ?
        """, (limit,)).fetchall()
        return [_product_row_to_dict(r) for r in rows]


def get_all_categories_local() -> list:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT category_id, category_name, COUNT(*) as product_count,
                   SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as in_stock_count
            FROM products WHERE active=1 AND category_id IS NOT NULL AND category_name != ''
            GROUP BY category_id, category_name
            ORDER BY product_count DESC
        """).fetchall()
        return [{"id": r["category_id"], "name": r["category_name"],
                 "product_count": r["product_count"], "in_stock_count": r["in_stock_count"]}
                for r in rows]


def get_product_catalog_stats() -> dict:
    with get_conn() as conn:
        total    = conn.execute("SELECT COUNT(*) FROM products WHERE active=1").fetchone()[0]
        in_stock = conn.execute("SELECT COUNT(*) FROM products WHERE active=1 AND stock > 0").fetchone()[0]
        cats     = conn.execute("SELECT COUNT(DISTINCT category_id) FROM products WHERE active=1").fetchone()[0]
        last_sync= conn.execute("SELECT MAX(synced_at) FROM products").fetchone()[0]
        return {
            "total_products": total,
            "in_stock":       in_stock,
            "out_of_stock":   total - in_stock,
            "categories":     cats,
            "last_sync":      last_sync or "Jamais synchronisé",
        }


def _product_row_to_dict(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    # Parse JSON fields
    try:
        d["features"] = json.loads(d.get("features") or "[]")
    except Exception:
        d["features"] = []
    try:
        d["variants"] = json.loads(d.get("variants") or "[]")
    except Exception:
        d["variants"] = []
    d["in_stock"]   = bool(d.get("in_stock", 0))
    d["has_discount"] = (d.get("discount") or 0) > 0
    return d


# ── Product cache helpers (legacy — kept for backward compat) ─────────────────

def cache_product(product_id: int, name: str, category: str, photo: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO products_cache (id, name, category, photo, updated_at)
            VALUES (?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, category=excluded.category,
                photo=excluded.photo, updated_at=excluded.updated_at
        """, (product_id, name, category, photo, now))


def get_cached_product(product_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM products_cache WHERE id=?", (product_id,)).fetchone()
        return dict(row) if row else None
