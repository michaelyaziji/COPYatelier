"""Application configuration."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # AI Provider API Keys
    anthropic_api_key: str = ""
    google_api_key: str = ""
    openai_api_key: str = ""

    # Application settings
    environment: str = "development"
    log_level: str = "INFO"

    # Database settings
    database_url: str = "sqlite+aiosqlite:///./atelier.db"
    auto_migrate: bool = True
    database_echo: bool = False

    # Clerk Authentication
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""

    # Stripe Configuration
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_price_id: str = ""  # Stripe Price ID for Starter plan ($15/mo)
    stripe_pro_price_id: str = ""  # Stripe Price ID for Pro plan ($30/mo)
    stripe_starter_yearly_price_id: str = ""  # Yearly Starter plan
    stripe_pro_yearly_price_id: str = ""  # Yearly Pro plan

    # Frontend URL (for Stripe redirect)
    frontend_url: str = "http://localhost:3000"

    # CORS Configuration
    # Comma-separated list of allowed origins. In production, set to your domain.
    cors_origins: str = "http://localhost:3000"
    cors_allow_credentials: bool = True

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
