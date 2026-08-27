import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { precargaRutasOffline } from './lib/precargaRutas'
import { I18nProvider } from './i18n/I18nContext'
import { ThemeModeProvider } from './theme/ThemeModeContext'
import { MuiProvider } from './theme/MuiProvider'
import { ToastProvider } from './components/ToastContext'
import { Layout } from './components/Layout'
import { Skeleton } from './components/Skeleton'
import { WelcomeDialog } from './components/WelcomeDialog'
import { BadgeCelebration } from './components/BadgeCelebration'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useI18n } from './i18n/I18nContext'
import { IntroDialog } from './components/IntroDialog'

// Code-splitting por ruta: cada página es su propio chunk (Leaflet solo se carga
// con el mapa). Las páginas son exports con nombre, de ahí el mapeo a `default`.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const FontDetailPage = lazy(() => import('./pages/FontDetailPage').then((m) => ({ default: m.FontDetailPage })))
// Las páginas de autenticación NO van en un chunk lazy a propósito: deben estar
// renderizadas cuando el navegador analiza el documento, o los gestores de contraseñas
// no reconocen el formulario (iOS acaba ofreciendo correos de Contactos en su lugar).
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { UnsubscribePage } from './pages/UnsubscribePage'
import { AdminActivityPage } from './pages/AdminActivityPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { WhatsNewDialog } from './components/WhatsNewDialog'

const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })))
const SupportPage = lazy(() => import('./pages/SupportPage').then((m) => ({ default: m.SupportPage })))
const InstallPage = lazy(() => import('./pages/InstallPage').then((m) => ({ default: m.InstallPage })))
const RouteWaterPage = lazy(() => import('./pages/RouteWaterPage').then((m) => ({ default: m.RouteWaterPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminEditsPage = lazy(() => import('./pages/AdminEditsPage').then((m) => ({ default: m.AdminEditsPage })))
const AdminModerationPage = lazy(() => import('./pages/AdminModerationPage').then((m) => ({ default: m.AdminModerationPage })))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const NewsPage = lazy(() => import('./pages/NewsPage').then((m) => ({ default: m.NewsPage })))
const ZonesPage = lazy(() => import('./pages/ZonesPage').then((m) => ({ default: m.ZonesPage })))
const GamificationPage = lazy(() => import('./pages/GamificationPage').then((m) => ({ default: m.GamificationPage })))
const BadgesPage = lazy(() => import('./pages/BadgesPage').then((m) => ({ default: m.BadgesPage })))
// Los ajustes son una pantalla por tema, como los del teléfono. Cada una en su trozo:
// son pantallas que se abren de una en una y casi nunca.
const SettingsIndexPage = lazy(() => import('./pages/settings/SettingsIndexPage').then((m) => ({ default: m.SettingsIndexPage })))
const AccountSettingsPage = lazy(() => import('./pages/settings/AccountSettingsPage').then((m) => ({ default: m.AccountSettingsPage })))
const PrivacySettingsPage = lazy(() => import('./pages/settings/PrivacySettingsPage').then((m) => ({ default: m.PrivacySettingsPage })))
const NotificationsSettingsPage = lazy(() => import('./pages/settings/NotificationsSettingsPage').then((m) => ({ default: m.NotificationsSettingsPage })))
const ContributionSettingsPage = lazy(() => import('./pages/settings/ContributionSettingsPage').then((m) => ({ default: m.ContributionSettingsPage })))
const StorageSettingsPage = lazy(() => import('./pages/settings/StorageSettingsPage').then((m) => ({ default: m.StorageSettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  // Las pantallas que tienen que funcionar sin cobertura se bajan de antemano: un trozo
  // `lazy()` solo entra en el caché la primera vez que se abre esa pantalla, y en el monte
  // ya no hay de dónde bajarlo. Ver `lib/precargaRutas.ts`.
  useEffect(precargaRutasOffline, [])

  return (
    <BrowserRouter>
      <ThemeModeProvider>
       <MuiProvider>
        <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <Layout>
              {/* Por dentro del layout: la barra y el pie sobreviven a una pantalla
                  rota, así que se puede navegar a otra sin recargar. */}
              <BarreraDePantalla>
              <Suspense fallback={<div className="pad"><Skeleton lines={4} /></div>}>
                <Routes>
                  <Route path="/" element={<MapPage />} />
                  <Route path="/fonts/:id" element={<FontDetailPage />} />
                  <Route path="/activity" element={<NewsPage />} />
                  <Route path="/zones" element={<ZonesPage />} />
                  <Route path="/gamification" element={<GamificationPage />} />
                  <Route path="/me/badges" element={<BadgesPage />} />
                  <Route path="/me/settings" element={<SettingsIndexPage />} />
                  <Route path="/me/settings/account" element={<AccountSettingsPage />} />
                  <Route path="/me/settings/privacy" element={<PrivacySettingsPage />} />
                  <Route path="/me/settings/notifications" element={<NotificationsSettingsPage />} />
                  <Route path="/me/settings/contribution" element={<ContributionSettingsPage />} />
                  <Route path="/me/settings/storage" element={<StorageSettingsPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset" element={<ResetPasswordPage />} />
                  <Route path="/me" element={<ProfilePage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/edits" element={<AdminEditsPage />} />
                  <Route path="/admin/moderation" element={<AdminModerationPage />} />
                  <Route path="/admin/activity" element={<AdminActivityPage />} />
                  <Route path="/users/:id" element={<UserProfilePage />} />
                  <Route path="/unsubscribe" element={<UnsubscribePage />} />
                  <Route path="/support" element={<SupportPage />} />
                  <Route path="/install" element={<InstallPage />} />
                  {/* «/gpx» y no «/route»: en esta app «rutas» ya son las propuestas de
                      gamificación, y dos cosas con el mismo nombre en la misma pantalla es
                      confusión garantizada. */}
                  <Route path="/gpx" element={<RouteWaterPage />} />
                  <Route path="/legal" element={<LegalPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
              </BarreraDePantalla>
            </Layout>
            <WelcomeDialog />
            {/* Fuera de la barrera de errores y del layout: es un aviso de la sesión, no
                de una pantalla, y tiene que poder salir estés donde estés. */}
            <BadgeCelebration />
            {/* Va tras la insignia en la cola de `lib/asks`, no aquí: el orden del JSX
                no decide nada, lo decide `PRIORIDAD`. */}
            <WhatsNewDialog />
            <IntroDialog />
          </AuthProvider>
        </ToastProvider>
        </I18nProvider>
       </MuiProvider>
      </ThemeModeProvider>
    </BrowserRouter>
  )
}

/**
 * Envuelve las páginas para que un error al pintar no apague la aplicación entera.
 *
 * La `key` es la ruta a propósito: sin ella, una pantalla que revienta deja la barrera
 * en estado de error para el resto de la sesión y las demás páginas dejarían de pintarse
 * también. Cambiar de ruta la remonta y se vuelve a intentar.
 */
function BarreraDePantalla({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { t } = useI18n()
  return (
    <ErrorBoundary
      key={pathname}
      mensaje={t('error.screen')}
      mensajeCaducado={t('error.stale')}
      mensajeSinRed={t('error.offlineChunk')}
      volver={t('detail.backMap')}
      reintentar={t('error.retry')}
    >
      {children}
    </ErrorBoundary>
  )
}
