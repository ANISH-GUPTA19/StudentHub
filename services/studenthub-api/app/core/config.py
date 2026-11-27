import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AppConfig:
    environment: str
    database_url: str
    storage_connection_string: str | None
    azure_openai_endpoint: str | None
    auth_secret: str | None
    upi_merchant_vpa: str | None
    upi_merchant_name: str


def require_setting(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config() -> AppConfig:
    environment = os.getenv("ENVIRONMENT", "Production")
    if environment == "Development":
        database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://studenthub:studenthub@localhost:5432/studenthub",
        )
        storage_connection_string = os.getenv("STORAGE_CONNECTION_STRING", "UseDevelopmentStorage=true")
    else:
        database_url = require_setting("DATABASE_URL")
        storage_connection_string = None

    auth_secret = os.getenv("AUTH_SECRET")
    if environment != "Development" and not auth_secret:
        raise RuntimeError("Missing required environment variable: AUTH_SECRET")

    return AppConfig(
        environment=environment,
        database_url=database_url,
        storage_connection_string=storage_connection_string,
        azure_openai_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        auth_secret=auth_secret or "studenthub-development-secret",
        upi_merchant_vpa=os.getenv("UPI_MERCHANT_VPA"),
        upi_merchant_name=os.getenv("UPI_MERCHANT_NAME", "StudentHub"),
    )
