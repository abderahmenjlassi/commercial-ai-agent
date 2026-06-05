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
