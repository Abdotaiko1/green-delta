import type { ReactNode } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Buildings from './pages/Buildings';
import Elevators from './pages/Elevators';
import Customers from './pages/Customers';
import Technicians from './pages/Technicians';
import Faults from './pages/Faults';
import Maintenance from './pages/Maintenance';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import OilRecords from './pages/OilRecords';
import AssetHistory from './pages/AssetHistory';
import SparePartReplacements from './pages/SparePartReplacements';
import Attendance from './pages/Attendance';
import Finance from './pages/Finance';
import Permissions from './pages/Permissions';
import AuditLog from './pages/AuditLog';
import BulkImport from './pages/BulkImport';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'تسجيل الدخول', path: '/login', element: <Login />, public: true },
  { name: 'لوحة التحكم', path: '/', element: <Dashboard /> },
  { name: 'المباني', path: '/buildings', element: <Buildings /> },
  { name: 'استيراد المباني والمصاعد', path: '/bulk-import', element: <BulkImport /> },
  { name: 'سجل المبنى', path: '/buildings/:id', element: <AssetHistory /> },
  { name: 'المصاعد', path: '/elevators', element: <Elevators /> },
  { name: 'سجل المصعد', path: '/elevators/:id', element: <AssetHistory /> },
  { name: 'العملاء', path: '/customers', element: <Customers /> },
  { name: 'الفنيين', path: '/technicians', element: <Technicians /> },
  { name: 'الأعطال', path: '/faults', element: <Faults /> },
  { name: 'الصيانة', path: '/maintenance', element: <Maintenance /> },
  { name: 'المخزن', path: '/inventory', element: <Inventory /> },
  { name: 'الزيت', path: '/oil', element: <OilRecords /> },
  { name: 'قطع الغيار المستبدلة', path: '/spare-parts', element: <SparePartReplacements /> },
  { name: 'التقارير', path: '/reports', element: <Reports /> },
  { name: 'المالية', path: '/finance', element: <Finance /> },
  { name: 'الحضور والدخول', path: '/attendance', element: <Attendance /> },
  { name: 'إدارة الصلاحيات', path: '/permissions', element: <Permissions /> },
  { name: 'سجل الحركات', path: '/audit-log', element: <AuditLog /> },
];
