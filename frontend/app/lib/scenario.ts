'use client'
import type { ErpScenario } from '../types'

const KEY = 'erp-scenario'

export function getScenario(): ErpScenario {
  if (typeof window === 'undefined') return 'default'
  const v = window.localStorage.getItem(KEY)
  return v === 'success' || v === 'slow' || v === 'fail' ? v : 'default'
}

export function setScenario(value: ErpScenario): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, value)
}
