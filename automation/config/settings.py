import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-automation-key-not-for-production"
DEBUG = True

ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "corsheaders",
    "django.contrib.contenttypes",
    "rest_framework",
    "tender_search",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3125",
    "http://127.0.0.1:3125",
]

ROOT_URLCONF = "config.urls"

DATABASES = {}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
