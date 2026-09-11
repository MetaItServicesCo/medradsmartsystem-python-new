"""Seed a worked demonstration hospital.

Built for a fresh install, where `create_all` has produced the tables and there
is nothing in them. It writes a small but internally consistent estate rather
than a pile of placeholder rows: the beds add up to their rooms' bed counts,
the chiller that serves a wing is the one the work order is raised against,
the permit that is open is open against a room that is genuinely out of
service, and the ledger entries sum to the book value the asset page shows.

That consistency is the point. Data generated field-by-field looks fine in a
table and falls apart the moment a screen joins two things together.

Idempotent: it keys off the facility name and does nothing if already present,
so it is safe to run twice.

    docker compose run --rm backend python scripts/seed_demo.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.db.base import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.user import User, UserType, UserRole  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.equipment import Equipment, EquipmentStatus  # noqa: E402
from app.models.service_request import (  # noqa: E402
    ServiceRequest, Priority, ServiceRequestStatus,
)
from app.models.discipline import Discipline, UserDiscipline  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.space_status import SpaceStatus  # noqa: E402
from app.models.vendor import (  # noqa: E402
    Vendor, VendorContact, VendorCredential, VendorContract,
)
from app.models.permit import WorkPermit, PermitApproval  # noqa: E402
from app.models.compliance import ComplianceProgram, ComplianceTask  # noqa: E402
from app.models.maintenance_schedule import MaintenanceSchedule  # noqa: E402
from app.models.asset_ledger import AssetLedgerEntry  # noqa: E402
from app.services import location_tree  # noqa: E402

FACILITY_NAME = "Medpro Regional Medical Center"
TODAY = date.today()
NOW = datetime.utcnow()

SEED_DISCIPLINES = (
    ("mechanical", "Mechanical / HVAC", "#0EA5E9", "Air handling, chillers, boilers, exhaust, controls", 10),
    ("electrical", "Electrical", "#F59E0B", "Distribution, panels, generators, transfer switches, lighting", 20),
    ("plumbing", "Plumbing", "#3B82F6", "Domestic water, sanitary, storm, backflow, water heaters", 30),
    ("vertical_transport", "Vertical Transport", "#8B5CF6", "Elevators, escalators, dumbwaiters, lifts", 40),
    ("fire_life_safety", "Fire & Life Safety", "#EF4444", "Alarm, sprinkler, standpipe, fire pump, suppression, dampers", 50),
    ("medical_gas", "Medical Gas & Vacuum", "#10B981", "Oxygen, medical air, nitrous, vacuum, manifolds, zone valves", 60),
    ("building_envelope", "Building & Envelope", "#78716C", "Roofing, doors, hardware, glazing, finishes, casework", 70),
    ("it_low_voltage", "IT & Low Voltage", "#6366F1", "Structured cabling, nurse call, access control, CCTV", 80),
    ("biomedical", "Biomedical", "#EC4899", "Clinical equipment — bridges to the existing modality tree", 90),
)


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(Facility).filter_by(name=FACILITY_NAME).first():
            print("Demo facility already present; nothing to do.")
            return

        # ── Disciplines ─────────────────────────────────────────────────────
        # Normally written by the facilities migration's bulk_insert. A schema
        # built by create_all has the table but not the rows.
        disciplines: dict[str, Discipline] = {}
        for code, name, colour, description, order in SEED_DISCIPLINES:
            found = db.query(Discipline).filter_by(code=code).first()
            if not found:
                found = Discipline(
                    code=code, name=name, color=colour,
                    description=description, sort_order=order,
                )
                db.add(found)
            disciplines[code] = found
        db.flush()

        # ── Facility ────────────────────────────────────────────────────────
        facility = Facility(
            name=FACILITY_NAME,
            phone="(404) 555-0142",
            email="facilities@medprosmartsystem.com",
            address="1400 Peachtree Industrial Blvd",
            city="Atlanta", state="GA", zip_code="30309", country="USA",
            contact_person="Dana Whitfield",
            status="active",
        )
        db.add(facility)
        db.flush()

        departments = {}
        for dept_name in ("Surgery", "Critical Care", "Emergency",
                          "Radiology", "Facilities Engineering", "Pharmacy"):
            dept = Department(name=dept_name, facility_id=facility.id)
            db.add(dept)
            departments[dept_name] = dept
        db.flush()

        # ── People ──────────────────────────────────────────────────────────
        def make_user(username, full_name, role, email, discipline_codes=()):
            user = User(
                username=username, email=email, full_name=full_name,
                hashed_password=get_password_hash("Demo!2026"),
                user_type=UserType.EMPLOYEE, role=role, is_active=True,
            )
            db.add(user)
            db.flush()
            for index, code in enumerate(discipline_codes):
                db.add(UserDiscipline(
                    user_id=user.id, discipline_id=disciplines[code].id,
                    is_primary=(index == 0),
                ))
            return user

        admin = make_user("admin", "System Administrator", UserRole.SUPERADMIN,
                          "admin@medprosmartsystem.com")
        fm = make_user("dwhitfield", "Dana Whitfield", UserRole.FACILITY_MANAGER,
                       "dana.whitfield@medprosmartsystem.com",
                       ("mechanical", "electrical"))
        tech_mech = make_user("rkline", "Ray Kline", UserRole.TECHNICIAN,
                              "ray.kline@medprosmartsystem.com",
                              ("mechanical", "plumbing"))
        tech_elec = make_user("mosei", "Marcus Osei", UserRole.TECHNICIAN,
                              "marcus.osei@medprosmartsystem.com",
                              ("electrical", "it_low_voltage"))
        tech_bio = make_user("jnavarro", "Julia Navarro", UserRole.TECHNICIAN,
                             "julia.navarro@medprosmartsystem.com",
                             ("biomedical", "medical_gas"))
        nurse = make_user("pellery", "Priya Ellery", UserRole.EMPLOYEE,
                          "priya.ellery@medprosmartsystem.com")
        db.flush()

        # ── Location tree ───────────────────────────────────────────────────
        def add_location(parent, location_type, code, name, **kwargs):
            node = Location(
                facility_id=facility.id,
                parent_id=parent.id if parent else None,
                location_type=location_type, code=code, name=name,
                created_by_id=admin.id, **kwargs,
            )
            db.add(node)
            db.flush()
            location_tree.assign_path(db, node, parent)
            return node

        main_bldg = add_location(None, "building", "A", "Main Hospital")
        plant_bldg = add_location(None, "building", "B", "Central Utility Plant")

        basement = add_location(main_bldg, "floor", "A-B1", "Basement")
        ground = add_location(main_bldg, "floor", "A-01", "Ground Floor")
        second = add_location(main_bldg, "floor", "A-02", "Second Floor")
        third = add_location(main_bldg, "floor", "A-03", "Third Floor")
        roof = add_location(main_bldg, "roof", "A-RF", "Main Roof")
        plant_gf = add_location(plant_bldg, "floor", "B-01", "Plant Floor")

        surgery = add_location(second, "wing", "A-02-S", "Surgical Suite")
        critical = add_location(third, "wing", "A-03-C", "Critical Care")
        medsurg = add_location(third, "wing", "A-03-M", "Med/Surg")

        rooms: dict[str, Location] = {}

        # Operating theatres — high acuity, environmentally gated.
        for n in range(1, 5):
            rooms[f"OR-{n}"] = add_location(
                surgery, "room", f"OR-{n}", f"Operating Room {n}",
                space_use="operating_room", criticality="critical",
                electrical_branch="critical",
                area_sqft=Decimal("620.00"), ceiling_height_ft=Decimal("10.00"),
                volume_cuft=Decimal("6200.00"),
                department_id=departments["Surgery"].id,
            )

        # ICU rooms, one bed each.
        for n in range(1, 9):
            room = add_location(
                critical, "room", f"ICU-{n}", f"ICU Bed Bay {n}",
                space_use="icu", criticality="critical",
                electrical_branch="critical",
                area_sqft=Decimal("280.00"), ceiling_height_ft=Decimal("9.00"),
                volume_cuft=Decimal("2520.00"), bed_count=1,
                department_id=departments["Critical Care"].id,
            )
            rooms[f"ICU-{n}"] = room
            add_location(room, "bed", f"ICU-{n}-A", f"ICU {n} Bed A")

        # Med/Surg patient rooms, two beds each.
        for n in range(301, 311):
            room = add_location(
                medsurg, "room", str(n), f"Patient Room {n}",
                space_use="patient_room", criticality="high",
                electrical_branch="equipment",
                area_sqft=Decimal("320.00"), ceiling_height_ft=Decimal("9.00"),
                volume_cuft=Decimal("2880.00"), bed_count=2,
            )
            rooms[str(n)] = room
            for letter in ("A", "B"):
                add_location(room, "bed", f"{n}-{letter}", f"Room {n} Bed {letter}")

        rooms["ED-MAIN"] = add_location(
            ground, "room", "ED-MAIN", "Emergency Department",
            space_use="emergency", criticality="critical",
            electrical_branch="critical", area_sqft=Decimal("4200.00"),
            department_id=departments["Emergency"].id,
        )
        rooms["CT-SUITE"] = add_location(
            ground, "room", "CT-1", "CT Suite 1", space_use="imaging",
            criticality="high", electrical_branch="equipment",
            area_sqft=Decimal("540.00"),
            department_id=departments["Radiology"].id,
        )
        rooms["PHARM"] = add_location(
            ground, "room", "PH-01", "Inpatient Pharmacy", space_use="pharmacy",
            criticality="high", department_id=departments["Pharmacy"].id,
        )
        rooms["SPD"] = add_location(
            basement, "room", "SPD-01", "Sterile Processing",
            space_use="sterile_processing", criticality="high",
            area_sqft=Decimal("1800.00"),
        )
        rooms["MECH-B1"] = add_location(
            basement, "mech_room", "MR-B1", "Basement Mechanical Room",
            space_use="mechanical", criticality="high",
            area_sqft=Decimal("2400.00"),
        )
        rooms["ELEC-B1"] = add_location(
            basement, "room", "ER-B1", "Main Electrical Room",
            space_use="electrical", criticality="critical",
            electrical_branch="critical",
        )
        rooms["PLANT"] = add_location(
            plant_gf, "mech_room", "MR-B-01", "Chiller Hall",
            space_use="mechanical", criticality="critical",
            area_sqft=Decimal("5200.00"),
        )
        rooms["DATA"] = add_location(
            ground, "room", "DC-01", "Main Data Centre", space_use="data",
            criticality="critical", electrical_branch="critical",
        )
        add_location(main_bldg, "riser", "RS-A-1", "Wet Riser A")
        add_location(main_bldg, "shaft", "SH-A-1", "Elevator Shaft A")
        db.flush()

        # ── Bed and theatre state ───────────────────────────────────────────
        # Status records state, never who is in the bed. That boundary is what
        # keeps occupancy tracking outside HIPAA scope.
        def set_status(location, availability, **kwargs):
            db.add(SpaceStatus(
                facility_id=facility.id, location_id=location.id,
                availability=availability, since=NOW - timedelta(hours=6),
                source="seed", changed_by_id=nurse.id, **kwargs,
            ))

        beds = db.query(Location).filter_by(
            facility_id=facility.id, location_type="bed",
        ).order_by(Location.id).all()
        for index, bed in enumerate(beds):
            if index % 3 == 0:
                set_status(bed, "occupied")
            elif index % 7 == 0:
                set_status(bed, "vacant_dirty")
            else:
                set_status(bed, "available")

        set_status(rooms["OR-1"], "in_procedure")
        set_status(rooms["OR-2"], "available")
        set_status(rooms["OR-3"], "turnover")
        set_status(
            rooms["OR-4"], "out_of_service", oos_reason="environmental_out_of_spec",
            expected_return_at=NOW + timedelta(days=2),
            notes="Positive pressure below ASHRAE 170 minimum; AHU-2 under repair.",
        )
        db.flush()

        # ── Vendors ─────────────────────────────────────────────────────────
        def add_vendor(code, name, vendor_type, discipline_codes, city, phone,
                       email, credentials, contract=None, contact=None):
            vendor = Vendor(
                code=code, name=name, vendor_type=vendor_type, status="active",
                discipline_ids=[disciplines[c].id for c in discipline_codes],
                phone=phone, after_hours_phone=phone, email=email,
                address="Suite 200", city=city, state="GA", zip_code="30328",
                country="USA",
            )
            db.add(vendor)
            db.flush()
            if contact:
                full_name, title, cphone, cemail = contact
                db.add(VendorContact(
                    vendor_id=vendor.id, full_name=full_name, title=title,
                    phone=cphone, email=cemail, is_primary=True,
                    is_escalation=True, escalation_order=1,
                ))
            earliest = None
            for ctype, identifier, issuer, days, amount, blocking in credentials:
                expires = TODAY + timedelta(days=days)
                earliest = expires if earliest is None else min(earliest, expires)
                db.add(VendorCredential(
                    vendor_id=vendor.id, credential_type=ctype,
                    identifier=identifier, issuer=issuer, jurisdiction="GA",
                    issued_on=expires - timedelta(days=365),
                    expires_on=expires,
                    coverage_amount=Decimal(amount) if amount else None,
                    is_blocking=blocking,
                ))
            vendor.earliest_credential_expiry = earliest
            # False also means "nobody has checked", which is deliberately not
            # the same as being fine.
            vendor.credentials_ok = all(d > 0 for _, _, _, d, _, _ in credentials)
            if contract:
                number, title, ctype, annual, rate, months = contract
                db.add(VendorContract(
                    contract_number=number, vendor_id=vendor.id,
                    facility_id=facility.id, title=title, contract_type=ctype,
                    status="active",
                    discipline_ids=[disciplines[c].id for c in discipline_codes],
                    start_date=TODAY - timedelta(days=90),
                    end_date=TODAY + timedelta(days=30 * months),
                    renewal_notice_date=TODAY + timedelta(days=30 * months - 60),
                    auto_renews=True, annual_value=Decimal(annual),
                    labor_rate_per_hour=Decimal(rate),
                    overtime_rate_per_hour=Decimal(rate) * Decimal("1.5"),
                    response_hours_by_priority={
                        "critical": 2, "high": 4, "medium": 24, "low": 72,
                    },
                    covers_after_hours=True, covers_parts=True,
                ))
            return vendor

        v_mech = add_vendor(
            "ATL-MECH", "Atlantic Mechanical Services", "service_contractor",
            ["mechanical"], "Atlanta", "(404) 555-0188",
            "dispatch@atlanticmech.example",
            [("general_liability", "GL-884213", "Travelers", 240, "2000000.00", True),
             ("workers_comp", "WC-33120", "Travelers", 240, "1000000.00", True),
             ("state_license", "CN-209844", "GA State Board", 500, None, True)],
            contract=("CT-2026-014", "Chiller and AHU full service",
                      "full_service", "86400.00", "145.00", 12),
            contact=("Elena Prokop", "Service Manager", "(404) 555-0189",
                     "elena.prokop@atlanticmech.example"),
        )
        v_elev = add_vendor(
            "VTX-ELEV", "Vertex Elevator Co.", "service_contractor",
            ["vertical_transport"], "Marietta", "(770) 555-0110",
            "service@vertexelevator.example",
            [("general_liability", "GL-771002", "Hartford", 150, "5000000.00", True),
             ("elevator_mechanic_license", "EM-4417", "GA DOL", 45, None, True)],
            contract=("CT-2026-021", "Elevator maintenance and testing",
                      "preventive_only", "42000.00", "165.00", 24),
            contact=("Sam Odum", "Route Supervisor", "(770) 555-0111",
                     "sam.odum@vertexelevator.example"),
        )
        v_fire = add_vendor(
            "GRD-FIRE", "Guardian Fire Protection", "service_contractor",
            ["fire_life_safety"], "Smyrna", "(678) 555-0144",
            "ops@guardianfire.example",
            [("general_liability", "GL-660914", "Chubb", 310, "3000000.00", True),
             ("nicet", "NICET-III-88214", "NICET", 700, None, False),
             # Already lapsed — the watchlist should surface this one.
             ("state_license", "FS-11902", "GA Fire Marshal", -12, None, True)],
            contract=("CT-2025-088", "Sprinkler, standpipe and alarm ITM",
                      "inspection_only", "31500.00", "130.00", 6),
            contact=("Tara Beaumont", "Account Lead", "(678) 555-0145",
                     "tara.beaumont@guardianfire.example"),
        )
        v_gas = add_vendor(
            "PRX-GAS", "Praxis Medical Gas", "service_contractor",
            ["medical_gas"], "Norcross", "(770) 555-0177",
            "service@praxismedgas.example",
            [("medical_gas_cert", "ASSE-6030-2214", "ASSE", 420, None, True),
             ("general_liability", "GL-552010", "CNA", 200, "2000000.00", True)],
            contract=("CT-2026-006", "Medical gas verification and repair",
                      "time_and_materials", "0.00", "185.00", 18),
            contact=("Wesley Hart", "Certified Verifier", "(770) 555-0178",
                     "wesley.hart@praxismedgas.example"),
        )
        v_elec = add_vendor(
            "NPT-ELEC", "Northpoint Electrical", "service_contractor",
            ["electrical"], "Alpharetta", "(678) 555-0133",
            "dispatch@northpointelec.example",
            [("general_liability", "GL-449001", "Zurich", 275, "4000000.00", True),
             ("state_license", "EC-77213", "GA State Board", 610, None, True)],
            contract=("CT-2026-033", "Generator and switchgear service",
                      "full_service", "58000.00", "158.00", 12),
            contact=("Ivan Castile", "Field Supervisor", "(678) 555-0134",
                     "ivan.castile@northpointelec.example"),
        )
        db.flush()

        # ── Assets ──────────────────────────────────────────────────────────
        modalities = {}
        PLANT = ModalityCategory.TREATMENT
        for mod_name, category in (
            ("Chiller", PLANT), ("Air Handling Unit", PLANT),
            ("Boiler", PLANT), ("Generator", PLANT),
            ("Switchgear", PLANT), ("Elevator", PLANT),
            ("Fire Pump", PLANT),
            ("Medical Gas Manifold", ModalityCategory.TREATMENT),
            ("CT Scanner", ModalityCategory.IMAGING),
            ("Ventilator", ModalityCategory.PATIENT_MONITORING),
        ):
            mod = Modality(name=mod_name, category=category,
                           inspection_frequency_days=365)
            db.add(mod)
            modalities[mod_name] = mod
        db.flush()

        def add_asset(tag, make, model, serial, modality, discipline, location,
                      criticality, cost, life, installed, vendor=None,
                      branch=None, method="straight_line"):
            asset = Equipment(
                asset_tag=tag, make=make, model=model, serial_number=serial,
                modality_id=modalities[modality].id, facility_id=facility.id,
                discipline_id=disciplines[discipline].id,
                location_id=location.id, criticality=criticality,
                electrical_branch=branch,
                service_vendor_id=vendor.id if vendor else None,
                depreciation_method=method,
                useful_life_years=life,
                salvage_value=Decimal(cost) * Decimal("0.05"),
                cost=Decimal(cost), acquisition_date=installed,
                installation_date=installed, purchase_date=installed,
                status=EquipmentStatus.ACTIVE, capital_equipment="yes",
                warranty_expiration=installed + timedelta(days=365 * 2),
            )
            db.add(asset)
            db.flush()
            # Every asset opens its ledger with what it cost.
            db.add(AssetLedgerEntry(
                facility_id=facility.id, equipment_id=asset.id,
                entry_type="acquisition", effective_date=installed,
                description=f"Purchase and installation of {tag}",
                amount=Decimal(cost), vendor_id=vendor.id if vendor else None,
                reference=f"PO-{installed.year}-{asset.id:04d}",
                created_by_id=admin.id,
            ))
            return asset

        ch1 = add_asset("CH-1", "York", "YMC2-0450", "YK4471120", "Chiller",
                        "mechanical", rooms["PLANT"], "critical", "412000.00",
                        25, date(2019, 4, 12), v_mech, "equipment")
        ch2 = add_asset("CH-2", "York", "YMC2-0450", "YK4471121", "Chiller",
                        "mechanical", rooms["PLANT"], "critical", "412000.00",
                        25, date(2019, 4, 12), v_mech, "equipment")
        ahu1 = add_asset("AHU-1", "Trane", "M-Series CSAA", "TR88120", "Air Handling Unit",
                         "mechanical", rooms["MECH-B1"], "critical", "96500.00",
                         20, date(2019, 6, 3), v_mech, "equipment")
        ahu2 = add_asset("AHU-2", "Trane", "M-Series CSAA", "TR88121", "Air Handling Unit",
                         "mechanical", rooms["MECH-B1"], "critical", "96500.00",
                         20, date(2019, 6, 3), v_mech, "equipment")
        add_asset("B-1", "Cleaver-Brooks", "CBEX-200", "CB55012", "Boiler",
                  "mechanical", rooms["PLANT"], "high", "184000.00", 25,
                  date(2018, 11, 20), v_mech)
        gen1 = add_asset("GEN-1", "Caterpillar", "C1750 D5", "CAT99231", "Generator",
                         "electrical", rooms["ELEC-B1"], "critical", "528000.00",
                         30, date(2018, 9, 14), v_elec, "life_safety")
        gen2 = add_asset("GEN-2", "Caterpillar", "C1750 D5", "CAT99232", "Generator",
                         "electrical", rooms["ELEC-B1"], "critical", "528000.00",
                         30, date(2018, 9, 14), v_elec, "critical")
        add_asset("MSB-1", "Square D", "Masterpact NW", "SQ41200", "Switchgear",
                  "electrical", rooms["ELEC-B1"], "critical", "245000.00", 30,
                  date(2018, 8, 2), v_elec, "critical")
        elev1 = add_asset("ELEV-1", "Otis", "Gen2 Premier", "OT77120", "Elevator",
                          "vertical_transport", main_bldg, "high", "310000.00",
                          25, date(2019, 1, 30), v_elev, "equipment")
        add_asset("ELEV-2", "Otis", "Gen2 Premier", "OT77121", "Elevator",
                  "vertical_transport", main_bldg, "high", "310000.00", 25,
                  date(2019, 1, 30), v_elev, "equipment")
        fp1 = add_asset("FP-1", "Patterson", "PFVC-1500", "PT33019", "Fire Pump",
                        "fire_life_safety", rooms["MECH-B1"], "critical",
                        "142000.00", 25, date(2019, 2, 18), v_fire, "life_safety")
        o2 = add_asset("O2-MAN-1", "Amico", "M2-Series", "AM22014",
                       "Medical Gas Manifold", "medical_gas", rooms["MECH-B1"],
                       "critical", "38500.00", 15, date(2020, 3, 9), v_gas,
                       "critical")
        ct1 = add_asset("CT-001", "Siemens", "SOMATOM go.Top", "SM2291144",
                        "CT Scanner", "biomedical", rooms["CT-SUITE"], "high",
                        "1240000.00", 10, date(2021, 5, 24), None, "equipment",
                        method="double_declining")
        add_asset("VENT-014", "Dräger", "Evita V600", "DR771230", "Ventilator",
                  "biomedical", rooms["ICU-3"], "critical", "42800.00", 8,
                  date(2022, 7, 11), None, "critical")
        db.flush()

        # A few ledger events beyond the opening entry, so the timeline and the
        # depreciation schedule have something to disagree about if they drift.
        db.add(AssetLedgerEntry(
            facility_id=facility.id, equipment_id=ch1.id, entry_type="improvement",
            effective_date=TODAY - timedelta(days=210),
            description="Compressor rebuild and VFD replacement",
            amount=Decimal("74500.00"), extends_useful_life_years=4,
            vendor_id=v_mech.id, reference="WO-2026-0412", created_by_id=fm.id,
        ))
        db.add(AssetLedgerEntry(
            facility_id=facility.id, equipment_id=ct1.id, entry_type="transfer",
            effective_date=TODAY - timedelta(days=45),
            description="Relocated from Imaging 2 to CT Suite 1",
            from_location_id=rooms["ED-MAIN"].id, to_location_id=rooms["CT-SUITE"].id,
            created_by_id=fm.id,
        ))
        db.flush()

        # ── Preventive maintenance ──────────────────────────────────────────
        def add_schedule(name, asset, discipline, basis, days=None, hours=None,
                         priority="medium", vendor=None, tech=None,
                         out_of_service=False, task=None):
            db.add(MaintenanceSchedule(
                facility_id=facility.id, equipment_id=asset.id,
                location_id=asset.location_id, name=name, task_description=task,
                discipline_id=disciplines[discipline].id, basis=basis,
                interval_days=days, interval_runtime_hours=hours,
                priority=priority, lead_time_days=7,
                assigned_vendor_id=vendor.id if vendor else None,
                assigned_technician_id=tech.id if tech else None,
                takes_space_out_of_service=out_of_service, status="active",
                next_due_date=TODAY + timedelta(days=(days or 30) // 3),
            ))

        add_schedule("AHU-1 filter change and coil inspection", ahu1, "mechanical",
                     "calendar", days=90, priority="medium", tech=tech_mech,
                     task="Replace MERV 14 final filters, inspect coils and drain pan, "
                          "verify static pressure against design.")
        add_schedule("AHU-2 filter change and coil inspection", ahu2, "mechanical",
                     "calendar", days=90, priority="medium", tech=tech_mech)
        add_schedule("CH-1 annual teardown", ch1, "mechanical",
                     "calendar_or_runtime", days=365, hours=8000,
                     priority="high", vendor=v_mech,
                     task="Eddy current tube testing, oil and refrigerant analysis, "
                          "starter inspection.")
        add_schedule("CH-2 annual teardown", ch2, "mechanical",
                     "calendar_or_runtime", days=365, hours=8000,
                     priority="high", vendor=v_mech)
        add_schedule("GEN-1 monthly load bank test", gen1, "electrical",
                     "calendar", days=30, priority="critical", vendor=v_elec,
                     task="30 percent nameplate minimum for 30 minutes under NFPA 110.")
        add_schedule("GEN-2 monthly load bank test", gen2, "electrical",
                     "calendar", days=30, priority="critical", vendor=v_elec)
        add_schedule("ELEV-1 monthly service", elev1, "vertical_transport",
                     "calendar", days=30, priority="medium", vendor=v_elev,
                     out_of_service=True)
        add_schedule("FP-1 weekly churn test", fp1, "fire_life_safety",
                     "calendar", days=7, priority="high", tech=tech_mech)
        add_schedule("O2 manifold quarterly inspection", o2, "medical_gas",
                     "calendar", days=91, priority="critical", vendor=v_gas)
        db.flush()

        # ── Compliance programmes ───────────────────────────────────────────
        programmes = []

        def add_programme(code, name, authority, citation, frequency, discipline,
                          grace, certificate, licensed, space_uses=None,
                          procedure=None):
            programme = ComplianceProgram(
                facility_id=facility.id, code=code, name=name,
                authority=authority, citation=citation, frequency=frequency,
                discipline_id=disciplines[discipline].id, grace_days=grace,
                requires_certificate=certificate,
                certificate_must_be_posted=certificate,
                requires_licensed_provider=licensed,
                applies_to_space_uses=space_uses, procedure=procedure,
                is_active=True,
            )
            db.add(programme)
            db.flush()
            programmes.append(programme)
            return programme

        p_gen = add_programme(
            "NFPA110-MONTHLY", "Emergency generator monthly load test", "nfpa",
            "NFPA 110 8.4.2", "monthly", "electrical", 7, False, False,
            procedure="Run each EPS under a minimum 30 percent nameplate load "
                      "for 30 minutes. Record kW, voltage, frequency, coolant "
                      "and exhaust temperature.",
        )
        p_gas = add_programme(
            "NFPA99-MEDGAS", "Medical gas system annual verification", "nfpa",
            "NFPA 99 5.1.12", "annual", "medical_gas", 30, True, True,
            procedure="Verify source equipment, alarms, zone valves and outlet "
                      "flow. ASSE 6030 verifier required.",
        )
        p_air = add_programme(
            "ASHRAE170-OR", "Operating room pressure and air change verification",
            "ashrae", "ASHRAE 170 Table 7-1", "quarterly", "mechanical", 14,
            False, False, space_uses=["operating_room", "procedure_room"],
            procedure="Confirm positive differential to adjacent spaces, "
                      "minimum 20 total ACH, 4 outdoor ACH, 20-60 percent RH, "
                      "68-75 degF.",
        )
        p_elev = add_programme(
            "ASME-A17.1", "Elevator annual inspection and category test", "asme",
            "ASME A17.1 8.11", "annual", "vertical_transport", 30, True, True,
        )
        p_spr = add_programme(
            "NFPA25-QTR", "Sprinkler and standpipe quarterly inspection", "nfpa",
            "NFPA 25 Table 5.1.1.2", "quarterly", "fire_life_safety", 14,
            True, False,
        )
        p_alarm = add_programme(
            "NFPA72-ANNUAL", "Fire alarm annual test", "nfpa", "NFPA 72 14.4.5",
            "annual", "fire_life_safety", 30, True, True,
        )
        db.flush()

        # Tasks across the states a surveyor would actually look at: recently
        # completed with a certificate, due soon, and one genuinely overdue.
        def add_task(programme, asset, due_offset, status, **kwargs):
            db.add(ComplianceTask(
                facility_id=facility.id, program_id=programme.id,
                equipment_id=asset.id if asset else None,
                location_id=asset.location_id if asset else None,
                status=status, due_date=TODAY + timedelta(days=due_offset),
                grace_days=programme.grace_days, **kwargs,
            ))

        add_task(p_gen, gen1, -40, "completed",
                 completed_at=NOW - timedelta(days=41), completed_by_id=tech_elec.id,
                 result="pass", performed_by_vendor_id=v_elec.id,
                 measured_values={"load_kw": 612, "duration_min": 32,
                                  "coolant_f": 186, "frequency_hz": 60.0},
                 findings="Ran 32 minutes at 35 percent nameplate. No exceptions.")
        add_task(p_gen, gen1, -8, "overdue",
                 notes="Missed while the load bank was on loan to the east campus.")
        add_task(p_gen, gen2, 12, "scheduled")
        add_task(p_gas, o2, 64, "scheduled", performed_by_vendor_id=v_gas.id)
        add_task(p_elev, elev1, -120, "completed",
                 completed_at=NOW - timedelta(days=121),
                 performed_by_vendor_id=v_elev.id, result="pass_with_deficiency",
                 certificate_number="GA-ELEV-2026-11842",
                 certificate_issued_by="Vertex Elevator Co.",
                 inspector_license="EM-4417",
                 certificate_issued_on=TODAY - timedelta(days=121),
                 certificate_expires_on=TODAY + timedelta(days=244),
                 findings="Pit ladder below code height; corrected on site.",
                 corrective_action="Ladder extended and re-inspected.")
        add_task(p_spr, fp1, 5, "scheduled", performed_by_vendor_id=v_fire.id)
        add_task(p_alarm, fp1, 150, "scheduled")
        for theatre in ("OR-1", "OR-2", "OR-3", "OR-4"):
            db.add(ComplianceTask(
                facility_id=facility.id, program_id=p_air.id,
                location_id=rooms[theatre].id, status="scheduled",
                due_date=TODAY + timedelta(days=21), grace_days=p_air.grace_days,
            ))
        db.flush()

        # ── Work permits ────────────────────────────────────────────────────
        def add_permit(number, permit_type, status, title, location, **kwargs):
            permit = WorkPermit(
                permit_number=number, facility_id=facility.id,
                location_id=location.id if location else None,
                permit_type=permit_type, status=status, title=title,
                requested_by_id=fm.id, requested_at=NOW - timedelta(days=3),
                valid_from=NOW - timedelta(days=1),
                valid_to=NOW + timedelta(days=6), **kwargs,
            )
            db.add(permit)
            db.flush()
            return permit

        icra = add_permit(
            "PRM-2026-0101", "icra", "approved",
            "Ceiling access above Med/Surg corridor for duct cleaning",
            rooms["305"],
            description="Remove ceiling tiles to access supply duct.",
            construction_activity_type="type_b", patient_risk_group="group_3",
            icra_class="class_iii",
            required_precautions="Full barrier with anteroom, negative pressure "
                                 "to corridor, HEPA filtration, sticky mats.",
            impairs_smoke_barrier=True,
            affected_location_ids=[rooms["305"].id, rooms["306"].id],
            affected_summary="2 patient rooms, 4 beds",
        )
        for role in ("infection_prevention", "safety_officer", "nurse_manager"):
            db.add(PermitApproval(
                permit_id=icra.id, approver_role=role, status="approved",
                approved_by_id=fm.id, approved_by_name=fm.full_name,
                decided_at=NOW - timedelta(days=2),
                conditions="Barrier verified before start.",
            ))

        hot = add_permit(
            "PRM-2026-0102", "hot_work", "active",
            "Welding on chilled water line, Chiller Hall", rooms["PLANT"],
            description="Cut and weld 6 inch chilled water branch.",
            impairs_fire_alarm=True, fire_watch_required=True,
            fire_watch_minutes_after=60, fire_watch_by="Ray Kline",
            extinguisher_verified=True,
            ilsm_measures="Smoke detector bagged in work zone only; "
                          "continuous fire watch; extinguisher within 35 ft.",
            activated_at=NOW - timedelta(hours=4),
        )
        db.add(PermitApproval(
            permit_id=hot.id, approver_role="safety_officer", status="approved",
            approved_by_id=fm.id, approved_by_name=fm.full_name,
            decided_at=NOW - timedelta(days=1),
        ))

        shutdown = add_permit(
            "PRM-2026-0103", "utility_shutdown", "pending_approval",
            "Chilled water shutdown for CH-2 tube cleaning", rooms["PLANT"],
            description="Isolate CH-2 for annual tube cleaning. CH-1 carries load.",
            service_type="chilled_water", impairs_egress=False,
            affected_location_ids=[rooms["OR-1"].id, rooms["OR-2"].id,
                                   rooms["OR-3"].id, rooms["OR-4"].id],
            affected_summary="4 operating rooms on standby cooling",
        )
        for role in ("facility_manager", "clinical_engineering", "administrator"):
            db.add(PermitApproval(permit_id=shutdown.id, approver_role=role,
                                  status="pending"))

        loto = add_permit(
            "PRM-2026-0098", "loto", "closed",
            "Lockout of AHU-2 for bearing replacement", rooms["MECH-B1"],
            description="Motor bearing replacement.",
            isolation_points="MCC-B1 breaker 14, locked and tagged; "
                             "VFD disconnect open.",
            energy_verified_zero=True, controls_removed=True,
            closed_at=NOW - timedelta(days=5), closed_by_id=tech_mech.id,
            closeout_notes="Locks removed, unit returned to automatic control.",
        )
        db.add(PermitApproval(
            permit_id=loto.id, approver_role="facility_manager", status="approved",
            approved_by_id=fm.id, approved_by_name=fm.full_name,
            decided_at=NOW - timedelta(days=7),
        ))
        db.flush()

        # ── Work orders ─────────────────────────────────────────────────────
        # The point of the whole extension: a fault against a room with no
        # asset behind it is a first-class work order.
        def add_request(number, description, priority, status, location=None,
                        asset=None, discipline=None, tech=None, wo_type="corrective"):
            db.add(ServiceRequest(
                request_number=number, facility_id=facility.id,
                requester_id=nurse.id, problem_description=description,
                priority=priority, status=status,
                equipment_id=asset.id if asset else None,
                location_id=location.id if location else None,
                discipline_id=disciplines[discipline].id if discipline else None,
                assigned_technician_id=tech.id if tech else None,
                work_order_type=wo_type,
                service_required=description,
                requested_by_name=nurse.full_name,
            ))

        add_request(
            "WO-2026-1001",
            "Socket at head of bed on the anaesthesia side is dead in OR-2. "
            "Confirmed with a second device.",
            Priority.HIGH, ServiceRequestStatus.ASSIGNED, location=rooms["OR-2"], discipline="electrical",
            tech=tech_elec,
        )
        add_request(
            "WO-2026-1002",
            "AHU-2 supply fan bearing noise, rising over the last week.",
            Priority.CRITICAL, ServiceRequestStatus.IN_PROGRESS, location=rooms["MECH-B1"], asset=ahu2,
            discipline="mechanical", tech=tech_mech,
        )
        add_request(
            "WO-2026-1003",
            "OR-4 differential pressure reading negative to corridor.",
            Priority.CRITICAL, ServiceRequestStatus.IN_PROGRESS, location=rooms["OR-4"],
            discipline="mechanical", tech=tech_mech,
        )
        add_request(
            "WO-2026-1004",
            "Room 308 bathroom tap will not shut off fully.",
            Priority.MEDIUM, ServiceRequestStatus.NEW, location=rooms["308"], discipline="plumbing",
        )
        add_request(
            "WO-2026-1005",
            "Nurse call station in ICU-5 intermittently unresponsive.",
            Priority.HIGH, ServiceRequestStatus.NEW, location=rooms["ICU-5"], discipline="it_low_voltage",
        )
        add_request(
            "WO-2026-1006",
            "Quarterly ventilator preventive maintenance.",
            Priority.MEDIUM, ServiceRequestStatus.COMPLETED, location=rooms["ICU-3"],
            discipline="biomedical", tech=tech_bio, wo_type="preventive",
        )
        add_request(
            "WO-2026-1007",
            "ELEV-2 door reopens twice before closing on the third floor.",
            Priority.MEDIUM, ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR, location=main_bldg,
            discipline="vertical_transport",
        )

        db.commit()

        print("Seeded:")
        for label, model in (
            ("facilities", Facility), ("users", User), ("disciplines", Discipline),
            ("locations", Location), ("space statuses", SpaceStatus),
            ("vendors", Vendor), ("vendor contracts", VendorContract),
            ("vendor credentials", VendorCredential), ("equipment", Equipment),
            ("maintenance schedules", MaintenanceSchedule),
            ("compliance programmes", ComplianceProgram),
            ("compliance tasks", ComplianceTask), ("work permits", WorkPermit),
            ("permit approvals", PermitApproval),
            ("asset ledger entries", AssetLedgerEntry),
            ("service requests", ServiceRequest),
        ):
            print(f"  {db.query(model).count():4d}  {label}")
        print("\nSign in as  admin  /  Demo!2026   — change this immediately.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
