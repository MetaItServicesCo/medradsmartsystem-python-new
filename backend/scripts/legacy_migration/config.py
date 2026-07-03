from __future__ import annotations

import os
from dataclasses import dataclass

from sqlalchemy.engine import URL, make_url


def _required_url(name: str) -> URL:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return make_url(value)


@dataclass(frozen=True)
class MigrationConfig:
    legacy_url: URL
    target_url: URL

    @classmethod
    def from_environment(cls) -> "MigrationConfig":
        legacy_url = _required_url("LEGACY_DATABASE_URL")
        target_url = _required_url("TARGET_DATABASE_URL")

        if not legacy_url.drivername.startswith("mysql"):
            raise RuntimeError("LEGACY_DATABASE_URL must use a MySQL/MariaDB driver")
        if not target_url.drivername.startswith("postgresql"):
            raise RuntimeError("TARGET_DATABASE_URL must use a PostgreSQL driver")

        return cls(legacy_url=legacy_url, target_url=target_url)

    def safe_summary(self) -> dict[str, str | int | None]:
        return {
            "legacy_host": self.legacy_url.host,
            "legacy_port": self.legacy_url.port,
            "legacy_database": self.legacy_url.database,
            "target_host": self.target_url.host,
            "target_port": self.target_url.port,
            "target_database": self.target_url.database,
        }

    def require_local_staging_target(self, confirmation: str) -> None:
        if confirmation != self.target_url.database:
            raise RuntimeError("Target confirmation does not match TARGET_DATABASE_URL")
        if self.target_url.host not in {"127.0.0.1", "localhost"}:
            raise RuntimeError(
                "Foundation writes are currently restricted to local staging"
            )
        if self.target_url.database != "medrad_migration":
            raise RuntimeError(
                "Foundation writes require the medrad_migration staging database"
            )
