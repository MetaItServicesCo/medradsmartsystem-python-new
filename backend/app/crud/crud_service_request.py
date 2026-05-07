from app.crud.base import CRUDBase
from app.models.service_request import ServiceRequest
from app.schemas.service_request import ServiceRequestCreate, ServiceRequestUpdate


class CRUDServiceRequest(CRUDBase[ServiceRequest, ServiceRequestCreate, ServiceRequestUpdate]):
    pass


service_request = CRUDServiceRequest(ServiceRequest)
