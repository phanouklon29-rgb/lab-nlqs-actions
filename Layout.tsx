import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';

export default function Layout() {
  const { profile, roles, has, canCreate, signOut } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const inRegister = pathname.startsWith('/actions') && pathname !== '/actions/new';
  const isAdminArea = has('administrator') || has('quality_manager');
  const roleText = [...new Set(roles.map(r => ROLE_LABEL[r.role]))].join(' · ') || 'No role assigned';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <div>
            <div className="brand-name">LAB NLQS</div>
            <div className="brand-sub">Action Plan Control</div>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>My work</NavLink>
          <NavLink to="/actions" className={() => (inRegister ? 'active' : '')}>Action register</NavLink>
          {canCreate && <NavLink to="/actions/new">New action</NavLink>}
          {isAdminArea && <div className="nav-section">Administration</div>}
          {has('administrator') && <NavLink to="/admin/users">Users &amp; roles</NavLink>}
          {has('administrator') && <NavLink to="/admin/departments">Departments</NavLink>}
          {isAdminArea && <NavLink to="/admin/reference">Reference lists</NavLink>}
          {isAdminArea && <NavLink to="/admin/policy">Approval policy</NavLink>}
        </nav>
        <div className="sidebar-foot">
          <button className="user-chip" onClick={() => nav('/profile')} title="My profile">
            <span className="avatar">{(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}</span>
            <span className="user-meta">
              <span className="user-name">{profile?.full_name || profile?.email}</span>
              <span className="user-role">{roleText}</span>
            </span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
