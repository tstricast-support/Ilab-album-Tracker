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


settings = Settings()