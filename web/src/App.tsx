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

// Code-splitting por ruta: cada página es su propio chunk (Leaflet solo se carga
// con el mapa). Las páginas son exports con nombre, de ahí el mapeo a `default`.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const FontDetailPage = lazy(() => import('./pages/FontDetailPage').then((m) => ({ default: m.FontDetailPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminEditsPage = lazy(() => import('./pages/AdminEditsPage').then((m) => ({ default: m.AdminEditsPage })))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
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
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/reset" element={<ResetPasswordPage />} />
                  <Route path="/me" element={<ProfilePage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/edits" element={<AdminEditsPage />} />
                  <Route path="/users/:id" element={<UserProfilePage />} />
                  <Route path="/legal" element={<LegalPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </Layout>
            <WelcomeDialog />
          </AuthProvider>
        </ToastProvider>
        </I18nProvider>
       </MuiProvider>
      </ThemeModeProvider>
    </BrowserRouter>
  )
}
