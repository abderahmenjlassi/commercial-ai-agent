from flask import Flask
from flask_cors import CORS
from config import Config


def create_app():
    app = Flask(__name__, template_folder="../templates", static_folder="static")
    app.config.from_object(Config)
    CORS(app)

    # Initialise SQLite database
    from app import database
    database.init_db()

    from app.routes.chat import chat_bp
    from app.routes.admin import admin_bp
    from app.routes.webhook import webhook_bp
    app.register_blueprint(chat_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(webhook_bp)

    # Auto-sync product catalog on startup + start periodic scheduler
    from app import product_sync
    product_sync.maybe_sync_on_startup()
    product_sync.start_scheduler()

    return app
