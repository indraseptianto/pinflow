from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "PinFlow"
    debug: bool = False
    database_url: str = "sqlite:///./pinflow.db"
    secret_key: str = "change-me-in-production"

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
