# Konvence projektu — TruckManager Admin UI

## Zapisovatelné složky
Zapisovat lze POUZE do:
- `/services/admin-data/`
- `/services/admin-www/`

Nikdy nepsat do `/home/dev/` (výjimka: `/home/dev/.claude/` pro paměť Claude).

## Build & deploy
Po každé změně frontendu:
```bash
cd /services/admin-data/ui && VITE_API_BASE='/proxy.php' npx vite build --base=/new/ && cp -r dist/* /services/admin-www/new/
```

## Zdrojové kódy
- Frontend: `/services/admin-data/ui/src/`
- Backend src jsou root-owned (`/services/admin-data/src/`) — nelze editovat přímo
- Backend změny přes Python patche v `/services/admin-data/start.sh`

## Ikony
Výhradně **inline SVG** — žádné npm icon knihovny (heroicons, lucide, atd.):
```tsx
<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="..." />
</svg>
```

## Formátování dat

### Datum
Používat `formatDate()` z `utils.ts` — výstup: `DD.MM.YYYY`
```tsx
import { formatDate } from '../../utils'
formatDate(company.contract_date)  // → "15.03.2026"
```

### Částky / čísla
Používat `formatNumber()` a `formatCurrency()` z `utils.ts`:
- Oddělovač tisíců: nezlomitelná mezera (`\u00a0`)
- Desetinná tečka: `.`
- Měna za číslem: `1 234.50 CZK`
```tsx
import { formatNumber, formatCurrency } from '../../utils'
formatNumber(1234.5)          // → "1 234.50"
formatCurrency(1234.5)        // → "1 234.50 CZK"
formatCurrency(1234.5, 'EUR') // → "1 234.50 EUR"
```

## UI stack
- React + Vite + Tailwind CSS
- Barvy sidebaru: bg `#0a6b6b`, hover `#0d8080`
- Teal akcenty: `teal-500`, `teal-600`, `teal-700`
