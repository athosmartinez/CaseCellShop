'use client'
import { useEffect, useState } from 'react'
import type { ErpScenario } from '../types'
import { getScenario, setScenario } from '../lib/scenario'

export function ScenarioToggle() {
  const [scenario, setLocal] = useState<ErpScenario>('default')
  useEffect(() => setLocal(getScenario()), [])

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as ErpScenario
    setLocal(v)
    setScenario(v)
  }

  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      Simular ERP:{' '}
      <select value={scenario} onChange={onChange}>
        <option value="default">aleatório (padrão)</option>
        <option value="success">sempre sucesso</option>
        <option value="slow">lento (timeout)</option>
        <option value="fail">sempre falha</option>
      </select>
    </label>
  )
}
