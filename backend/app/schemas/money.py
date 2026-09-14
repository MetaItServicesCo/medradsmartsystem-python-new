"""A purchase cost as the asset table stores it: dollars and cents, never negative.

Declared once, on the Decimal itself rather than on an Optional field. Pydantic
2.5 — the version the server runs — rejects `decimal_places` on an Optional
field and refuses to start the application; attached to the inner Decimal it
is accepted by every 2.x release.
"""
from decimal import Decimal
from typing import Annotated

from pydantic import Field

# The asset table's cost column is Numeric(10, 2).
Money = Annotated[Decimal, Field(ge=0, le=Decimal("99999999.99"), decimal_places=2)]
