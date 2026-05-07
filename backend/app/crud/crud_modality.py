from app.crud.base import CRUDBase
from app.models.modality import Modality
from app.schemas.modality import ModalityCreate, ModalityUpdate


class CRUDModality(CRUDBase[Modality, ModalityCreate, ModalityUpdate]):
    pass


modality = CRUDModality(Modality)
