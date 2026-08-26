/**
 * Per-import_type očekávané chování GPS importů.
 *
 * Zdroj hodnot: analýza *Settings.java + *DownloadStatus.java v TruckManageru.
 * Silent = 3–4× cadence (heuristika); gone_days = 7 (odpovídá QUERY_ALL_CARS
 * filtru v Import.java, který auta starší 7 dní stejně nepustí do plánování).
 *
 * Známé výhrady (viz gps-imports.md):
 *   - DKVLI: DKV posílá jen za jízdy; klidové noci ~11 h => silent posunut na 720 min.
 *   - DOZOR: per-car interval v import_car.settings.interval_min; zde držíme
 *     globální default 10 min, per-car override neřešíme.
 *   - Víkendy/svátky: neřešíme (potenciální false positives na klidových vozech).
 *   - DKVCO: netahá GPS, jen náklady ~1× denně. no_gps=true → status hodnotí
 *     jen podle last_import_time se 48 h prahem.
 */

export type ImportTypeConfig = {
  cadence_min: number
  silent_min: number
  gone_days: number
  no_gps?: boolean
}

export const IMPORT_TYPE_CONFIG: Record<string, ImportTypeConfig> = {
  WDISP:   { cadence_min: 3,  silent_min: 20,  gone_days: 7 },
  ONISY:   { cadence_min: 3,  silent_min: 20,  gone_days: 7 },
  TCARS:   { cadence_min: 3,  silent_min: 20,  gone_days: 7 },
  EWTLM:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  DKVLI:   { cadence_min: 5,  silent_min: 720, gone_days: 7 }, // 12h kvůli DKV klidu
  DKVTR:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  VOLVO:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  RENLT:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  SCANI:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  'DAF--': { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  WEBFL:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  ORBTR:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  PSTRX:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  CMDSK:   { cadence_min: 5,  silent_min: 30,  gone_days: 7 },
  MBENZ:   { cadence_min: 10, silent_min: 45,  gone_days: 7 },
  DOZOR:   { cadence_min: 10, silent_min: 45,  gone_days: 7 },
  LOGIS:   { cadence_min: 15, silent_min: 60,  gone_days: 7 },
  DKVCO:   { cadence_min: 1440, silent_min: 2880, gone_days: 7, no_gps: true },
}

// Fallback pro neznámé typy — nechceme, aby nový import spadl na crash.
export const DEFAULT_IMPORT_CONFIG: ImportTypeConfig = {
  cadence_min: 5,
  silent_min: 30,
  gone_days: 7,
}

export function getImportConfig(importType: string): ImportTypeConfig {
  return IMPORT_TYPE_CONFIG[importType] ?? DEFAULT_IMPORT_CONFIG
}

// Připravená pole pro unnest(...) v SQL — pro batch join všech typů.
const _types = Object.keys(IMPORT_TYPE_CONFIG)
export const CONFIG_ARRAYS = {
  types:       _types,
  cadence_min: _types.map(t => IMPORT_TYPE_CONFIG[t].cadence_min),
  silent_min:  _types.map(t => IMPORT_TYPE_CONFIG[t].silent_min),
  gone_days:   _types.map(t => IMPORT_TYPE_CONFIG[t].gone_days),
  no_gps:      _types.map(t => IMPORT_TYPE_CONFIG[t].no_gps === true),
}
