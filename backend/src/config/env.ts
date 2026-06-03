import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_PATH: z.string().default('./data/casecellshop.sqlite'),
  ERP_LATENCY_MS: z.coerce.number().int().nonnegative().default(800),
  ERP_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  ERP_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.25),
  ERP_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return EnvSchema.parse(source)
}

export const env: Env = parseEnv(process.env)
