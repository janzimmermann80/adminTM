import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'
import { Vyhledavani } from './pages/Vyhledavani'
import { Search } from './pages/Search'
import { CompanyDetail } from './pages/company/CompanyDetail'
import { WorkerDetail } from './pages/WorkerDetail'
import { InvoicePrint } from './pages/InvoicePrint'
import { Bank } from './pages/Bank'
import { Spinner } from './components/Spinner'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={10} />
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/overview" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
    <Route path="/vyhledavani" element={<ProtectedRoute><Vyhledavani /></ProtectedRoute>} />
    <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
    <Route path="/company/:id" element={<ProtectedRoute><CompanyDetail /></ProtectedRoute>} />
    <Route path="/worker/:initials" element={<ProtectedRoute><WorkerDetail /></ProtectedRoute>} />
    <Route path="/invoicing/:id/print" element={<InvoicePrint />} />
    <Route path="/bank" element={<ProtectedRoute><Bank /></ProtectedRoute>} />
    <Route path="/" element={<Navigate to="/overview" replace />} />
    <Route path="*" element={<Navigate to="/overview" replace />} />
  </Routes>
)

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
