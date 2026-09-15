"""Written guides for screens the generated how-to documents cannot describe well.

The how-to extractor reads navigation and button labels out of the frontend
source. The Facility and Equipment Maintenance screens are reached
from a site bar and built from lists, so the extractor sees little of them;
these guides say, in the words on the screen, how they are used.

Keep them in step with pages/Categories and pages/EquipmentMaintenance.
"""
from __future__ import annotations

from app.assistant.kb.documents import KBDocument

_SOURCE = "written guide: facility categories and equipment maintenance"

_GUIDES: tuple[tuple[str, str, str, str], ...] = (
    (
        "guide.site_categories",
        "facility-inventory",
        "How to add equipment under Facility, with where it is and what it cost",
        """Under Facility, every site files its equipment in four categories: Electrical, Plumbing, Mechanical and HVAC.

## Where to find it
Open the site from Sites. The bar under the page title shows the site's name, Facility, Equipment Maintenance and Compliance. Open Facility and choose Electrical, Plumbing, Mechanical or HVAC. The site's own page also shows a tile for each category with how many items it has, their total book value and how many need attention. The Back arrow left of the page title returns to the previous screen.

## Add equipment
1. Open the category, for example Facility > Electrical.
2. Press Add equipment.
3. Fill in Name (for example Generator 1) and Type. Type offers a list for the category - Generator, Transformer, Main switchboard, Distribution board, UPS, Transfer switch, Lighting, Earthing for Electrical - and you can type your own.
4. Under Where is it?, fill in Building (required), Floor and Room / exact spot, for example Main block, Basement, Plant room 2 north wall. Places already used at the site are suggested as you type.
5. Set Quantity and Status: Working, Needs attention or Out of service. Make and Model are optional.
6. Under Cost & value, enter the Purchase cost (the Cost of one item when the quantity is more than one - the total is worked out), In service since, and Useful life. Useful life is filled in from the category: 20 years for Electrical, Plumbing and Mechanical, 15 years for HVAC.
7. The form shows the Book value today and how much it Depreciates a year as you type.
8. Press Add equipment. It is given the site's next asset tag automatically.

## How value and depreciation work
Book value is straight-line depreciation from the in-service date over the useful life, the same calculation as Assets & Value. With a cost of $45,000 and a 20-year life it depreciates $2,250 a year and is worth $38,250 after three years. Equipment without a cost or an in-service date shows no book value.
Routine service and inspection costs are maintenance spend: they do not change the book value. A service marked Major work that extends its life adds its cost to the value, which then depreciates over the remaining life. Cost of ownership is the purchase cost plus major work plus maintenance spend. When maintenance spend reaches 50% of the purchase cost, the equipment shows a warning to consider replacing it.

## Change or remove equipment
Click the row to open it, change anything and press Save. When editing, the form also shows Maintenance spend and Cost of ownership, and View asset & value history opens the same record in the Asset Register. Category can be changed to move equipment put in the wrong category. Remove deletes equipment entered by mistake; equipment that already has service or inspection jobs cannot be removed - set its Status to Out of service instead.

## Find equipment
Each category list can be searched by name, type, tag or place, and filtered by Building, Floor and Status. The list shows where each item is, how many there are, its status, its Book value, when its next service is due and how many jobs are open on it.

## Assets already in the Asset Register
Equipment under Facility is the same record as in the Asset Register, which shows it by name, category and place. An older asset that is not in a category has an Add to a category button in the Asset Register: choose the category, give it a name and type, and say where it is. It keeps its tag, cost and history.

## Categories used
- Electrical: generators, transformers, switchboards, distribution boards, UPS, transfer switches, lighting, earthing.
- Plumbing: water tanks, water pumps, water heaters, RO and filtration plants, drainage and sewage, taps and sanitary fittings.
- Mechanical: lifts, boilers, air compressors, vacuum pumps, medical gas manifolds, fire pumps.
- HVAC: chillers, air handling units, fan coil units, split and package AC, cooling towers, exhaust fans.""",
    ),
    (
        "guide.equipment_maintenance",
        "service-requests",
        "How to raise and update a service or inspection job on equipment, and record its cost",
        """Equipment Maintenance holds Service, Inspection, Maintenance Plans and Permits to Work for a site. Service and inspection jobs are work orders on the site's Facility equipment.

## Where to find it
Open the site, then Equipment Maintenance in the bar under the page title, and choose Service, Inspection, Maintenance Plans or Permits to Work. The site's page shows how many services and inspections are open, overdue and failed, how many maintenance plans are overdue or due in 30 days, and how many permits are in force or awaiting approval.

## Raise a job
1. Open Equipment Maintenance > Service (or Inspection).
2. Press New service (or New inspection).
3. Choose the Category, then the Equipment in it. Where the equipment is shows underneath.
4. Fill in What needs doing, the Due date and who it is Assigned to. The person assigned is notified.
5. Leave Status as Open, or set In progress or Done.
6. Press Raise service (or Raise inspection).

## Record what it cost
Under Cost, enter Labour and Parts; the Total is shown. The cost counts as maintenance spend once the job is Done and does not change the equipment's book value.
For a service that is a major overhaul or upgrade, tick Major work that extends its life. When the job is Done its cost is added to the equipment's value in the asset ledger and depreciated over the remaining life. Unticking it, reopening the job or changing the cost corrects the ledger by reversing the earlier entry. Only managers and admins can mark major work.

## Update a job
Click the job in the list. Change the Status between Open, In progress and Done, record Labour and Parts, add Notes, and press Save. For an inspection, also record the Result - Pass or Fail - and the Findings.
A technician can update the status, costs, notes, result and findings of jobs assigned to them; changing what needs doing, the equipment, the due date, who it is assigned to or whether it is major work is for managers and admins.

## Find jobs
The chips at the top filter the list: All, Open, In progress, Done and Overdue, each with its count. A job is overdue when its due date has passed and it is not done. The list can also be searched and filtered by Category, and jobs marked Major work say so.

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
