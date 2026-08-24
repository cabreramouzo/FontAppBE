import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Typography from '@mui/material/Typography'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { onboardingStep, setOnboardingStep, type OnboardingStep } from '../lib/onboarding'
import { useTurno } from '../lib/asks'

const NEXT: Record<Exclude<OnboardingStep, 'done'>, OnboardingStep> = {
  map: 'status',
  status: 'add',
  add: 'done',
}

function selectorFor(step: OnboardingStep): string | null {
  if (step === 'map') return '.status-pin'
  if (step === 'status') return '[data-onboarding="status-actions"]'
  if (step === 'add') return '[data-onboarding="add-font"]'
  return null
}

/** Ayudas pequeñas que aparecen solo cuando la acción explicada está delante. */
export function ContextualOnboarding() {
  const { pathname } = useLocation()
  const { user, promptLocation } = useAuth()
  const { t } = useI18n()
  const [step, setStep] = useState<OnboardingStep>(onboardingStep)
  const [anchor, setAnchor] = useState<Element | null>(null)

  useEffect(() => {
    setStep(onboardingStep())
  }, [pathname])

  useEffect(() => {
    const selector = selectorFor(step)
    if (!selector || !user || promptLocation) { setAnchor(null); return }
    const find = () => setAnchor(document.querySelector(selector))
    find()
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [step, pathname, user, promptLocation])

  const open = useTurno('onboarding', !!anchor && step !== 'done')

  function next() {
    if (step === 'done') return
    const following = NEXT[step]
    setOnboardingStep(following)
    setStep(following)
    setAnchor(null)
  }

  function finish() {
    setOnboardingStep('done')
    setStep('done')
    setAnchor(null)
  }

  if (!anchor || step === 'done') return null

  return (
    <Popper open={open} anchorEl={anchor} placement="top" sx={{ zIndex: (theme) => theme.zIndex.modal }}>
      <Paper elevation={10} role="dialog" aria-label={t(`onboarding.${step}.title`)} sx={{ m: 1, p: 2, maxWidth: 310, borderRadius: 3, border: 1, borderColor: 'primary.main' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{t(`onboarding.${step}.title`)}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t(`onboarding.${step}.body`)}</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mt: 1.5 }}>
          <Button size="small" color="inherit" onClick={finish}>{t('onboarding.skip')}</Button>
          <Button size="small" variant="contained" disableElevation onClick={next}>{t(step === 'add' ? 'onboarding.finish' : 'onboarding.gotIt')}</Button>
        </Box>
      </Paper>
    </Popper>
  )
}
