import postgres from 'postgres'

export function getUserSql(userDb: string, passwordDb: string) {
  // Lokální DEV override: anonymizovaná DB vrací password jako '<skryte>',
  // takže per-request connection by selhala. Pokud je v env nastaven override,
  // použijeme ho (typicky stejný user honza, jen s reálným heslem z .env).
  const userOverride = process.env.DEV_DB_USER_OVERRIDE
  const passwordOverride = process.env.DEV_DB_PASSWORD_OVERRIDE

  return postgres({
    host: process.env.DB_HOST ?? 'data.euro-sped.cz',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'EURO-SPED-PROVIDER-CZ',
    username: userOverride ?? userDb,
    password: passwordOverride ?? passwordDb,
    max: 1,
    idle_timeout: 30,
  })
}
