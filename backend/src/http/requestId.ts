import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import { logger } from '../logger'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string
      log: Logger
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')
  const id = incoming && incoming.trim() ? incoming.trim() : randomUUID()
  req.id = id
  req.log = logger.child({ requestId: id })
  res.setHeader('x-request-id', id)
  next()
}
