from .advisors import advisors_bp
from .admin import admin_bp
from .applications import applications_bp
from .auth import auth_bp
from .calendar import calendar_bp
from .health import health_bp
from .quizzes import quizzes_bp
from .scholarships import scholarships_bp
from .sponsors import sponsors_bp
from .students import students_bp


def register_blueprints(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(advisors_bp)
    app.register_blueprint(calendar_bp)
    app.register_blueprint(quizzes_bp)
    app.register_blueprint(scholarships_bp)
    app.register_blueprint(sponsors_bp)
    app.register_blueprint(students_bp)
    app.register_blueprint(applications_bp)
