import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import Dashboard from '@/pages/Dashboard';
import Agenda from '@/pages/Agenda';
import Pacientes from '@/pages/Pacientes';
import PacientePerfil from '@/pages/PacientePerfil';
import Tratamentos from '@/pages/Tratamentos';
import Estoque from '@/pages/Estoque';
import Configuracoes from '@/pages/Configuracoes';
import ModoAtendimento from '@/pages/ModoAtendimento';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/agenda" element={<Agenda />} />
                <Route path="/pacientes" element={<Pacientes />} />
                <Route path="/pacientes/:id" element={<PacientePerfil />} />
                <Route path="/tratamentos" element={<Tratamentos />} />
                <Route path="/estoque" element={<Estoque />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/atendimento/:id" element={<ModoAtendimento />} />
              </Route>
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
