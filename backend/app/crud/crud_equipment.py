from app.crud.base import CRUDBase
from app.models.equipment import Equipment
from app.schemas.equipment import EquipmentCreate, EquipmentUpdate


class CRUDEquipment(CRUDBase[Equipment, EquipmentCreate, EquipmentUpdate]):
    pass


equipment = CRUDEquipment(Equipment)
