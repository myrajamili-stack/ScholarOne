import os
import re
from pathlib import Path

from dotenv import load_dotenv

# Local development restarts must use the saved settings rather than values
# inherited from a previous Flask debug-reloader process.
if __name__ == "__main__":
    load_dotenv(Path(__file__).resolve().with_name(".env"), override=True)

from flask import Flask, request
from flask_cors import CORS
from psycopg2 import Error as DatabaseError

from responses import internal_error_response
from routes import register_blueprints
from deployment_security import configure_web_security
from security import configure_access_tokens


def create_app():
    app = Flask(__name__)
    origins = configure_web_security(app)
    exact_origins = [re.compile(rf"\A{re.escape(origin)}\Z", re.IGNORECASE) for origin in origins]
    CORS(app, resources={r"/api/.*": {"origins": exact_origins}}, allow_headers=["Authorization", "Content-Type"],
         expose_headers=["Retry-After"])
    configure_access_tokens(app)
    app.register_error_handler(DatabaseError, internal_error_response)
    @app.before_request
    def protect_admin_namespace():
        # Covers admin routes across blueprints and future additions. CORS
        # preflights contain no protected data; the actual request is guarded.
        if request.path == '/api/admin' or request.path.startswith('/api/admin/'):
            if request.method == 'OPTIONS': return app.make_default_options_response()
            from security import admin_access_required
            return admin_access_required(lambda: None)()
    register_blueprints(app)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", "5000")), debug=False if app.config["SCHOLARONE_PRODUCTION"] else None)
