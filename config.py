import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # OpenAI
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL = "gpt-4o"

    # Flask
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")
    DEBUG = os.getenv("FLASK_ENV") == "development"

    # TikTakPro — product catalog
    TIKTAKPRO_BASE = "https://api.tiktakpro.tn/api/v1"
    TIKTAKPRO_TOKEN = os.getenv("TIKTAKPRO_TOKEN", "")

    # TikTak Space — orders & invoices
    TIKTAK_SPACE_BASE = "https://api.tiktak.space/api/v1"
    TIKTAK_SPACE_TOKEN = os.getenv("TIKTAK_SPACE_TOKEN", "")

    # TuniHome (second store)
    TUNIHOME_TOKEN = os.getenv("TUNIHOME_TOKEN", "")

    # JAX Delivery
    JAX_BASE = "https://core.jax-delivery.com/api"
    JAX_API_TOKEN = os.getenv("JAX_API_TOKEN", "")

    # Webhook authentication
    WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "change-this-secret")

    # Product catalog sync
    # How many hours between automatic incremental syncs (0 = disable scheduler)
    PRODUCT_SYNC_INTERVAL_HOURS = int(os.getenv("PRODUCT_SYNC_INTERVAL_HOURS", "6"))
    # Max age (hours) before a startup sync is triggered on an existing catalog
    PRODUCT_SYNC_STALE_HOURS    = int(os.getenv("PRODUCT_SYNC_STALE_HOURS", "12"))
    # Max age (minutes) before prepare_order_recap re-checks live price/stock
    PRODUCT_LIVE_CHECK_MINUTES  = int(os.getenv("PRODUCT_LIVE_CHECK_MINUTES", "60"))
