import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { Layout } from './components/Layout'
import { MapPage } from './pages/MapPage'
import { FontDetailPage } from './pages/FontDetailPage'
import { LoginPage } from './pages/LoginPage'
import { LegalPage } from './pages/LegalPage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<MapPage />} />
              <Route path="/fonts/:id" element={<FontDetailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/me" element={<ProfilePage />} />
              <Route path="/legal" element={<LegalPage />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}
