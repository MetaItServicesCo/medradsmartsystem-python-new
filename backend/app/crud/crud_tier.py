from app.crud.base import CRUDBase
from app.models.tier import Tier
from app.schemas.tier import TierCreate, TierUpdate

class CRUDTier(CRUDBase[Tier, TierCreate, TierUpdate]):
    pass

tier = CRUDTier(Tier)
