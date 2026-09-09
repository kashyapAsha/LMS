import os

class Config:
    """Application Configuration Settings"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'lms_super_secret_key_2026_modern_lib')
    
    # MySQL Database Settings
    DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
    DB_PORT = int(os.environ.get('DB_PORT', 3306))
    DB_USER = os.environ.get('DB_USER', 'root')
    DB_PASSWORD = os.environ.get('DB_PASSWORD', '12345')
    DB_NAME = os.environ.get('DB_NAME', 'library_management_system')
    
    # Library Business Rules
    DEFAULT_LOAN_DAYS = int(os.environ.get('DEFAULT_LOAN_DAYS', 14))
    FINE_PER_DAY = float(os.environ.get('FINE_PER_DAY', 1.00))
    MAX_RENEWALS = int(os.environ.get('MAX_RENEWALS', 2))
    
    # Flask Settings
    DEBUG = os.environ.get('DEBUG', 'True').lower() in ('true', '1', 't')
    PORT = int(os.environ.get('PORT', 5000))
