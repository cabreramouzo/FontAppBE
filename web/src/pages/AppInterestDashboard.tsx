import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { isAdminRole } from '../lib/roles'

interface PricingModelStats {
  count: number
  priceBreakdown: Record<string, number>
}

interface PlatformStats {
  total: number
  wantsApp: number
  noApp: number
  subscription: PricingModelStats
  oneTime: PricingModelStats
}

interface InterestDashboard {
  total: number
  byPlatform: Record<string, PlatformStats>
}

const PLATFORM_LABELS = {
  ios: '🍎 iOS',
  android: '🤖 Android',
  other: '🖥️ Other',
}

const PRICE_LABELS = {
  '1': '€1',
  '2': '€2',
  '5': '€5',
  '10': '€10',
  '1_month': '€1/month',
  '2_month': '€2/month',
  '5_month': '€5/month',
  '10_month': '€10/month',
}

export function AppInterestDashboard() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [dashboard, setDashboard] = useState<InterestDashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || !isAdminRole(user)) return

    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/interest/dashboard')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json() as InterestDashboard
        setDashboard(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error fetching dashboard')
        setDashboard(null)
      }
    }

    fetchDashboard()
  }, [user, loading])

  if (!isAdminRole(user)) return null

  return (
    <Box className="pad" sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>📱 App Interest Dashboard</Typography>

      {error && (
        <Typography color="error" sx={{ my: 1 }}>
          Error: {error}
        </Typography>
      )}

      {dashboard === null && loading && <Skeleton lines={4} />}

      {dashboard && (
        <>
          {/* Total Stats */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Overall Stats</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Total Responses</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{dashboard.total}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Want Native App</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.main' }}>
                    {Object.values(dashboard.byPlatform).reduce((sum, p) => sum + p.wantsApp, 0)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Don't Want App</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'error.main' }}>
                    {Object.values(dashboard.byPlatform).reduce((sum, p) => sum + p.noApp, 0)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Platform Breakdown */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {Object.entries(dashboard.byPlatform).map(([platform, stats]) => (
              <Grid item xs={12} md={4} key={platform}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                      {PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS]}
                    </Typography>

                    {/* Platform Total and Want/No Want */}
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2">Total Responses</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{stats.total}</Typography>
                      </Box>
                      {stats.total > 0 && (
                        <Box sx={{ mb: 1.5 }}>
                          <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                            <Chip
                              size="small"
                              color="success"
                              label={`Want: ${stats.wantsApp} (${Math.round(stats.wantsApp / stats.total * 100)}%)`}
                            />
                            <Chip
                              size="small"
                              label={`No: ${stats.noApp} (${Math.round(stats.noApp / stats.total * 100)}%)`}
                            />
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={(stats.wantsApp / stats.total * 100)}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </Box>
                      )}
                    </Box>

                    {/* Pricing Models for those who want the app */}
                    {stats.wantsApp > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          Pricing Model (from {stats.wantsApp} who want app)
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          {stats.subscription.count > 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Subscription: ${stats.subscription.count} (${Math.round(stats.subscription.count / stats.wantsApp * 100)}%)`}
                            />
                          )}
                          {stats.oneTime.count > 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`One-Time: ${stats.oneTime.count} (${Math.round(stats.oneTime.count / stats.wantsApp * 100)}%)`}
                            />
                          )}
                          {(stats.subscription.count + stats.oneTime.count) < stats.wantsApp && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`No Preference: ${stats.wantsApp - stats.subscription.count - stats.oneTime.count}`}
                            />
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* Price Points for Subscription */}
                    {stats.subscription.count > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                          Subscription Prices ({stats.subscription.count})
                        </Typography>
                        {Object.entries(stats.subscription.priceBreakdown)
                          .filter(([_, count]) => count > 0)
                          .map(([price, count]) => (
                            <Box key={price} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption">
                                {PRICE_LABELS[price as keyof typeof PRICE_LABELS]}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                {count} ({Math.round(count / stats.subscription.count * 100)}%)
                              </Typography>
                            </Box>
                          ))}
                      </Box>
                    )}

                    {/* Price Points for One-Time */}
                    {stats.oneTime.count > 0 && (
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                          One-Time Prices ({stats.oneTime.count})
                        </Typography>
                        {Object.entries(stats.oneTime.priceBreakdown)
                          .filter(([_, count]) => count > 0)
                          .map(([price, count]) => (
                            <Box key={price} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption">
                                {PRICE_LABELS[price as keyof typeof PRICE_LABELS]}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                {count} ({Math.round(count / stats.oneTime.count * 100)}%)
                              </Typography>
                            </Box>
                          ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Platform Comparison */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Platform Comparison</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 2, alignItems: 'center' }}>
                {Object.entries(dashboard.byPlatform).map(([platform, stats]) => (
                  <Box key={platform} sx={{ display: 'contents' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS]}
                    </Typography>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption">
                          {Math.round(stats.wantsApp / stats.total * 100)}% want app
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {stats.total} total
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={(stats.wantsApp / stats.total * 100)}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  )
}
