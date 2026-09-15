"""Written guides for screens the generated how-to documents cannot describe well.

The how-to extractor reads navigation and button labels out of the frontend
source. The site categories and Equipment Maintenance screens are reached from
a site bar and built from lists, so the extractor sees little of them; these
guides say, in the words on the screen, how they are used.

Keep them in step with pages/Categories and pages/EquipmentMaintenance.
"""
from __future__ import annotations

from app.assistant.kb.documents import KBDocument

_SOURCE = "written guide: site categories and equipment maintenance"

_GUIDES: tuple[tuple[str, str, str, str], ...] = (
    (
        "guide.site_categories",
        "facility-inventory",
        "How to add equipment to a category and record where it is",
        """Every site files its equipment under four categories: Electrical, Plumbing, Mechanical and HVAC.

## Where to find it
Open the site from Sites. The bar under the page title shows the site's name, Categories, Equipment Maintenance and Compliance. Open Categories and choose Electrical, Plumbing, Mechanical or HVAC. The site's own page also shows a tile for each category with how many items it has and how many need attention.

## Add equipment
1. Open the category, for example Categories > Electrical.
2. Press Add equipment.
3. Fill in Name (for example Generator 1) and Type. Type offers a list for the category - Generator, Transformer, Main switchboard, Distribution board, UPS, Transfer switch, Lighting, Earthing for Electrical - and you can type your own.
4. Under Where is it?, fill in Building (required), Floor and Room / exact spot, for example Main block, Basement, Plant room 2 north wall. Places already used at the site are suggested as you type, so the same building is spelled the same way.
5. Set Quantity and Status: Working, Needs attention or Out of service. Make, Model and Notes are optional.
6. Press Add equipment. It is given the site's next asset tag automatically.

## Change or remove equipment
Click the row to open it, change anything and press Save. Category can be changed there to move equipment put in the wrong category. Remove deletes equipment entered by mistake; equipment that already has service or inspection jobs cannot be removed - set its Status to Out of service instead, so its history stays.

## Find equipment
Each category list can be searched by name, type, tag or place, and filtered by Building, Floor and Status. The list shows where each item is, how many there are, its status, when its next service is due and how many jobs are open on it.

## Categories used
- Electrical: generators, transformers, switchboards, distribution boards, UPS, transfer switches, lighting, earthing.
- Plumbing: water tanks, water pumps, water heaters, RO and filtration plants, drainage and sewage, taps and sanitary fittings.
- Mechanical: lifts, boilers, air compressors, vacuum pumps, medical gas manifolds, fire pumps.
- HVAC: chillers, air handling units, fan coil units, split and package AC, cooling towers, exhaust fans.""",
    ),
    (
        "guide.equipment_maintenance",
        "service-requests",
        "How to raise and update a service or inspection job on equipment",
        """Equipment Maintenance holds the service and inspection jobs done on a site's category equipment. Both are work orders, so they also appear in the full work order list.

## Where to find it
Open the site, then Equipment Maintenance in the bar under the page title, and choose Service or Inspection. The site's page shows how many of each are open, overdue and, for inspections, failed.

## Raise a job
1. Open Equipment Maintenance > Service (or Inspection).
2. Press New service (or New inspection).
3. Choose the Category, then the Equipment in it. Where the equipment is shows underneath, so nobody has to type it again.
4. Fill in What needs doing, the Due date and who it is Assigned to. The person assigned is notified.
5. Leave Status as Open, or set In progress or Done.
6. Press Raise service (or Raise inspection).

## Update a job
Click the job in the list. Change the Status between Open, In progress and Done, add Notes, and press Save. For an inspection, also record the Result - Pass or Fail - and the Findings.
A technician can update the status, notes, result and findings of jobs assigned to them; changing what needs doing, the equipment, the due date or who it is assigned to is for managers and admins.

## Find jobs
The chips at the top filter the list: All, Open, In progress, Done and Overdue, each with its count. A job is overdue when its due date has passed and it is not done. The list can also be searched and filtered by Category. It is ordered soonest due first.

## Remove a job
A job raised by mistake can be removed from the job itself by an admin. A job that is Done cannot be removed: it is part of the equipment's record.""",
    ),
)


def guide_documents() -> list[KBDocument]:
    return [
        KBDocument(doc_id=doc_id, kind="howto", module=module, title=title, body=body.strip(), source=_SOURCE,
                   metadata={"module": module, "written": True})
        for doc_id, module, title, body in _GUIDES
    ]
