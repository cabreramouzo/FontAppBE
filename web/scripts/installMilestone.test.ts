import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasInstallMilestone, markInstallMilestone, INSTALL_MILESTONE_EVENT } from '../src/lib/installMilestone.ts'

test('only a completed useful action enables the installation hint', () => {
  const values = new Map<string, string>([['asks:sessions', '20']])
  const events: string[] = []
  const local = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const win = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    dispatchEvent: (e: Event) => { events.push(e.type); return true },
  } })
  try {
    assert.equal(hasInstallMilestone(), false)
    markInstallMilestone()
    assert.equal(hasInstallMilestone(), true)
    assert.deepEqual(events, [INSTALL_MILESTONE_EVENT])
    values.clear()
    assert.equal(hasInstallMilestone(), false)
  } finally {
    if (local) Object.defineProperty(globalThis, 'localStorage', local)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    if (win) Object.defineProperty(globalThis, 'window', win)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
