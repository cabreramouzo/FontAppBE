import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { ThemeModeProvider } from './theme/ThemeModeContext'
import { MuiProvider } from './theme/MuiProvider'
import { ToastProvider } from './components/ToastContext'
import { Layout } from './components/Layout'
import { Skeleton } from './components/Skeleton'
import { WelcomeDialog } from './components/WelcomeDialog'
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

const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminEditsPage = lazy(() => import('./pages/AdminEditsPage').then((m) => ({ default: m.AdminEditsPage })))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const NewsPage = lazy(() => import('./pages/NewsPage').then((m) => ({ default: m.NewsPage })))
const ZonesPage = lazy(() => import('./pages/ZonesPage').then((m) => ({ default: m.ZonesPage })))
const BadgesPage = lazy(() => import('./pages/BadgesPage').then((m) => ({ default: m.BadgesPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  return (
    <BrowserRouter>
      <ThemeModeProvider>
       <MuiProvider>
        <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <Layout>
              <Suspense fallback={<div className="pad"><Skeleton lines={4} /></div>}>
                <Routes>
                  <Route path="/" element={<MapPage />} />
                  <Route path="/fonts/:id" element={<FontDetailPage />} />
                  <Route path="/activity" element={<NewsPage />} />
                  <Route path="/zones" element={<ZonesPage />} />
                  <Route path="/me/badges" element={<BadgesPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset" element={<ResetPasswordPage />} />
                  <Route path="/me" element={<ProfilePage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/edits" element={<AdminEditsPage />} />
                  <Route path="/admin/activity" element={<AdminActivityPage />} />
                  <Route path="/users/:id" element={<UserProfilePage />} />
                  <Route path="/unsubscribe" element={<UnsubscribePage />} />
                  <Route path="/legal" element={<LegalPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </Layout>
            <WelcomeDialog />
            <IntroDialog />
          </AuthProvider>
        </ToastProvider>
        </I18nProvider>
       </MuiProvider>
      </ThemeModeProvider>
    </BrowserRouter>
  )
}
