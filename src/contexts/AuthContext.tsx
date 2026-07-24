import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Session, User } from '@supabase/supabase-js';

type AppRole = 'manager' | 'technician' | 'accountant';
export type PermissionAction = 'view' | 'create' | 'update' | 'delete';
export type PermissionMap = Record<string, Record<PermissionAction, boolean>>;

const BYPASS_AUTH = import.meta.env.VITE_BYPASS_AUTH === 'true';
const DEV_SESSION_KEY = 'dev_auth_bypass';
const LOGIN_SESSION_KEY = 'active_login_session_id';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  permissions: PermissionMap;
  can: (resource: string, action?: PermissionAction) => boolean;
  refreshPermissions: () => Promise<void>;
  loading: boolean;
  signOut: () => Promise<void>;
  devSignIn: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  permissions: {},
  can: () => false,
  refreshPermissions: async () => {},
  loading: true,
  signOut: async () => {},
  devSignIn: () => {},
});

const createDevSession = (): { session: Session; user: User } => {
  const user = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@greendelta.com',
    app_metadata: {},
    user_metadata: { full_name: 'مدير النظام (Admin)' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;

  const session = {
    access_token: 'dev-bypass-token',
    refresh_token: 'dev-bypass-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  } as Session;

  return { session, user };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  const applyDevSession = () => {
    const { session: devSession, user: devUser } = createDevSession();
    setSession(devSession);
    setUser(devUser);
    setRole('manager');
    setPermissions({});
    setLoading(false);
    localStorage.setItem(DEV_SESSION_KEY, 'true');
  };

  const devSignIn = () => {
    if (BYPASS_AUTH) {
      applyDevSession();
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      if (BYPASS_AUTH && localStorage.getItem(DEV_SESSION_KEY) === 'true') {
        applyDevSession();
        return;
      }

      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
          await fetchUserRole(currentSession.user.id);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        setLoading(false);
      }
    };

    initializeAuth();

    if (BYPASS_AUTH) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        fetchUserRole(newSession.user.id);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchPermissions = async (targetRole: AppRole) => {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('resource, can_view, can_create, can_update, can_delete')
      .eq('role', targetRole);

    if (error) {
      // Keep older databases usable until the permissions SQL is executed.
      console.warn('Permissions table is not ready:', error.message);
      setPermissions({});
      return;
    }

    const next: PermissionMap = {};
    for (const row of data || []) {
      next[row.resource] = {
        view: row.can_view,
        create: row.can_create,
        update: row.can_update,
        delete: row.can_delete,
      };
    }
    setPermissions(next);
  };

  const fetchUserRole = async (userId: string) => {
    try {
      // Prefer the SECURITY DEFINER helper created by the auth migration. It
      // avoids policy recursion while reading the current user's own role.
      const { data: rpcRole, error: rpcError } = await supabase.rpc('current_app_role');

      if (!rpcError && ['manager', 'technician', 'accountant'].includes(rpcRole as string)) {
        const nextRole = rpcRole as AppRole;
        setRole(nextRole);
        await fetchPermissions(nextRole);
        return;
      }

      // Repair a missing public.users row for an already authenticated user.
      const { data: repairedRole, error: repairError } = await supabase.rpc('ensure_current_user_profile');
      if (!repairError && ['manager', 'technician', 'accountant'].includes(repairedRole as string)) {
        const nextRole = repairedRole as AppRole;
        setRole(nextRole);
        await fetchPermissions(nextRole);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (!data?.role) throw new Error('لا يوجد دور مرتبط بهذا المستخدم');
      const nextRole = data.role as AppRole;
      setRole(nextRole);
      await fetchPermissions(nextRole);
    } catch (error) {
      const details = error && typeof error === 'object'
        ? JSON.stringify(error)
        : String(error);
      console.error('Error fetching user role:', details);
      setRole(BYPASS_AUTH ? 'manager' : null);
    } finally {
      setLoading(false);
    }
  };

  const refreshPermissions = async () => {
    if (role) await fetchPermissions(role);
  };

  const legacyCan = (resource: string, action: PermissionAction) => {
    if (role === 'manager') return true;
    const views = role === 'technician'
      ? ['dashboard', 'buildings', 'elevators', 'faults', 'maintenance', 'oil', 'spare_parts']
      : ['dashboard', 'customers', 'inventory', 'finance', 'reports'];
    if (!role || !views.includes(resource)) return false;
    if (action === 'view') return true;
    return role === 'technician'
      && ['faults', 'maintenance', 'oil'].includes(resource)
      && action !== 'delete';
  };

  const can = (resource: string, action: PermissionAction = 'view') =>
    permissions[resource]?.[action] ?? legacyCan(resource, action);

  const signOut = async () => {
    localStorage.removeItem(DEV_SESSION_KEY);
    if (BYPASS_AUTH && session?.access_token === 'dev-bypass-token') {
      setSession(null);
      setUser(null);
      setRole(null);
      setPermissions({});
      return;
    }
    const loginSessionId = localStorage.getItem(LOGIN_SESSION_KEY);
    if (loginSessionId) {
      await supabase
        .from('login_sessions')
        .update({ logout_at: new Date().toISOString() })
        .eq('id', loginSessionId)
        .eq('user_id', user?.id || '');
      localStorage.removeItem(LOGIN_SESSION_KEY);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, permissions, can, refreshPermissions, loading, signOut, devSignIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
