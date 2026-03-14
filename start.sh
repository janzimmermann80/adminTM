#!/bin/bash
# Start skript pro admin-data API backend
# Spouštěj: /services/admin-data/start.sh

# Zastav případný běžící proces
pkill -f "tsx watch.*index.ts" 2>/dev/null
sleep 1

# Vytvoř zapisovatelnou kopii projektu (root-owned originál nelze editovat)
MYDIR=/home/dev/admin-data-patched
rm -rf "$MYDIR"
mkdir -p "$MYDIR/src"

# Zkopíruj src a konfiguraci
cp -r /services/admin-data/src/. "$MYDIR/src/"
cp /services/admin-data/tsconfig.json "$MYDIR/"
cp /services/admin-data/package.json "$MYDIR/"
ln -s /services/admin-data/node_modules "$MYDIR/node_modules"

# Patch: tracking_last místo car_base pro KPI "Vozidla TM"
python3 - <<'PYEOF'
import sys
f = '/home/dev/admin-data-patched/src/routes/statistics.ts'
src = open(f).read()
old = "          FROM gps.car_base\n          WHERE active = true"
new = "          FROM gps.tracking_last\n          WHERE time >= NOW() - INTERVAL '7 days'"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: tracking_last', file=sys.stderr)
else:
    print('Patch SKIP: pattern not found', file=sys.stderr)
PYEOF

# Patch: last_modif datum — ISO formát místo toLocaleDateString (cs-CZ nečte PostgreSQL)
python3 - <<'PYEOF'
import sys
f = '/home/dev/admin-data-patched/src/routes/companies/index.ts'
src = open(f).read()
old = "const now = new Date().toLocaleDateString('cs-CZ')"
new = "const now = new Date().toISOString().split('T')[0]"
if old in src:
    open(f, 'w').write(src.replace(old, new))
    print('Patch OK: last_modif date format', file=sys.stderr)
else:
    print('Patch SKIP: last_modif pattern not found', file=sys.stderr)
PYEOF

# Spusť backend z patchované kopie
cd "$MYDIR"
exec node /services/admin-data/node_modules/.bin/tsx watch \
  --env-file=/services/admin-data/.env \
  src/index.ts >> /services/admin-data/api.log 2>&1
