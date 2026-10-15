/**
 * Smazání firmy a všech záznamů s daným company_key napříč databází.
 *
 * Skript najde všechny tabulky se sloupcem company_key a navíc rekurzivně
 * doplní tabulky, které na mazané záznamy odkazují cizím klíčem
 * (např. gps.tracking_last přes car_key). Maže se v jedné transakci,
 * potomci před rodiči.
 *
 * Použití:
 *   npm run delete-company -- 7975            # dry-run: vypíše, co by se smazalo
 *   npm run delete-company -- 7975 --execute  # skutečně smaže (v jedné transakci)
 * Heslo musí být nastavené v DEV_DB_PASSWORD_OVERRIDE nebo DB_PASSWORD.
 */
import postgres from 'postgres'

const companyKey = process.argv[2]
const execute = process.argv.includes('--execute')

if (!companyKey || !/^\d+$/.test(companyKey)) {
  console.error('Použití: npm run delete-company -- <company_key> [--execute]')
  process.exit(1)
}

const password = process.env.DEV_DB_PASSWORD_OVERRIDE ?? process.env.DB_PASSWORD
if (!password) {
  console.error('Nastavte DEV_DB_PASSWORD_OVERRIDE nebo DB_PASSWORD.')
  process.exit(1)
}

const sql = postgres({
  host: process.env.DB_HOST ?? 'data.euro-sped.cz',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'EURO-SPED-PROVIDER-CZ',
  username: process.env.DEV_DB_USER_OVERRIDE ?? process.env.DB_USER ?? 'sys_anon',
  password,
  max: 1,
  idle_timeout: 30,
})

type TableId = string // "schema.table"
type CondNode =
  | { kind: 'base' } // company_key = $1
  | { kind: 'fk'; fkCols: string[]; refTable: TableId; refCols: string[] }

// Map zachovává pořadí vložení = pořadí objevení (rodiče před potomky)
const conds = new Map<TableId, CondNode[]>()

const splitTable = (id: TableId) => {
  const i = id.indexOf('.')
  return { schema: id.slice(0, i), name: id.slice(i + 1) }
}

/** Sestaví WHERE podmínku (s parametrem $1 = companyKey) pro mazání dané tabulky. */
function buildWhere(table: TableId, stack: TableId[] = []): string {
  if (stack.includes(table)) {
    // FK cyklus (např. car_base ↔ driver_base): obě tabulky mažeme celé přes company_key
    const hasBase = conds.get(table)!.some((c) => c.kind === 'base')
    if (!hasBase) throw new Error(`FK cyklus bez company_key podmínky: ${[...stack, table].join(' -> ')}`)
    return 'company_key = $1'
  }
  const parts = conds.get(table)!.map((c) => {
    if (c.kind === 'base') return 'company_key = $1'
    const { schema, name } = splitTable(c.refTable)
    const fk = c.fkCols.map((col) => `"${col}"`).join(', ')
    const rf = c.refCols.map((col) => `"${col}"`).join(', ')
    return `(${fk}) IN (SELECT ${rf} FROM "${schema}"."${name}" WHERE ${buildWhere(c.refTable, [...stack, table])})`
  })
  return parts.map((p) => `(${p})`).join(' OR ')
}

/** FK constraint'ry odkazující na danou tabulku (pg_catalog, přesné párování sloupců). */
const FK_SQL = `
  SELECT con.conname AS cname,
         ns_r.nspname AS src_schema, rel_r.relname AS src_table,
         att_r.attname AS src_col, att_f.attname AS ref_col
  FROM pg_constraint con
  JOIN pg_class rel_r ON rel_r.oid = con.conrelid
  JOIN pg_namespace ns_r ON ns_r.oid = rel_r.relnamespace
  JOIN pg_class rel_f ON rel_f.oid = con.confrelid
  JOIN pg_namespace ns_f ON ns_f.oid = rel_f.relnamespace
  JOIN unnest(con.conkey)  WITH ORDINALITY AS ck(attnum, ord) ON true
  JOIN unnest(con.confkey) WITH ORDINALITY AS cf(attnum, ord) ON cf.ord = ck.ord
  JOIN pg_attribute att_r ON att_r.attrelid = con.conrelid AND att_r.attnum = ck.attnum
  JOIN pg_attribute att_f ON att_f.attrelid = con.confrelid AND att_f.attnum = cf.attnum
  WHERE con.contype = 'f' AND ns_f.nspname = $1 AND rel_f.relname = $2
    AND NOT rel_r.relispartition -- partitiony se mažou přes rodiče
`

async function main() {
  // 1) Skutečné tabulky (ne view) se sloupcem company_key
  const tables = await sql<{ table_schema: string; table_name: string }[]>`
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.column_name = 'company_key'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_schema, c.table_name
  `

  // 2) Základní množina: tabulky s řádky pro tento company_key
  const skipped: string[] = []
  for (const { table_schema, table_name } of tables) {
    const id = `${table_schema}.${table_name}`
    try {
      const [row] = await sql.unsafe(
        `SELECT count(*)::int AS c FROM "${table_schema}"."${table_name}" WHERE company_key = $1`,
        [companyKey],
      )
      if (row.c > 0) {
        conds.set(id, [{ kind: 'base' }])
      }
    } catch (err: any) {
      skipped.push(`${id} (${err?.message ?? err})`)
    }
  }

  if (conds.size === 0) {
    console.log(`company_key=${companyKey}: žádné záznamy nenalezeny.`)
    return
  }

  // 3) Rekurzivně doplníme tabulky odkazující FK na mazané tabulky.
  //    Rozšiřujeme JEN do tabulek bez sloupce company_key — tabulky s company_key
  //    jsou pokryté základní podmínkou (jejich řádky pro tuto firmu se smažou).
  //    Případné křížové reference cizích firem na tuto firmu se nemažou — hlásí se.
  const tablesWithCk = new Set(tables.map((t) => `${t.table_schema}.${t.table_name}`))
  const crossRefs: string[] = []
  const queue = [...conds.keys()]
  while (queue.length > 0) {
    const parent = queue.shift()!
    const { schema, name } = splitTable(parent)
    const fks = await sql.unsafe(FK_SQL, [schema, name])

    // seskupit podle constraintu (multi-column FK = více řádků)
    const byConstraint = new Map<string, { id: TableId; fkCols: string[]; refCols: string[] }>()
    for (const fk of fks) {
      const srcId = `${fk.src_schema}.${fk.src_table}`
      if (srcId === parent) continue // self-FK: řádky se smažou společně
      const key = `${srcId}|${fk.cname}`
      const entry = byConstraint.get(key) ?? { id: srcId, fkCols: [], refCols: [] }
      entry.fkCols.push(fk.src_col)
      entry.refCols.push(fk.ref_col)
      byConstraint.set(key, entry)
    }

    for (const { id, fkCols, refCols } of byConstraint.values()) {
      if (tablesWithCk.has(id)) {
        // Tabulka má vlastní company_key — její řádky pro tuto firmu se smažou přes base.
        // Odkazy přes jiné sloupce (např. car_key) nemažeme — mohou patřit jiným firmám.
        // Místo toho je ověříme jako potenciální blokery (níže).
        if (!(fkCols.length === 1 && fkCols[0] === 'company_key')) {
          crossRefs.push(JSON.stringify({ id, fkCols, refTable: parent, refCols }))
        }
        continue
      }
      const node: CondNode = { kind: 'fk', fkCols, refTable: parent, refCols }
      const existing = conds.get(id)
      if (existing) {
        if (!existing.some((e) => JSON.stringify(e) === JSON.stringify(node))) {
          existing.push(node)
          queue.push(id) // podmínka se rozšířila → přepočítat potomky
        }
      } else {
        conds.set(id, [node])
        queue.push(id)
      }
    }
  }

  // 4) Spočítáme řádky ke smazání v každé tabulce (timeout 15 s / dotaz —
  //    velké tabulky bez indexu hlásíme jako '?', ale v plánu necháme).
  //    Tabulky bez oprávnění kaskádově vyřadíme z plánu (včetně podmínek,
  //    které na ně odkazují).
  const counts = new Map<TableId, number>()
  const pending: TableId[] = [...conds.keys()]

  const dropTable = (id: TableId, reason: string) => {
    if (!conds.delete(id)) return
    skipped.push(`${id} (${reason})`)
    counts.delete(id)
    for (const [oid, cs] of [...conds.entries()]) {
      const kept = cs.filter((c) => c.kind === 'base' || c.refTable !== id)
      if (kept.length !== cs.length) {
        if (kept.length === 0) {
          dropTable(oid, `závislá na vyřazené ${id}`)
        } else {
          conds.set(oid, kept)
          counts.delete(oid) // přepočítat s užším WHERE
          pending.push(oid)
        }
      }
    }
  }

  await sql.unsafe(`SET statement_timeout = '15s'`)
  while (pending.length > 0) {
    const id = pending.shift()!
    if (!conds.has(id) || counts.has(id)) continue
    const { schema, name } = splitTable(id)
    try {
      const [row] = await sql.unsafe(
        `SELECT count(*)::int AS c FROM "${schema}"."${name}" WHERE ${buildWhere(id)}`,
        [companyKey],
      )
      counts.set(id, row.c)
    } catch (err: any) {
      if (err?.code === '57014') {
        counts.set(id, -1) // timeout — neznámý počet
      } else if (err?.code === '42501') {
        dropTable(id, err?.message ?? err)
      } else {
        throw err
      }
    }
  }

  // 4b) Křížové reference: řádky JINÝCH firem (company_key <> $1) odkazující
  //     na mazané záznamy přes jiný sloupec — ty by smazání zablokovaly.
  const blockers: string[] = []
  for (const cr of new Set(crossRefs)) {
    const { id, fkCols, refTable, refCols } = JSON.parse(cr)
    if (!conds.has(refTable)) continue // rodič byl vyřazen z plánu
    const { schema, name } = splitTable(id)
    const { schema: rs, name: rn } = splitTable(refTable)
    const fk = fkCols.map((c: string) => `"${c}"`).join(', ')
    const rf = refCols.map((c: string) => `"${c}"`).join(', ')
    try {
      const [row] = await sql.unsafe(
        `SELECT EXISTS(
           SELECT 1 FROM "${schema}"."${name}"
           WHERE (${fk}) IN (SELECT ${rf} FROM "${rs}"."${rn}" WHERE ${buildWhere(refTable)})
             AND company_key IS DISTINCT FROM $1
         ) AS x`,
        [companyKey],
      )
      if (row.x) blockers.push(`${id} (${fkCols.join(', ')} → ${refTable})`)
    } catch (err: any) {
      if (err?.code === '42501' || err?.code === '57014') {
        blockers.push(`${id} — nepodařilo se ověřit (${err?.code})`)
      } else {
        throw err
      }
    }
  }
  await sql.unsafe(`SET statement_timeout = 0`)

  const plan = [...conds.keys()].filter((id) => (counts.get(id) ?? 0) !== 0)
  console.log(`company_key=${companyKey} — plán mazání:`)
  for (const id of plan) {
    const via = conds.get(id)!.some((c) => c.kind === 'base') ? 'company_key' : 'přes FK'
    const n = counts.get(id)
    console.log(`  ${id}: ${n === -1 ? '? (timeout)' : n}  (${via})`)
  }
  const known = [...counts.values()].filter((c) => c > 0)
  console.log(`  CELKEM: ${known.reduce((s, c) => s + c, 0)} záznamů v ${plan.length} tabulkách`)
  if (skipped.length > 0) {
    console.log('\nPřeskočené tabulky (bez oprávnění):')
    for (const s of skipped) console.log(`  ${s}`)
  }
  if (blockers.length > 0) {
    console.log('\nPOZOR — křížové reference jiných firem (smazání pravděpodobně zablokují):')
    for (const b of blockers) console.log(`  ${b}`)
  }

  if (!execute) {
    console.log('\nDry-run. Pro skutečné smazání spusť s --execute')
    return
  }

  // 5) Mazání v transakci. Pořadí: obrácené pořadí objevení (potomci později objevení
  //    mažou se dřív). FK cykly v datech řeší retry smyčka se savepointy —
  //    při 23503 se tabulka přesune na další kolo.
  await sql.begin(async (tx) => {
    let remaining = [...plan].reverse()
    let passes = 0
    while (remaining.length > 0 && passes < 50) {
      let progress = false
      const failed: TableId[] = []
      for (const id of remaining) {
        const { schema, name } = splitTable(id)
        try {
          const res = await (tx as any).savepoint(async (sp: any) => {
            return sp.unsafe(`DELETE FROM "${schema}"."${name}" WHERE ${buildWhere(id)}`, [companyKey])
          })
          console.log(`smazáno z ${id}: ${res.count}`)
          progress = true
        } catch (err: any) {
          if (err?.code === '23503') {
            failed.push(id)
          } else {
            throw err
          }
        }
      }
      if (!progress) {
        throw Object.assign(
          new Error(`Nelze smazat kvůli FK cyklu v datech: ${failed.join(', ')}`),
          { code: '23503' },
        )
      }
      remaining = failed
      passes++
    }
  })

  console.log(`\nHotovo — firma ${companyKey} a všechny navázané záznamy smazány.`)
}

main()
  .catch((err) => {
    console.error('Chyba:', err?.stack ?? err)
    if (err?.code === '23503') {
      console.error('Detail: smazání zablokoval cizí klíč, který skript nepokryl.')
      console.error(err?.detail ?? '')
    }
    process.exitCode = 1
  })
  .finally(() => sql.end())
