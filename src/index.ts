import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import jwtPlugin from './plugins/jwt.js'
import { authRoutes } from './routes/auth.js'
import { companiesRoutes } from './routes/companies/index.js'
import { searchRoutes } from './routes/search.js'
import { diaryRoutes } from './routes/diary.js'
import { invoicingRoutes } from './routes/invoicing.js'
import { statisticsRoutes } from './routes/statistics.js'
import { truckmanagerRoutes } from './routes/truckmanager.js'
import { sendMailRoutes } from './routes/sendMail.js'
import { sendSmsRoutes } from './routes/sendSms.js'
import { campaignsRoutes } from './routes/campaigns.js'
import { offersRoutes } from './routes/offers.js'
import { chatRoutes } from './routes/chat.js'
import { bankRoutes } from './routes/bank.js'

const app = Fastify({ logger: true })

// CORS
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
})

// Swagger docs
await app.register(swagger, {
  openapi: {
    info: { title: 'Admin API', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
})
await app.register(swaggerUi, { routePrefix: '/docs' })

// JWT plugin
await app.register(jwtPlugin)

// Routes
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(companiesRoutes, { prefix: '/api/companies' })
await app.register(searchRoutes, { prefix: '/api/search' })
await app.register(diaryRoutes, { prefix: '/api/diary' })
await app.register(invoicingRoutes, { prefix: '/api/invoicing' })
await app.register(statisticsRoutes, { prefix: '/api/statistics' })
await app.register(truckmanagerRoutes, { prefix: '/api/truckmanager' })
await app.register(sendMailRoutes, { prefix: '/api/send-mail' })
await app.register(sendSmsRoutes, { prefix: '/api/send-sms' })
await app.register(campaignsRoutes, { prefix: '/api/campaigns' })
await app.register(offersRoutes, { prefix: '/api/offers' })
await app.register(chatRoutes, { prefix: '/api/chat' })
await app.register(bankRoutes, { prefix: '/api/bank' })

// Health check
app.get('/health', async () => ({ status: 'ok' }))

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'

try {
  await app.listen({ port, host })
  console.log(`Admin API running on http://${host}:${port}`)
  console.log(`Swagger docs: http://${host}:${port}/docs`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
