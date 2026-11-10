import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { configError } from './lib/supabase';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import MyWork from './pages/MyWork';
import Register from './pages/Register';
import ActionForm from './pages/ActionForm';
import ActionDetail from './pages/ActionDetail';
import ProfilePage from './pages/ProfilePage';
import UsersAdmin from './pages/admin/UsersAdmin';
import DepartmentsAdmin from './pages/admin/DepartmentsAdmin';
import ReferenceAdmin from './pages/admin/ReferenceAdmin';
import PolicyAdmin from './pages/admin/PolicyAdmin';
import type { ReactNode } from 'react';
import type { AppRole } from './lib/types';

function RequireRole({ any, children }: { any: AppRole[]; children: ReactNode }) {
  const { has } = useAuth();
  return any.some(has) ? <>{children}</> : <div className="page"><div className="alert alert-error">You do not have access to this page.</div></div>;
}

export default function App() {
  const { session, profile, roles, loading, loadError, recovery, signOut, refresh } = useAuth();

  if (configError) return <div className="center-page"><div className="card narrow"><h2>Setup needed</h2><p>{configError}</p></div></div>;
  if (loading) return <div className="center-page"><Spinner /></div>;
  if (recovery) return <SetPassword />;
  if (!session) return <Login />;
  if (!profile) {
    if (!loadError) return <div className="center-page"><Spinner label="Loading your profile…" /></div>;
    return (
      <div className="center-page"><div className="card narrow stack">
        <h2>Could not load your account</h2><p>{loadError}</p>
        <div className="row"><button className="btn btn-primary" onClick={refresh}>Try again</button><button className="btn" onClick={signOut}>Sign out</button></div>
      </div></div>
    );
  }
  if (!profile.active || roles.length === 0) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <h2>{profile.active ? 'Waiting for access' : 'Account deactivated'}</h2>
          <p>
            {profile.active
              ? 'Your account exists but no role has been assigned yet. Ask a LAB NLQS administrator to grant you a role, then sign in again.'
              : 'Your account has been deactivated. Contact a LAB NLQS administrator.'}
          </p>
          <p className="muted">Signed in as {profile.email}</p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MyWork />} />
        <Route path="actions" element={<Register />} />
        <Route path="actions/new" element={<RequireRole any={['quality_manager', 'department_manager', 'action_owner']}><ActionForm /></RequireRole>} />
        <Route path="actions/:id" element={<ActionDetail />} />
        <Route path="actions/:id/edit" element={<ActionForm />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin/users" element={<RequireRole any={['administrator']}><UsersAdmin /></RequireRole>} />
        <Route path="admin/departments" element={<RequireRole any={['administrator']}><DepartmentsAdmin /></RequireRole>} />
        <Route path="admin/reference" element={<RequireRole any={['administrator', 'quality_manager']}><ReferenceAdmin /></RequireRole>} />
        <Route path="admin/policy" element={<RequireRole any={['administrator', 'quality_manager']}><PolicyAdmin /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
