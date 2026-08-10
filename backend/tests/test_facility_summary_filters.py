from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.facilities import read_facilities, read_facility_summary
from app.db.base import Base
from app.models.facility import Facility
from app.models.facility_tier import FacilityTier
from app.models.tier import Tier
from app.models.user import User, UserRole, UserType


def _facility(name: str, *, country: str, status: str = "active", tier_id: int | None = None) -> Facility:
    return Facility(
        name=name,
        phone="(214) 555-0100",
        email=f"{name.lower().replace(' ', '.')}@example.com",
        address="1 Main Street",
        city="Dallas",
        state="TX",
        zip_code="75001",
        country=country,
        status=status,
        tier_id=tier_id,
    )


def test_facility_cards_return_exact_server_filtered_result_sets() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        user = User(
            username="admin",
            email="admin@example.com",
            full_name="Admin User",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN,
        )
        tier = Tier(
            tier_code="GOLD",
            name="Gold",
            labor_rate_per_hour=Decimal("100"),
            service_call_fee=Decimal("50"),
            preventive_maintenance_fee=Decimal("75"),
            mileage_rate=Decimal("2"),
        )
        db.add_all([user, tier])
        db.flush()

        direct_tier = _facility("Direct Tier", country="United States", tier_id=tier.id)
        assigned_tier = _facility("Assigned Tier", country="Canada")
        inactive = _facility("Inactive Facility", country="United States", status="inactive")
        active = _facility("Active Facility", country="United States")
        db.add_all([direct_tier, assigned_tier, inactive, active])
        db.flush()
        db.add(FacilityTier(facility_id=assigned_tier.id, tier_id=tier.id))
        db.commit()

        summary = read_facility_summary(db=db, current_user=user)
        assert summary == {
            "total": 4,
            "active": 3,
            "tiered": 2,
            "countries": [
                {"country": "Canada", "count": 1},
                {"country": "United States", "count": 3},
            ],
        }

        common = {
            "db": db,
            "skip": 0,
            "limit": 100,
            "search": None,
            "search_field": None,
            "current_user": user,
        }
        active_result = read_facilities(**common, status="active", has_tier=None, country=None)
        tiered_result = read_facilities(**common, status=None, has_tier=True, country=None)
        country_result = read_facilities(**common, status=None, has_tier=None, country="Canada")

        assert active_result["total"] == 3
        assert {item["name"] for item in active_result["items"]} == {
            "Active Facility",
            "Assigned Tier",
            "Direct Tier",
        }
        assert tiered_result["total"] == 2
        assert {item["name"] for item in tiered_result["items"]} == {"Assigned Tier", "Direct Tier"}
        assert country_result["total"] == 1
        assert country_result["items"][0]["name"] == "Assigned Tier"
    finally:
        db.close()
        engine.dispose()
