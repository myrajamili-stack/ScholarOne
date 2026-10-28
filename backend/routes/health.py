from flask import Blueprint

from db import get_db_connection

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}


@health_bp.route("/db-test", methods=["GET"])
def db_test():
    try:
        connection = get_db_connection()
        connection.close()
        return {"database": "connected"}
    except Exception as e:
        return {"database": "error", "message": str(e)}, 500
