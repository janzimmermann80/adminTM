import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getUserSql } from '../db/userSql.js'
import { CONFIG_ARRAYS, DEFAULT_IMPORT_CONFIG, getImportConfig } from './importConfig.js'

/**
 * GPS import dashboard.
 *
 * Bezpečnostní/perf poznámky:
 *   - gps.import_service je malá tabulka (řádek per firma × typ importu) → SELECT přes celou lze.
 *   - gps.import_car je potenciálně velká; přístup POUZE s (company_key, import_type) → PK prefix scan.
 *   - gps.tracking se ZDE VŮBEC nedotýkáme.
 *   - Nevracíme hesla (pwd) z gps.import_service.
 */
export async function importsRoutes(app: FastifyInstance) {
  // GET /api/imports
  // Přehled všech importních služeb + vypočítaný health status.
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        WITH thresholds(import_type, silent_min, gone_days, no_gps) AS (
          SELECT * FROM unnest(
            ${CONFIG_ARRAYS.types}::text[],
            ${CONFIG_ARRAYS.silent_min}::int[],
            ${CONFIG_ARRAYS.gone_days}::int[],
            ${CONFIG_ARRAYS.no_gps}::bool[]
          )
        )
        SELECT
          s.company_key,
          c.id                                    AS company_id,
          c.company                               AS company_name,
          s.import_type,
          a.name                                  AS import_name,
          s.comp_id,
          s.comp_name,
          s.last_import_time,
          s.last_error,
          s.suspended_on,
          ca.newest_rec,
          ca.total_cars,
          ca.cars_with_error,
          COALESCE(th.silent_min, ${DEFAULT_IMPORT_CONFIG.silent_min}) AS silent_min,
          COALESCE(th.gone_days,  ${DEFAULT_IMPORT_CONFIG.gone_days})  AS gone_days,
          COALESCE(th.no_gps, FALSE)                                   AS no_gps,
          CASE
            WHEN s.suspended_on IS NOT NULL                          THEN 'suspended'
            WHEN s.last_error   IS NOT NULL                          THEN 'error'
            WHEN COALESCE(th.no_gps, FALSE) THEN
              -- Import bez GPS (např. DKVCO): hodnotíme jen podle servisního tiku.
              CASE
                WHEN s.last_import_time IS NULL                       THEN 'stale'
                WHEN s.last_import_time
                     < now() - COALESCE(th.silent_min, ${DEFAULT_IMPORT_CONFIG.silent_min})
                             * interval '1 minute'                    THEN 'stale'
                ELSE                                                       'ok'
              END
            WHEN GREATEST(ca.newest_rec, s.last_import_time) IS NULL THEN 'stale'
            WHEN GREATEST(ca.newest_rec, s.last_import_time)
                 >= now() - COALESCE(th.silent_min, ${DEFAULT_IMPORT_CONFIG.silent_min})
                          * interval '1 minute'                       THEN 'ok'
            ELSE                                                          'stale'
          END                                     AS status
        FROM gps.import_service   s
        JOIN gps.import_service_available a USING (import_type)
        LEFT JOIN provider.company c USING (company_key)
        LEFT JOIN thresholds th USING (import_type)
        LEFT JOIN LATERAL (
          -- PK prefix scan (company_key, import_type) → per-řádek malý index range,
          -- nikoli scan celé gps.import_car.
          SELECT
            MAX(ic.last_imported_rec_time)                                AS newest_rec,
            COUNT(*)                                                      AS total_cars,
            COUNT(*) FILTER (WHERE ic.last_error IS NOT NULL)             AS cars_with_error
          FROM gps.import_car ic
          WHERE ic.company_key = s.company_key
            AND ic.import_type = s.import_type
        ) ca ON TRUE
        ORDER BY
          CASE
            WHEN s.last_error   IS NOT NULL                          THEN 1
            WHEN s.suspended_on IS NOT NULL                          THEN 3
            WHEN COALESCE(th.no_gps, FALSE) AND (
              s.last_import_time IS NULL OR
              s.last_import_time < now() - COALESCE(th.silent_min, ${DEFAULT_IMPORT_CONFIG.silent_min})
                                         * interval '1 minute'
            )                                                        THEN 2
            WHEN NOT COALESCE(th.no_gps, FALSE) AND (
              GREATEST(ca.newest_rec, s.last_import_time) IS NULL OR
              GREATEST(ca.newest_rec, s.last_import_time)
                < now() - COALESCE(th.silent_min, ${DEFAULT_IMPORT_CONFIG.silent_min})
                        * interval '1 minute'
            )                                                        THEN 2
            ELSE                                                          4
          END,
          c.company NULLS LAST,
          s.import_type
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })

  // GET /api/imports/:company_key/:import_type/cars
  // Detail aut pro jeden konkrétní import (PK prefix scan → bezpečné i na velké tabulce).
  app.get('/:company_key/:import_type/cars', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userDb, passwordDb } = (request as any).user
    const { company_key, import_type } = request.params as { company_key: string; import_type: string }

    const companyKey = Number(company_key)
    if (!Number.isFinite(companyKey) || companyKey <= 0) {
      return reply.code(400).send({ error: 'invalid company_key' })
    }
    // Kódy importů: UPPER + číslice, případně pomlčky (např. DAF--), MB má 2 znaky.
    if (!/^[A-Z0-9-]{1,5}$/.test(import_type)) {
      return reply.code(400).send({ error: 'invalid import_type' })
    }

    const cfg = getImportConfig(import_type)
    const silentMin = cfg.silent_min
    const goneDays  = cfg.gone_days

    const sql = getUserSql(userDb, passwordDb)
    try {
      const rows = await sql`
        SELECT
          i.company_key,
          i.import_type,
          i.ext_id,
          i.ext_name,
          i.car_key,
          c.spz,
          c.vin,
          c.inactive,
          i.last_imported_rec_time,
          i.last_car_import_time,
          i.last_import_time,
          i.last_error,
          CASE
            WHEN c.inactive                                                          THEN 'inactive'
            WHEN i.last_error IS NOT NULL                                            THEN 'error'
            WHEN i.last_car_import_time IS NULL                                      THEN 'gone-from-vendor'
            WHEN i.last_car_import_time  < now() - ${goneDays}  * interval '1 day'   THEN 'gone-from-vendor'
            WHEN i.last_imported_rec_time IS NULL                                    THEN 'silent'
            WHEN i.last_imported_rec_time < now() - ${silentMin} * interval '1 minute' THEN 'silent'
            ELSE                                                                          'ok'
          END AS car_status
        FROM gps.import_car i
        LEFT JOIN gps.car_base c USING (car_key, company_key)
        WHERE i.company_key  = ${companyKey}
          AND i.import_type  = ${import_type}
        ORDER BY
          CASE
            WHEN c.inactive                                                          THEN 5
            WHEN i.last_error IS NOT NULL                                            THEN 1
            WHEN i.last_car_import_time IS NULL
              OR i.last_car_import_time  < now() - ${goneDays}  * interval '1 day'   THEN 2
            WHEN i.last_imported_rec_time IS NULL
              OR i.last_imported_rec_time < now() - ${silentMin} * interval '1 minute' THEN 3
            ELSE                                                                  4
          END,
          i.ext_id
      `
      return reply.send(rows)
    } finally {
      await sql.end()
    }
  })
}
