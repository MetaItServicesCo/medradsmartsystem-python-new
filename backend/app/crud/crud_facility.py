from app.crud.base import CRUDBase
from app.models.facility import Facility
from app.schemas.facility import FacilityCreate, FacilityUpdate

class CRUDFacility(CRUDBase[Facility, FacilityCreate, FacilityUpdate]):
    # Add any facility specific methods here
    pass

facility = CRUDFacility(Facility)
