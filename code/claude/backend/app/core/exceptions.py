"""Custom exceptions for the application."""
from fastapi import HTTPException, status


class LCCAException(Exception):
    """Base exception for LCCA application."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AuthenticationError(LCCAException):
    """Authentication failed."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status_code=401)


class AuthorizationError(LCCAException):
    """Authorization failed - insufficient permissions."""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, status_code=403)


class NotFoundError(LCCAException):
    """Resource not found."""

    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found", status_code=404)


class ValidationError(LCCAException):
    """Validation error."""

    def __init__(self, message: str):
        super().__init__(message, status_code=422)


class ScorintError(LCCAException):
    """Scoring process error."""

    def __init__(self, message: str):
        super().__init__(message, status_code=500)


class TimeoutError(LCCAException):
    """Operation timeout."""

    def __init__(self, message: str = "Operation timed out"):
        super().__init__(message, status_code=504)