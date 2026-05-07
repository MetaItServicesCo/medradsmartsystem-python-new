from app.crud.base import CRUDBase
from app.models.facility_document import FacilityDocument
from app.schemas.facility_document import FacilityDocumentCreate


class CRUDFacilityDocument(CRUDBase[FacilityDocument, FacilityDocumentCreate, FacilityDocumentCreate]):
    pass


facility_document = CRUDFacilityDocument(FacilityDocument)
