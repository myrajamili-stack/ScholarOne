from flask import Blueprint, current_app

from db import get_db_connection
from responses import internal_error_response

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}


@health_bp.route("/db-test", methods=["GET"])
def db_test():
    if current_app.config.get("SCHOLARONE_PRODUCTION"):
        return {"error": "Not found."}, 404
    try:
        connection = get_db_connection()
        connection.close()
        return {"database": "connected"}
    except Exception as e:
        return internal_error_response(e)
