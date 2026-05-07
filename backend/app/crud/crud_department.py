from app.crud.base import CRUDBase
from app.models.department import Department
from app.schemas.department import DepartmentCreate, DepartmentUpdate


class CRUDDepartment(CRUDBase[Department, DepartmentCreate, DepartmentUpdate]):
    pass


department = CRUDDepartment(Department)
