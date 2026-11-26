from flask import current_app, jsonify, request


def error_response(message, status_code=400):
    return jsonify({"error": message}), status_code


def internal_error_response(error, status_code=500):
    current_app.logger.error("Request failed in %s (%s)", request.endpoint, type(error).__name__)
    return error_response("Unable to complete your request. Please try again.", status_code)
