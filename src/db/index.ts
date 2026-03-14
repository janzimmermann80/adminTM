import postgres from 'postgres'

const sql = postgres({
  host: process.env.DB_HOST ?? 'data.euro-sped.cz',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'EURO-SPED-PROVIDER-CZ',
  username: process.env.DB_USER ?? 'sys_anon',
  password: process.env.DB_PASSWORD ?? 'EsO-aNonYmouS',
  max: 10,
  idle_timeout: 30,
})

export default sql
