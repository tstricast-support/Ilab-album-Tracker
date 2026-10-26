import os
from dotenv import load_dotenv
from pathlib import Path

# go from backend/app/config.py → project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent

load_dotenv(BASE_DIR / ".env.local")

if os.getenv("ENV") == "production":
    load_dotenv(BASE_DIR / ".env.production", override=True)


class Settings:
    ENV = os.getenv("ENV", "local")
    DATABASE_URL = os.getenv("DATABASE_URL")
    CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")
    CLERK_ISSUER = os.getenv("CLERK_ISSUER")
    CLERK_AUTHORIZED_PARTIES = [
        x.strip() for x in os.getenv("CLERK_AUTHORIZED_PARTIES", "").split(",") if x.strip()
    ]

    GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID")
    GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET")
    GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN")
    GMAIL_SENDER = os.getenv("GMAIL_SENDER", "ilabalbum@gmail.com")
    EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "true").lower() == "true"


settings = Settings()