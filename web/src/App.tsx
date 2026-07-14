import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { MapPage } from './pages/MapPage'
import { FontDetailPage } from './pages/FontDetailPage'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/fonts/:id" element={<FontDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  )
}
