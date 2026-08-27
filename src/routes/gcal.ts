import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { gcalAuthUrl, gcalExchangeCode, gcalIsConnected, gcalDisconnect, gcalList } from '../services/gcal.js'

export async function gcalRoutes(app: FastifyInstance) {
  // GET /api/gcal/status — je kalendář propojený?
  app.get('/status', {
    onRequest: [(app as any).authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ connected: gcalIsConnected() })
  })

  // GET /api/gcal/auth-url — vrátí Google OAuth URL (JSON), FE pak přesměruje prohlížeč
  app.get('/auth-url', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { initials } = (request as any).user
    return reply.send({ url: gcalAuthUrl(initials) })
  })

  // GET /api/gcal/callback — Google OAuth návrat (bez auth)
  app.get('/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, error } = request.query as { code?: string; error?: string }
    if (error || !code) {
      return reply.code(400).send(`<h3>Propojení se nezdařilo: ${error ?? 'chybí code'}</h3>`)
    }
    try {
      await gcalExchangeCode(code)
      const fe = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
      return reply.redirect(`${fe}/new/#/diary?gcal=connected`)
    } catch (e: any) {
      return reply.code(500).send(`<h3>Chyba: ${e.message}</h3>`)
    }
  })

  // DELETE /api/gcal/disconnect — odpojení
  app.delete('/disconnect', {
    onRequest: [(app as any).authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    gcalDisconnect()
    return reply.send({ success: true })
  })

  // GET /api/gcal/events — události z Google Kalendáře v rozsahu (pro zobrazení v deníku)
  app.get('/events', {
    onRequest: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { date?: string; days?: string }
    const dateFrom = new Date(q.date ?? new Date().toISOString().slice(0, 10))
    const days = Math.min(Number(q.days ?? 10), 90)
    const dateTo = new Date(dateFrom); dateTo.setDate(dateTo.getDate() + days)
    if (!gcalIsConnected()) return reply.send({ connected: false, items: [] })
    try {
      const items = await gcalList(dateFrom.toISOString(), dateTo.toISOString())
      return reply.send({ connected: true, items })
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })
}
