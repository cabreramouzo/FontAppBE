const KEY = 'fontapp_contextual_onboarding'

export type OnboardingStep = 'map' | 'status' | 'add' | 'done'

export function onboardingStep(): OnboardingStep {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'map' || value === 'status' || value === 'add' ? value : 'done'
  } catch {
    return 'done'
  }
}

export function startContextualOnboarding(): void {
  try { localStorage.setItem(KEY, 'map') } catch { /* sin almacenamiento, no molestamos */ }
}

export function setOnboardingStep(step: OnboardingStep): void {
  try { localStorage.setItem(KEY, step) } catch { /* no se puede persistir */ }
}
