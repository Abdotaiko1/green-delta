import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, role, isOwner, can, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-primary text-xl font-heading">جاري التحميل...</div>
      </div>
    );
  }

  // Allow public access to login page
  if (location.pathname === '/login') {
    // Do not redirect a signed-in user until their app role has loaded.
    // Redirecting with a missing role sends them back here from the protected
    // route and creates an endless /login <-> / loop.
    if (session && role) {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  // Require auth for all other routes
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  const path = location.pathname;
  if (path === '/permissions' && !isOwner) return <Navigate to="/" replace />;

  const resource = path === '/' ? 'dashboard'
    : path.startsWith('/buildings') ? 'buildings'
    : path.startsWith('/elevators') ? 'elevators'
    : path.startsWith('/customers') ? 'customers'
    : path.startsWith('/technicians') ? 'technicians'
    : path.startsWith('/faults') ? 'faults'
    : path.startsWith('/maintenance') ? 'maintenance'
    : path.startsWith('/inventory') ? 'inventory'
    : path.startsWith('/oil') ? 'oil'
    : path.startsWith('/spare-parts') ? 'spare_parts'
    : path.startsWith('/finance') ? 'finance'
    : path.startsWith('/reports') ? 'reports'
    : path.startsWith('/attendance') ? 'attendance'
    : path.startsWith('/audit-log') ? 'audit_log'
    : null;

  if (resource && !can(resource, 'view')) {
    return <div className="flex min-h-[60vh] items-center justify-center p-6 text-center"><div><h2 className="text-2xl font-bold">غير مسموح بالدخول</h2><p className="mt-2 text-muted-foreground">هذا القسم غير متاح لصلاحية حسابك. اطلب من المدير تفعيل المشاهدة.</p></div></div>;
  }

  return <>{children}</>;
};
