import { createApp } from './app'
import { createDb } from './db/connection'
import { applySchema } from './db/schema'
import { seedIfEmpty } from './db/seed'
import { SimulatedErp } from './erp/simulatedErp'
import { env } from './config/env'
import { logger } from './logger'

const db = createDb()
applySchema(db)
seedIfEmpty(db)

const app = createApp(db, new SimulatedErp())
app.listen(env.PORT, () => {
  logger.info(`CaseCellShop API em http://localhost:${env.PORT}`)
})
