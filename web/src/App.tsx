import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { ToastProvider } from './components/ToastContext'
import { Layout } from './components/Layout'
import { Skeleton } from './components/Skeleton'

// Code-splitting por ruta: cada página es su propio chunk (Leaflet solo se carga
// con el mapa). Las páginas son exports con nombre, de ahí el mapeo a `default`.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const FontDetailPage = lazy(() => import('./pages/FontDetailPage').then((m) => ({ default: m.FontDetailPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  return (
    <BrowserRouter>
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
                  <Route path="/legal" element={<LegalPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </Layout>
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}
