"""Navigation knowledge extracted from the frontend source.

The backend-derived documents describe the API. A Super Admin asking "how do I
add a facility" wants the screen, not the endpoint, so these documents describe
the product the way it is actually used: sidebar entry, page heading, button
label, and the tabs of the form that opens.

Parsing is regex-based rather than a real TSX parse. That is deliberate: the
patterns matched here (the NAV_ITEMS table, headings, button text, tab labels)
are stable and highly structured, and a missing match degrades to a smaller
document rather than a wrong one.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Iterable, Optional

from app.assistant.kb.documents import KBDocument


# Directories whose screens the assistant should never describe.
EXCLUDED_PAGE_DIRS: frozenset[str] = frozenset({"Chat", "Login", "Landing", "Client"})

# Any button label, not only action verbs: the entry point is often a plain
# noun ("Facility Management") that opens a menu of actions.
# Props are matched with a bounded lazy '.' rather than a negated class:
# handlers contain '>' (onClick={() => ...}) and icon props contain '<'
# (endIcon={<ArrowDropDownIcon />}), so either negation truncates the match.
BUTTON_PATTERN = re.compile(
    r'<Button\b.{0,900}?>\s*([A-Z][A-Za-z0-9 /&\'-]{2,34}?)\s*</Button>', re.S
)

# MUI menu entries and list rows carry their label in `primary`, not as element
# text, so they are invisible to a ">text<" match.
MENU_ITEM_PATTERN = re.compile(r'primary="([A-Z][A-Za-z0-9 /&\'-]{2,40})"')

# The primary action on a screen is often labelled by a conditional rather than
# literal text — {tab === 1 ? 'New Invoice' : 'New Quotation'}. Both branches are
# labels a user really sees, so both are captured. Missing these hid the entry
# point for creating a sales invoice entirely.
CONDITIONAL_LABEL_PATTERN = re.compile(
    r'<Button\b.{0,900}?>\s*\{[^{}]{0,200}?\?\s*'
    r'[\'"]([A-Z][A-Za-z0-9 /&\'-]{1,34})[\'"]\s*:\s*'
    r'[\'"]([A-Z][A-Za-z0-9 /&\'-]{1,34})[\'"][^{}]{0,40}\}\s*</Button>',
    re.S,
)

# The same conditional usually keys off the active tab index, e.g.
# {tab === 1 ? 'New Invoice' : 'New Quotation'}. Capturing the index lets the
# label be tied to the section it appears on, which is the difference between a
# usable instruction and one that sends the reader to the wrong tab: opening
# Sales lands on Quotations, where the button does NOT say "New Invoice".
TAB_CONDITIONAL_PATTERN = re.compile(
    r'<Button\b.{0,900}?>\s*\{\s*\w*[Tt]ab\s*===?\s*(\d+)\s*\?\s*'
    r'[\'"]([A-Z][A-Za-z0-9 /&\'-]{1,34})[\'"]\s*:\s*'
    r'[\'"]([A-Z][A-Za-z0-9 /&\'-]{1,34})[\'"]\s*\}\s*</Button>',
    re.S,
)

# The ordered route list a tabbed page uses to map its tab index to a path.
ROUTE_TABS_PATTERN = re.compile(r'ROUTE_TABS\s*=\s*\[([^\]]{0,400})\]')

# A button immediately followed by a Menu is a dropdown: the button label is the
# entry point and the menu's items are the actions reached through it. Capturing
# that containment is what lets the assistant answer with a real click-path.
MENU_BLOCK_PATTERN = re.compile(
    r'<Button\b.{0,900}?>\s*([A-Z][A-Za-z0-9 /&\'-]{2,34}?)\s*</Button>'
    r'.{0,300}?<Menu\b(.*?)</Menu>',
    re.S,
)

NAV_ITEM_PATTERN = re.compile(
    r"text:\s*'([^']+)'"
    r"(?:[^}]*?description:\s*'([^']*)')?"
    r"[^}]*?path:\s*'([^']+)'"
    r"[^}]*?module:\s*'([^']+)'"
    r"(?:[^}]*?group:\s*'([^']*)')?",
    re.S,
)

SUBITEM_PATTERN = re.compile(r"\{\s*text:\s*'([^']+)',\s*path:\s*'([^']+)'\s*\}")

HEADING_PATTERN = re.compile(
    r'<Typography[^>]*variant="h[1-6]"[^>]*>\s*\n?\s*([A-Z][A-Za-z0-9 /&-]{3,40}?)\s*\n?\s*</Typography>'
)

TAB_LABEL_PATTERN = re.compile(r'<Tab\b[^>]*label="([^"]{2,40})"')

# Module each page directory belongs to.
# Some page directories host screens belonging to a different module, so a
# directory-level mapping alone attributes them wrongly: pages/Sales/Billing.tsx
# is the Billing screen, and its buttons must not be described as Sales.
PAGE_FILE_MODULE: dict[str, str] = {
    "Billing.tsx": "billing",
}

# Client-facing pages are a different audience entirely and must not be
# described as things a Super Admin does.
EXCLUDED_PAGE_FILES: frozenset[str] = frozenset({
    "ClientQuotation.tsx", "ClientRental.tsx", "PublicSalesPayment.tsx",
})

PAGE_DIR_MODULE: dict[str, str] = {
    "Facilities": "facilities",
    "ServiceRequests": "service-requests",
    "Inspections": "inspections",
    "Rentals": "rentals",
    "Sales": "sales",
    "Inventory": "inventory",
    "TestEquipment": "inspections",
    "Users": "users",
    "HR": "hr",
    "Attendance": "hr",
    "Reports": "reports",
    "Calendar": "platform",
    "Dashboard": "platform",
    "Billing": "billing",
}


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def parse_navigation(frontend_src: Path) -> list[dict[str, Any]]:
    """Read the sidebar NAV_ITEMS table."""
    source = _read(frontend_src / "components" / "Layout" / "Sidebar.tsx")
    if not source:
        return []

    items: list[dict[str, Any]] = []
    for match in NAV_ITEM_PATTERN.finditer(source):
        text, description, path, module, group = match.groups()
        # Sub-items belong to this entry only. The boundary is the next entry's
        # `module:` key, not its `text:` key: sub-items carry `text:` themselves,
        # so bounding on that truncated the tail before any sub-item was seen.
        tail = source[match.end():]
        boundary = re.search(r"\bmodule:\s*'", tail)
        if boundary:
            tail = tail[: boundary.start()]
        subitems = [
            {"text": sub_text, "path": sub_path}
            for sub_text, sub_path in SUBITEM_PATTERN.findall(tail)
        ]
        items.append({
            "text": text,
            "description": description or "",
            "path": path,
            "module": module,
            "group": group or "",
            "subitems": subitems,
        })
    return items


def parse_screens(frontend_src: Path) -> dict[str, dict[str, Any]]:
    """Collect headings, action buttons and form tabs per page directory."""
    pages_root = frontend_src / "pages"
    screens: dict[str, dict[str, Any]] = {}
    if not pages_root.is_dir():
        return screens

    for directory in sorted(p for p in pages_root.iterdir() if p.is_dir()):
        if directory.name in EXCLUDED_PAGE_DIRS:
            continue
        headings: list[str] = []
        buttons: list[str] = []
        items: list[str] = []
        tabs: list[str] = []
        tab_actions: list[dict[str, str]] = []
        menus: list[dict[str, Any]] = []
        for file in sorted(directory.rglob("*.tsx")):
            if file.name in EXCLUDED_PAGE_FILES:
                continue
            # A file mapped to another module is collected under that module
            # instead, so Billing screens are never described as Sales.
            override = PAGE_FILE_MODULE.get(file.name)
            if override:
                _collect_into(screens.setdefault("__file__" + file.name, _empty_screen()), _read(file))
                continue
            source = _read(file)
            if not source:
                continue
            headings.extend(h.strip() for h in HEADING_PATTERN.findall(source))
            buttons.extend(BUTTON_PATTERN.findall(source))
            for first, second in CONDITIONAL_LABEL_PATTERN.findall(source):
                buttons.extend([first, second])
            tab_actions.extend(_tab_bound_actions(source))
            items.extend(MENU_ITEM_PATTERN.findall(source))
            tabs.extend(TAB_LABEL_PATTERN.findall(source))
            for label, block in MENU_BLOCK_PATTERN.findall(source):
                entries = _unique(MENU_ITEM_PATTERN.findall(block))
                if entries:
                    menus.append({"opens": label.strip(), "items": entries[:12]})

        if headings or buttons or items or tabs:
            # Items already listed under a menu are not repeated standalone.
            in_menus = {entry for menu in menus for entry in menu["items"]}
            screens[directory.name] = {
                "tab_actions": tab_actions[:8],
                "headings": _unique(headings)[:8],
                "buttons": _unique(buttons)[:14],
                "items": [i for i in _unique(items) if i not in in_menus][:14],
                "menus": menus[:6],
                "tabs": _unique(tabs)[:12],
            }
    return screens


def _empty_screen() -> dict[str, Any]:
    return {
        "headings": [], "buttons": [], "items": [], "menus": [], "tabs": [],
        "tab_actions": [],
    }


def _tab_bound_actions(source: str) -> list[dict[str, str]]:
    """Pair a tab-conditional button label with the route of its tab.

    Returns entries like {"label": "New Invoice", "path": "/sales/invoices"}.
    Without the path the instruction is wrong in practice: the reader opens the
    module, lands on the default tab, and the button carries the other label.
    """
    routes_match = ROUTE_TABS_PATTERN.search(source)
    if not routes_match:
        return []
    routes = re.findall(r"'([^']+)'", routes_match.group(1))
    actions: list[dict[str, str]] = []
    for index, when_true, when_false in TAB_CONDITIONAL_PATTERN.findall(source):
        position = int(index)
        if position < len(routes):
            actions.append({"label": when_true, "path": routes[position]})
        # The else branch belongs to the default tab, which is the first route.
        if routes:
            actions.append({"label": when_false, "path": routes[0]})
    return actions


def _collect_into(bucket: dict[str, Any], source: str) -> None:
    """Scan one file's controls into an existing bucket."""
    if not source:
        return
    bucket["headings"].extend(h.strip() for h in HEADING_PATTERN.findall(source))
    bucket["buttons"].extend(BUTTON_PATTERN.findall(source))
    for first, second in CONDITIONAL_LABEL_PATTERN.findall(source):
        bucket["buttons"].extend([first, second])
    bucket["items"].extend(MENU_ITEM_PATTERN.findall(source))
    bucket["tab_actions"].extend(_tab_bound_actions(source))
    bucket["tabs"].extend(TAB_LABEL_PATTERN.findall(source))
    for label, block in MENU_BLOCK_PATTERN.findall(source):
        entries = _unique(MENU_ITEM_PATTERN.findall(block))
        if entries:
            bucket["menus"].append({"opens": label.strip(), "items": entries[:12]})


def _unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        cleaned = " ".join(value.split())
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def howto_documents(frontend_src: Path) -> list[KBDocument]:
    """One navigation document per module, written in the words of the UI."""
    navigation = parse_navigation(frontend_src)
    screens = parse_screens(frontend_src)
    if not navigation and not screens:
        return []

    nav_by_module: dict[str, dict[str, Any]] = {}
    for item in navigation:
        nav_by_module.setdefault(item["module"], item)

    screens_by_module: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for name, data in screens.items():
        if name.startswith("__file__"):
            module = PAGE_FILE_MODULE.get(name[len("__file__"):])
        else:
            module = PAGE_DIR_MODULE.get(name)
        if module:
            screens_by_module.setdefault(module, []).append((name, data))

    documents: list[KBDocument] = []
    for module in sorted(set(nav_by_module) | set(screens_by_module)):
        nav = nav_by_module.get(module)
        entries = screens_by_module.get(module, [])
        if not nav and not entries:
            continue

        lines: list[str] = ["## Where to find it"]
        if nav:
            trail = "{}{}".format(
                "{} > ".format(nav["group"]) if nav["group"] else "",
                nav["text"],
            )
            lines.append(
                "In the left sidebar, open **{}** ({}). {}".format(
                    trail, nav["path"], nav["description"]
                ).strip()
            )
            if nav["subitems"]:
                lines.append("")
                lines.append("Sections inside it:")
                lines.extend(
                    "- **{}** ({})".format(sub["text"], sub["path"])
                    for sub in nav["subitems"]
                )
        else:
            lines.append("Opened from within its parent module.")

        menus = [m for _name, data in entries for m in data["menus"]]
        buttons = _unique([b for _name, data in entries for b in data["buttons"]])
        items = _unique([i for _name, data in entries for i in data["items"]])
        tabs = _unique([t for _name, data in entries for t in data["tabs"]])
        entry_label = nav["text"] if nav else module

        headings = _unique([h for _name, data in entries for h in data["headings"]])
        if headings:
            lines += ["", "## What this screen is called",
                      "On screen it is titled: "
                      + ", ".join('"{}"'.format(h) for h in headings[:6]) + "."]

        if menus:
            lines += ["", "## Step by step"]
            for menu in menus:
                for action in menu["items"]:
                    lines.append(
                        '- **{}**: open **{}**, click **"{}"**, then click **"{}"**.'.format(
                            action, entry_label, menu["opens"], action
                        )
                    )

        standalone = [b for b in buttons if b not in {m["opens"] for m in menus}]

        # Creation actions are what "how do I add/create X" is asking for, so
        # they lead rather than sitting in an undifferentiated button list.
        primary = [
            b for b in standalone
            if re.match(r"^(New|Create|Add|Generate|Schedule|Record|Import) ", b + " ")
        ]
        # A label bound to a tab needs that tab named: the reader otherwise
        # opens the module, lands on the default section, and cannot find the
        # button because it is labelled for a different one.
        tab_actions = [a for _name, data in entries for a in data.get("tab_actions", [])]
        section_by_path = {
            sub["path"]: sub["text"] for sub in (nav["subitems"] if nav else [])
        }
        sectioned: dict[str, str] = {}
        for action in tab_actions:
            section = section_by_path.get(action["path"])
            if section:
                sectioned[action["label"]] = section

        if primary:
            lines += ["", "## Main actions"]
            for label in primary[:10]:
                section = sectioned.get(label)
                if section:
                    lines.append(
                        '- **{}** - open **{}**, select the **{}** section, then '
                        'click **"{}"**.'.format(label, entry_label, section, label)
                    )
                else:
                    lines.append(
                        '- **{}** - open **{}**, then click **"{}"**.'.format(
                            label, entry_label, label
                        )
                    )
            if sectioned:
                lines.append(
                    "This screen's main button is labelled for the section in "
                    "view, so the section must be selected first."
                )

        rest = [b for b in standalone if b not in primary]
        if rest or items:
            lines += ["", "## Other buttons on this screen"]
            lines += ['- **"{}"**'.format(label) for label in (rest + items)[:18]]

        if tabs:
            lines += [
                "",
                "## Form sections",
                "The form is organised into these tabs: "
                + ", ".join('"{}"'.format(t) for t in tabs)
                + ". Complete the required fields on each.",
            ]

        lines += [
            "",
            "## Note",
            "These are the on-screen steps. Field-by-field requirements are in "
            "the operations document for this module.",
        ]

        title = "How to use {} in the app".format(
            nav["text"] if nav else module.replace("-", " ").title()
        )
        documents.append(KBDocument(
            doc_id="howto." + module,
            kind="howto",
            module=module,
            title=title,
            body="\n".join(lines),
            source="frontend navigation and screen labels",
            metadata={
                "module": module,
                "path": nav["path"] if nav else None,
                "action_count": sum(len(m["items"]) for m in menus) + len(buttons),
            },
        ))
    return documents


def resolve_frontend_src(explicit: Optional[str] = None) -> Optional[Path]:
    """Locate the frontend source, tolerating both container and repo layouts."""
    candidates = [
        Path(explicit) if explicit else None,
        Path("/frontend-src"),
        Path(__file__).resolve().parents[4] / "frontend" / "src",
        Path.cwd().parent / "frontend" / "src",
    ]
    for candidate in candidates:
        if candidate and (candidate / "components" / "Layout" / "Sidebar.tsx").exists():
            return candidate
    return None
