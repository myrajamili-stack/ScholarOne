import os
from urllib.parse import urlsplit

from werkzeug.middleware.proxy_fix import ProxyFix


def configure_web_security(app):
    production = os.getenv("SCHOLARONE_ENV", "").lower() == "production"
    secret = os.getenv("SECRET_KEY", "")
    origins = [value.strip().rstrip("/") for value in
               (os.getenv("CORS_ALLOWED_ORIGINS") or os.getenv("FRONTEND_URL", "")).split(",") if value.strip()]
    if production:
        if len(secret.encode()) < 32 or len(set(secret)) < 8 or secret.lower().startswith(("replace", "change", "example")):
            raise RuntimeError("Set a stable, randomly generated SECRET_KEY for production.")
        if not origins:
            raise RuntimeError("Configure explicit HTTPS frontend origins for production.")
        if os.getenv("FLASK_DEBUG", "").lower() not in ("", "0", "false", "no"):
            raise RuntimeError("Disable Flask debug mode in production.")
        app.debug = False
    if not origins:
        origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"]
    for origin in origins:
        try:
            parsed = urlsplit(origin)
            valid = parsed.scheme in (("https",) if production else ("https", "http")) and parsed.hostname
            valid = valid and not (parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment)
            valid = valid and not any(char.isspace() or char in "*?#" for char in origin)
            _ = parsed.port
        except ValueError:
            valid = False
        if not valid:
            raise RuntimeError("Configure frontend origins as exact scheme, hostname, and optional port.")
    try:
        proxy_hops = int(os.getenv("TRUSTED_PROXY_HOPS", "0"))
        if not 0 <= proxy_hops <= 10:
            raise ValueError()
    except ValueError:
        raise RuntimeError("TRUSTED_PROXY_HOPS must be an integer from 0 to 10.") from None
    if proxy_hops:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_hops, x_proto=0)
    app.config.update(SCHOLARONE_PRODUCTION=production, SCHOLARONE_SIGNING_KEY=secret)
    return origins
