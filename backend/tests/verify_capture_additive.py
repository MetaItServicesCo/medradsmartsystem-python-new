"""Prove the capture work changed nothing that existed before it.

Run on a machine with the git checkout:

    python backend/tests/verify_capture_additive.py

Not inside a container. It compares the working tree against history, and
the backend image holds neither the full repository nor git.

The brief was additive only, so this checks it rather than asserting it.
"Existing" means what was there before this feature began -- files this feature
introduced are its own to change, and saying otherwise would make the check
useless the moment the feature had two commits.
"""
import ast
import pathlib
import re
import subprocess

# The checkout this file lives in: backend/tests/ -> backend/ -> repo root.
# It was hard-coded to one machine, which meant it only ran there.
REPO = pathlib.Path(__file__).resolve().parents[2]

# The commit before any of the capture work. Everything reachable from here is
# what must not change.
BASELINE = '79f4e57~1'

# Files and tables this feature owns. Changing these is the feature; changing
# anything else is a regression.
OWNED_FILES = {
    'backend/app/api/v1/endpoints/inventory_capture.py',
    'backend/app/models/inventory_capture.py',
    'backend/app/models/part_definition.py',
    'backend/app/utils/part_vision.py',
    'backend/tests/test_part_vision.py',
    'backend/tests/test_capture_publish.py',
    'frontend/src/api/inventoryCapture.ts',
    'frontend/src/hooks/useCaptureCamera.ts',
    'frontend/src/pages/InventoryCapture/index.tsx',
    'backend/tests/verify_capture_additive.py',
}
OWNED_TABLES = {'inventory_captures', 'part_definitions'}
# Work done on the same branch that has nothing to do with captures. It
# shares a baseline with this feature and would otherwise be reported as a
# regression this feature caused, which would be a lie in both directions:
# it hides nothing and it blames the wrong change.
UNRELATED_FILES = {
    # Print Form in the inspections three-dots menu.
    'frontend/src/pages/Inspections/index.tsx',
    'frontend/src/utils/inspectionReportHtml.ts',
}
# Existing files this feature is allowed to touch, and only to add a line.
REGISTRATION_FILES = {
    'backend/app/api/v1/api.py',
    'backend/app/models/__init__.py',
    'frontend/src/App.tsx',
    # One button added beside Register Part. Checked line by line below,
    # because this is the only pre-existing screen the feature appears on.
    'frontend/src/pages/Inventory/index.tsx',
}


def run(*args):
    """Git output, decoded as UTF-8.

    Explicitly, because the default codepage on Windows mangles any
    non-ASCII character in the source and makes untouched lines look
    changed -- which it did, and sent me looking for a change that was
    never made.
    """
    result = subprocess.run(args, cwd=REPO, capture_output=True)
    return result.stdout.decode("utf-8", "replace")


def ok(name, passed, extra=''):
    print(('PASS' if passed else 'FAIL') + '  ' + name + ('  ' + extra if extra else ''))


if not (REPO / ".git").exists():
    print("Not a git checkout: {}".format(REPO))
    print("Run this on a machine with the repository, not inside a container.")
    raise SystemExit(2)

# 1. Everything this feature touched, committed and not.
touched = set()
for line in run('git', 'diff', '--name-only', BASELINE).splitlines():
    touched.add(line.strip())
for line in run('git', 'status', '--porcelain').splitlines():
    if line:
        touched.add(line[3:].strip())
touched = {t for t in touched if t}

new_files = {t for t in touched if not (REPO / t).exists() or t.startswith('backend/alembic/versions/')}
owned_prefixes = ('frontend/src/pages/InventoryCapture',)
touched = {t for t in touched if not (t.endswith('/') and t.rstrip('/').startswith(owned_prefixes))}
existing_touched = {
    t for t in touched - OWNED_FILES - REGISTRATION_FILES - new_files
            - UNRELATED_FILES
    if not t.startswith(owned_prefixes)
}

print('files touched since the feature began:')
for t in sorted(touched):
    kind = ('feature' if t in OWNED_FILES or t.startswith('backend/alembic/versions/')
            or t.startswith(owned_prefixes)
            else 'registration' if t in REGISTRATION_FILES
            else 'other work' if t in UNRELATED_FILES else 'PRE-EXISTING')
    print('   {:<14} {}'.format(kind, t))
print()

ok('no pre-existing file changed beyond registration',
   not existing_touched, str(existing_touched))

# 2. The registration files only gained lines -- with one exception,
#    where an existing import was extended rather than replaced.
INVENTORY_PAGE = 'frontend/src/pages/Inventory/index.tsx'
for path in sorted(REGISTRATION_FILES):
    diff = run('git', 'diff', BASELINE, '--unified=0', '--', path)
    removed = [l[1:] for l in diff.splitlines()
               if l.startswith('-') and not l.startswith('---')]
    if path != INVENTORY_PAGE:
        ok('{} loses nothing'.format(path.split('/')[-1]), not removed, str(removed))
        continue
    # The router import gains useNavigate; nothing else may go.
    ok('inventory page loses only the router import',
       len(removed) == 1 and 'react-router-dom' in removed[0],
       str([r.strip() for r in removed]))

# 3. No migration in this feature alters a table it does not own.
altering = {'add_column', 'drop_column', 'alter_column', 'drop_table',
            'drop_constraint', 'rename_table', 'create_foreign_key'}
offenders = set()
for name in ('i4f5a6b7c8d9_inventory_captures.py', 'j5a6b7c8d9e0_part_definitions.py'):
    src = (REPO / 'backend/alembic/versions' / name).read_text(encoding='utf-8')
    for node in ast.walk(ast.parse(src)):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr in altering and node.args):
            # create_foreign_key and drop_constraint name the constraint first
            # and the table second; everything else names the table first.
            index = 1 if node.func.attr in ('create_foreign_key', 'drop_constraint') else 0
            if len(node.args) <= index or not isinstance(node.args[index], ast.Constant):
                continue
            table = node.args[index].value
            if table not in OWNED_TABLES:
                offenders.add((name, node.func.attr, table))
ok('migrations alter only their own tables', not offenders, str(offenders))

# 4. Every route prefix that existed still exists.
api_now = (REPO / 'backend/app/api/v1/api.py').read_text(encoding='utf-8')
api_before = run('git', 'show', '{}:backend/app/api/v1/api.py'.format(BASELINE))
prefix = re.compile(r'prefix="([^"]+)"')
ok('no existing route prefix removed',
   set(prefix.findall(api_before)) <= set(prefix.findall(api_now)),
   str(set(prefix.findall(api_before)) - set(prefix.findall(api_now))))

# 5. Literal routes must precede parameterised ones, or they are unreachable.
caps = (REPO / 'backend/app/api/v1/endpoints/inventory_capture.py').read_text(encoding='utf-8')
routes = [(m.group(1), m.group(2)) for m in
          re.finditer(r'@router\.(get|post|patch|delete)\("([^"]*)"', caps)]
gets = [p for verb, p in routes if verb == 'get']
ok('GET /definitions is reachable',
   '/definitions' in gets and gets.index('/definitions') < gets.index('/{capture_id}'))


# 6. The screen this feature appears on must be otherwise exactly as it was.
page_before = run(
    'git', 'show', '{}:{}'.format(BASELINE, INVENTORY_PAGE)
).splitlines()
page_now = set(
    (REPO / INVENTORY_PAGE).read_text(encoding='utf-8').splitlines()
)
gone = [l for l in page_before if l.strip() and l not in page_now]
ok('Register Part and everything around it unchanged',
   len(gone) == 1 and 'react-router-dom' in gone[0],
   str([g.strip() for g in gone]))
ok('the existing button is still there',
   any('onClick={handleOpenNew}' in line for line in page_now))
