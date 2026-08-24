import test from 'node:test'
import assert from 'node:assert/strict'
import { onboardingStep, setOnboardingStep, startContextualOnboarding } from '../src/lib/onboarding.ts'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

test('una cuenta normal no recibe onboarding por defecto', () => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  assert.equal(onboardingStep(), 'done')
})

test('el registro inicia el recorrido y cada paso queda persistido', () => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  startContextualOnboarding()
  assert.equal(onboardingStep(), 'map')
  setOnboardingStep('status')
  assert.equal(onboardingStep(), 'status')
  setOnboardingStep('add')
  assert.equal(onboardingStep(), 'add')
  setOnboardingStep('done')
  assert.equal(onboardingStep(), 'done')
})

test('un valor antiguo o corrupto no reactiva ayudas', () => {
  const fake = storage()
  fake.setItem('fontapp_contextual_onboarding', 'old-step')
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true })
  assert.equal(onboardingStep(), 'done')
})
