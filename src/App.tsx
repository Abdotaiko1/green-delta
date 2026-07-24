import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';

import { routes } from './routes';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { AppLayout } from '@/components/layout/AppLayout';

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <RouteGuard>
          <IntersectObserver />
          <Routes>
            {/* Login Route (Public) */}
            <Route
              path="/login"
              element={routes.find(r => r.path === '/login')?.element || <Navigate to="/" replace />}
            />

            {/* Protected Routes with Layout */}
            <Route
              path="/*"
              element={
                <AppLayout>
                  <Routes>
                    {routes.map((route, index) => {
                      if (route.path === '/login') return null;
                      return (
                        <Route
                          key={index}
                          path={route.path === '/' ? '/' : route.path.replace(/^\//, '')}
                          element={route.element}
                        />
                      );
                    })}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              }
            />
          </Routes>
          <Toaster />
        </RouteGuard>
      </AuthProvider>
    </Router>
  );
};

export default App;
