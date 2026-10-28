from flask import Flask
from flask_cors import CORS

from routes import register_blueprints


def create_app():
    app = Flask(__name__)
    CORS(app)
    register_blueprints(app)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
