import postgres from 'postgres'

export function getUserSql(userDb: string, passwordDb: string) {
  return postgres({
    host: process.env.DB_HOST ?? 'data.euro-sped.cz',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'EURO-SPED-PROVIDER-CZ',
    username: userDb,
    password: passwordDb,
    max: 1,
    idle_timeout: 30,
  })
}
