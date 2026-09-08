"""Which tables can the assistant actually reach, and which matter.

Every recent complaint has had the same shape: the assistant could not see
something. Tax rules it had never been told, allowed values that lived in a set
constant, and finally an entire entity -- service quotes -- that no tool
touched, which it reported as not existing. Those were found one question at a
time, by someone hitting them.

This finds the rest in one pass. It reads which model classes each tool
actually mentions, compares that against every table in scope, and counts the
rows in what is left over, because an unreachable table holding eight thousand
rows is a different problem from an empty one.

    docker compose exec backend python -m scripts.tool_coverage

Reads only: it runs COUNT(*) and nothing else.
"""
from __future__ import annotations

import ast
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import func, select

from app.assistant.kb.extractors import in_scope, load_all_mappers, module_for
from app.assistant.tools.registry import TOOLS
from app.db.base import SessionLocal


TOOLS_DIR = Path(__file__).resolve().parents[1] / "app" / "assistant" / "tools"


def _models_used_by_function() -> dict[str, set[str]]:
    """Model class names mentioned inside each tool function.

    Static rather than executed: a tool is reached only through its handler, and
    what that handler queries is visible in the source without a database, a
    request, or any risk of running it.
    """
    used: dict[str, set[str]] = defaultdict(set)
    for path in sorted(TOOLS_DIR.glob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (OSError, SyntaxError):
            continue

        # Only names imported from app.models count as models; everything else
        # a function mentions is helpers and locals.
        model_names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("app.models"):
                model_names.update(alias.asname or alias.name for alias in node.names)

        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for inner in ast.walk(node):
                if isinstance(inner, ast.Name) and inner.id in model_names:
                    used[node.name].add(inner.id)
                elif isinstance(inner, ast.Attribute):
                    root = inner
                    while isinstance(root, ast.Attribute):
                        root = root.value
                    if isinstance(root, ast.Name) and root.id in model_names:
                        used[node.name].add(root.id)
    return used


def _row_counts(mappers: list[Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    db = SessionLocal()
    try:
        for mapper in mappers:
            table = mapper.class_.__table__
            try:
                counts[table.name] = int(
                    db.execute(select(func.count()).select_from(table)).scalar() or 0
                )
            except Exception:
                counts[table.name] = -1        # unreadable, not empty
    finally:
        db.close()
    return counts


def main() -> int:
    mappers = [m for m in load_all_mappers() if in_scope(m)]
    by_class = {m.class_.__name__: m for m in mappers}
    used_by_function = _models_used_by_function()

    # Which model classes any tool mentions, and through which tool.
    reached: dict[str, list[str]] = defaultdict(list)
    for tool in TOOLS:
        for class_name in used_by_function.get(tool.handler.__name__, set()):
            reached[class_name].append(tool.name)

    counts = _row_counts(mappers)

    covered, uncovered = [], []
    for mapper in mappers:
        name = mapper.class_.__name__
        entry = (module_for(mapper), mapper.class_.__table__.name, name, counts.get(mapper.class_.__table__.name, 0))
        (covered if name in reached else uncovered).append(entry)

    print("Assistant table coverage")
    print("=" * 74)
    print("{} tables in scope, {} reachable by a tool, {} not".format(
        len(mappers), len(covered), len(uncovered)))
    print("{} tools registered".format(len(TOOLS)))
    print()

    populated = sorted(
        [e for e in uncovered if e[3] > 0], key=lambda e: e[3], reverse=True
    )
    empty = [e for e in uncovered if e[3] == 0]

    if populated:
        print("Unreachable and holding data -- ranked by how much:")
        print("-" * 74)
        current = None
        for module, table, class_name, rows in populated:
            if module != current:
                print("\n  [{}]".format(module))
                current = module
            print("    {:>9,}  {}".format(rows, table))
        print()

    if empty:
        print("Unreachable but empty ({} tables) -- no one can ask about "
              "data that is not there yet:".format(len(empty)))
        print("    " + ", ".join(sorted(e[1] for e in empty)))
        print()

    print("-" * 74)
    print("Reachable tables and the tools that reach them:")
    for module, table, class_name, rows in sorted(covered):
        print("  {:<34} {:>9,}  {}".format(
            table, rows, ", ".join(sorted(set(reached[class_name])))))

    print()
    print("=" * 74)
    if populated:
        top = populated[0]
        print("Largest gap: {} ({:,} rows, {} module)".format(top[1], top[3], top[0]))
        print("A question about it today gets answered from whatever tool the")
        print("model reaches for instead, which is how a paid service quote came")
        print("back as 'no service quote on record'.")
    else:
        print("Every table holding data is reachable by some tool.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
