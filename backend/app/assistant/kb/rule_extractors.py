"""Business rules, taken from the code that enforces them.

The knowledge base knew the shape of the system -- tables, fields, allowed
values, endpoints, permissions, where things live on screen -- and none of the
rules the system actually runs on. Asked how much tax applies to shipping, the
assistant could name every column on a sales quotation and still had to answer
that no documentation covered it. The answer was in the code the whole time:

    SALES_TAX_RATE = Decimal("8.25")

    def _line_pricing(line):
        \"\"\"Products, Shipping & Packing, and Delivery & Setup are taxable.
        Labor is deliberately excluded...\"\"\"

Two things are extracted here, both deterministic and both from source rather
than from anyone's memory of it:

* module-level constants whose names read like business parameters -- rates,
  fees, limits, thresholds, windows -- with the comment that sits above them.
* docstrings of the functions that calculate money, because a docstring next to
  the arithmetic is the closest thing to a specification this codebase has, and
  it cannot drift from the behaviour without someone noticing.

Nothing is hand-written, so nothing goes stale silently: regenerate and the
documents follow whatever the code now says.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Iterable, Optional

from app.assistant.kb.documents import KBDocument


# Constants worth publishing. A name is a business parameter if it reads like
# one; everything else in these modules is plumbing.
_PARAMETER_NAME = re.compile(
    r"(?:^|_)(RATE|TAX|VAT|FEE|FEES|PERCENT|PCT|DISCOUNT|MARKUP|MARGIN|"
    r"LIMIT|MAX|MIN|THRESHOLD|WINDOW|DAYS|HOURS|MONTHS|YEARS|TERM|"
    r"EXPIRY|GRACE|DEFAULT|INTERVAL|QUOTA|CAP|"
    # Sets of allowed values are vocabulary the schema cannot supply: a column
    # typed as a plain string says nothing about which strings are meaningful,
    # so "trade_in" existed in Sales and nowhere the assistant could find it.
    r"KIND|KINDS|TYPE|TYPES|STATUS|STATUSES|STATES|VALUES|OPTIONS|CATEGORIES)(?:_|$)"
)

# Functions whose docstrings describe how money is worked out.
_CALCULATION_NAME = re.compile(
    r"(pricing|price|tax|total|subtotal|amount|charge|fee|billing|invoice|"
    r"proration|prorate|discount|balance|due|payable|calculat|comput)",
    re.IGNORECASE,
)

# Docstring wording that marks a real rule rather than a description of
# mechanics. A rule says what is or is not included, charged or excluded.
_RULE_WORDING = re.compile(
    r"\b(taxable|taxed|excluded|included|charged|applies|applied|"
    r"deliberately|never|always|must not|rounded|authoritative)\b",
    re.IGNORECASE,
)

# Values that are never business parameters however they are named.
_IGNORED_NAMES = frozenset({
    "DEFAULT_ENCODING", "MAX_RETRIES", "DEFAULT_TIMEOUT", "MIN_PASSWORD_LENGTH",
})

# Upload plumbing wears the same clothes as vocabulary -- a set of strings
# under a name like ALLOWED_IMAGE_TYPES -- but nobody asks the assistant which
# MIME types an avatar accepts, and four copies of the same list across four
# modules only makes the real rules harder to retrieve.
_NOISY_NAME = re.compile(r"(MIME|CONTENT_TYPE|IMAGE_TYPES?|FILE_TYPES?|EXTENSIONS?)")


def _is_noise(name: str, value: str) -> bool:
    if _NOISY_NAME.search(name):
        return True
    members = [part.strip() for part in value.split(",")]
    # Every member a MIME type: plumbing, whatever the constant is called.
    return len(members) > 1 and all("/" in member for member in members)

# Rules do not all live beside the endpoints that expose them. Rental tax is
# defined in a billing helper and imported, so scanning only the endpoint
# package found the sales rate and silently missed the rental one -- the kind
# of half-answer that is worse than none.
_SEARCH_PACKAGES = ("api/v1/endpoints", "utils")

_MODULE_BY_FILE = {
    "sales": "sales",
    "rental_billing": "rentals",
    "rental_billing_job": "rentals",
    "rental_extensions": "rentals",
    "invoice_numbers": "billing",
    "rentals": "rentals",
    "rental_portal": "rentals",
    "billing": "billing",
    "invoices": "billing",
    "payments": "billing",
    "service_requests": "service-requests",
    "inspections": "inspections",
    "inventory": "inventory",
    "hr": "hr",
    "facilities": "facilities",
    "users": "users",
}


def _module_for(path: Path) -> str:
    return _MODULE_BY_FILE.get(path.stem, "platform")


def _literal(node: ast.AST) -> Optional[str]:
    """A constant's value, when it is one a person could act on."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float, str, bool)):
        return str(node.value)
    # Decimal("8.25") and similar single-argument wrappers.
    if isinstance(node, ast.Call) and node.args:
        name = getattr(node.func, "id", "") or getattr(node.func, "attr", "")
        if name in ("Decimal", "float", "int") and isinstance(node.args[0], ast.Constant):
            return str(node.args[0].value)
        if name in ("frozenset", "set") and isinstance(node.args[0], (ast.Set, ast.List, ast.Tuple)):
            return _string_members(node.args[0])
    # A set of strings is almost always the allowed values for a column the
    # schema types only as text, which is the one thing the schema cannot say.
    if isinstance(node, (ast.Set, ast.List, ast.Tuple)):
        return _string_members(node)
    return None


def _string_members(node: ast.AST) -> Optional[str]:
    values = [
        element.value for element in getattr(node, "elts", [])
        if isinstance(element, ast.Constant) and isinstance(element.value, str)
    ]
    if not values or len(values) != len(getattr(node, "elts", [])):
        return None
    if len(values) > 24:            # a long list is data, not vocabulary
        return None
    return ", ".join(sorted(values))


def _leading_comment(lines: list[str], lineno: int) -> str:
    """The comment block immediately above a definition, which is usually why."""
    collected: list[str] = []
    index = lineno - 2  # lineno is 1-based and points at the definition itself
    while index >= 0:
        stripped = lines[index].strip()
        if not stripped.startswith("#"):
            break
        collected.append(stripped.lstrip("#").strip())
        index -= 1
    return " ".join(reversed(collected)).strip()


def _constants(tree: ast.Module, lines: list[str]) -> list[tuple[str, str, str]]:
    found: list[tuple[str, str, str]] = []
    for node in tree.body:                      # module level only
        targets: list[ast.expr] = []
        value: Optional[ast.AST] = None
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        for target in targets:
            name = getattr(target, "id", "")
            if not name or not name.isupper() or name in _IGNORED_NAMES:
                continue
            if not _PARAMETER_NAME.search(name):
                continue
            literal = _literal(value) if value is not None else None
            if literal is None:
                continue
            if _is_noise(name, literal):
                continue
            found.append((name, literal, _leading_comment(lines, node.lineno)))
    return found


def _rules(tree: ast.Module) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        doc = ast.get_docstring(node)
        if not doc:
            continue
        if not _CALCULATION_NAME.search(node.name):
            continue
        # A docstring that only says what the function returns is not a rule.
        if not _RULE_WORDING.search(doc):
            continue
        found.append((node.name, " ".join(doc.split())))
    return found


def rule_documents(backend_root: Path | str) -> list[KBDocument]:
    """One document per module that has rules worth stating."""
    base = Path(backend_root) / "app"
    sources: list[Path] = []
    for package in _SEARCH_PACKAGES:
        root = base.joinpath(*package.split("/"))
        if root.is_dir():
            sources.extend(sorted(root.glob("*.py")))
    if not sources:
        return []

    by_module: dict[str, dict[str, list]] = {}
    for path in sources:
        try:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source)
        except (OSError, SyntaxError):
            continue
        lines = source.splitlines()
        constants = _constants(tree, lines)
        rules = _rules(tree)
        if not constants and not rules:
            continue
        bucket = by_module.setdefault(_module_for(path), {"constants": [], "rules": [], "files": []})
        bucket["constants"].extend(constants)
        bucket["rules"].extend(rules)
        bucket["files"].append(path.name)

    documents: list[KBDocument] = []
    for module, bucket in sorted(by_module.items()):
        parts: list[str] = [
            "How {} figures are calculated, taken from the code that "
            "calculates them.".format(module.replace("-", " ")),
        ]
        if bucket["constants"]:
            parts.append("\nRates and limits in force:")
            for name, value, comment in bucket["constants"]:
                readable = name.replace("_", " ").lower()
                line = "- {} = {}".format(readable, value)
                if comment:
                    line += " ({})".format(comment)
                parts.append(line)
        if bucket["rules"]:
            parts.append("\nRules applied when calculating:")
            for name, doc in bucket["rules"]:
                parts.append("- {}: {}".format(name.lstrip("_").replace("_", " "), doc))

        documents.append(KBDocument(
            doc_id="rules:{}".format(module),
            kind="rule",
            module=module,
            title="How {} amounts are calculated".format(module.replace("-", " ")),
            body="\n".join(parts),
            source=", ".join(bucket["files"]),
            metadata={
                "constants": len(bucket["constants"]),
                "rules": len(bucket["rules"]),
            },
        ))
    return documents
