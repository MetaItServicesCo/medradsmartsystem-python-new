import ast
from collections import Counter
from pathlib import Path
from typing import Any


VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _module_constant(path: Path, name: str) -> Any:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        target = None
        value = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            value = node.value
        elif isinstance(node, ast.AnnAssign):
            target = node.target
            value = node.value
        if isinstance(target, ast.Name) and target.id == name and value is not None:
            return ast.literal_eval(value)
    raise AssertionError(f"{path.name} does not declare {name}")


def _migration_graph() -> tuple[dict[str, Path], list[str]]:
    revisions: dict[str, Path] = {}
    parents: list[str] = []
    discovered: list[tuple[str, Path]] = []
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        revision = _module_constant(path, "revision")
        discovered.append((revision, path))
        down_revision = _module_constant(path, "down_revision")
        if isinstance(down_revision, str):
            parents.append(down_revision)
        elif down_revision:
            parents.extend(down_revision)

    duplicates = {
        revision: [path.name for found_revision, path in discovered if found_revision == revision]
        for revision, count in Counter(revision for revision, _path in discovered).items()
        if count > 1
    }
    assert not duplicates, f"Duplicate Alembic revision IDs: {duplicates}"
    revisions.update(discovered)
    return revisions, parents


def test_alembic_migrations_have_one_complete_revision_chain() -> None:
    revisions, parents = _migration_graph()
    missing = sorted(set(parents) - set(revisions))
    heads = sorted(set(revisions) - set(parents))

    assert not missing, f"Alembic migrations reference missing parents: {missing}"
    assert len(heads) == 1, f"Expected one Alembic head, found: {heads}"
