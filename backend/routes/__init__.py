from .advisor_students import students_management_bp
from .advisor_profiles import profiles_bp
from .messaging import messaging_bp
from .advisor_dashboard import dashboard_bp
from .advisors import advisors_bp
from .advisor_scheduling import scheduling_bp
from .admin import admin_bp
from .admin_settings import admin_settings_bp
from .applications import applications_bp
from .auth import auth_bp
from .calendar import calendar_bp
from .health import health_bp
from .quizzes import quizzes_bp
from .scholarships import scholarships_bp
from .sponsors import sponsors_bp
from .billing import billing_bp
from .students import students_bp
from .assessment_attempts import assessment_attempts_bp
from .scholarship_reminders import scholarship_reminders_bp


def register_blueprints(app):
    app.register_blueprint(scholarship_reminders_bp)
    app.register_blueprint(assessment_attempts_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(admin_settings_bp)
    app.register_blueprint(messaging_bp)
    app.register_blueprint(advisors_bp)
    app.register_blueprint(students_management_bp)
    app.register_blueprint(profiles_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(scheduling_bp)
    app.register_blueprint(calendar_bp)
    app.register_blueprint(quizzes_bp)
    app.register_blueprint(scholarships_bp)
    app.register_blueprint(sponsors_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(students_bp)
    app.register_blueprint(applications_bp)
