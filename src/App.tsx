import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ConfirmProvider } from './components/Confirm';
import { DevHintsProvider } from './context/DevHintsContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Callback from './pages/Callback';
import Dashboard from './pages/Dashboard';
import Organizations from './pages/Organizations';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Applications from './pages/Applications';
import Users from './pages/Users';
import BulkUsers from './pages/BulkUsers';
import DuplicateOrg from './pages/DuplicateOrg';
import OrgTransfer from './pages/OrgTransfer';
import Events from './pages/Events';
import IdentityProviders from './pages/IdentityProviders';

export default function App() {
  const { connected } = useAuth();

  if (!connected) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <DevHintsProvider>
    <ConfirmProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/users" element={<Users />} />
          <Route path="/bulk-users" element={<BulkUsers />} />
          <Route path="/duplicate" element={<DuplicateOrg />} />
          <Route path="/transfer" element={<OrgTransfer />} />
          <Route path="/events" element={<Events />} />
          <Route path="/identity-providers" element={<IdentityProviders />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ConfirmProvider>
    </DevHintsProvider>
  );
}
