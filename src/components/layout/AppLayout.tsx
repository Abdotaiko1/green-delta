import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import {
  LayoutDashboard,
  Building2,
  ArrowUpDown,
  Users,
  Wrench,
  AlertTriangle,
  ClipboardList,
  Package,
  FileBarChart,
  LogOut,
  Menu,
  X,
  Search,
  Moon,
  Sun,
  Droplet,
  PackageOpen,
  Clock3,
  Wallet,
  ShieldCheck,
  History,
} from 'lucide-react';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, user, isOwner, can, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }
  };

  useEffect(() => {
    const handleSearch = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const parsedNum = parseInt(searchQuery, 10);
        let elevatorQuery = supabase.from('elevators').select('id, elevator_number, elevator_name, elevator_code');
        
        if (!isNaN(parsedNum)) {
          elevatorQuery = elevatorQuery.eq('elevator_number', parsedNum);
        } else {
          elevatorQuery = elevatorQuery.or(`elevator_name.ilike.%${searchQuery}%,elevator_code.ilike.%${searchQuery}%`);
        }

        if (role === 'technician') {
          const [elevatorRes, buildingRes] = await Promise.all([
            elevatorQuery.limit(10),
            supabase.rpc('search_buildings_basic', { search_text: searchQuery.trim() }),
          ]);
          if (elevatorRes.error) throw elevatorRes.error;
          if (buildingRes.error) throw buildingRes.error;
          setSearchResults([
            ...(buildingRes.data || []).map((building: any) => ({
              type: building.is_assigned ? 'مبنى مكلف به' : 'مبنى',
              title: building.name,
              subtitle: [building.address, building.maintenance_line_name].filter(Boolean).join(' — '),
              link: building.is_assigned ? `/buildings/${building.id}` : undefined,
            })),
            ...(elevatorRes.data || []).map((elevator) => ({
              type: 'مصعد مكلف به',
              title: elevator.elevator_name
                ? `${elevator.elevator_name} (${elevator.elevator_number})`
                : `مصعد رقم ${elevator.elevator_number}`,
              link: `/elevators/${elevator.id}`,
            })),
          ]);
          return;
        }

        const [bRes, eRes, cRes, fRes, mRes, oRes, pRes] = await Promise.all([
          supabase.from('buildings').select('id, name, address, building_code').or(`name.ilike.%${searchQuery}%,building_code.ilike.%${searchQuery}%`).limit(3),
          elevatorQuery.limit(3),
          supabase.from('customers').select('id, name').ilike('name', `%${searchQuery}%`).limit(3),
          supabase.from('faults').select('id, report_number, description').or(`report_number.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`).limit(3),
          supabase.from('maintenance').select('id, type, visit_date, notes').ilike('notes', `%${searchQuery}%`).limit(3),
          supabase.from('oil_records').select('id, oil_type, oil_brand, building_id').or(`oil_type.ilike.%${searchQuery}%,oil_brand.ilike.%${searchQuery}%`).limit(3),
          supabase.from('spare_part_replacements').select('id, part_name, invoice_number, elevator_id').or(`part_name.ilike.%${searchQuery}%,invoice_number.ilike.%${searchQuery}%`).limit(3),
        ]);

        const results = [
          ...(bRes.data || []).map(b => ({ type: 'مبنى', title: b.name, link: `/buildings/${b.id}` })),
          ...(eRes.data || []).map(e => ({
            type: 'مصعد',
            title: e.elevator_name ? `${e.elevator_name} (${e.elevator_number})` : `مصعد رقم ${e.elevator_number}`,
            link: `/elevators/${e.id}`,
          })),
          ...(cRes.data || []).map(c => ({ type: 'عميل', title: c.name, link: '/customers' })),
          ...(fRes.data || []).map(f => ({ type: 'عطل', title: f.report_number, link: '/faults' })),
          ...(mRes.data || []).map(m => ({ type: 'صيانة', title: `${m.type} — ${m.visit_date}`, link: '/maintenance' })),
          ...(oRes.data || []).map(o => ({ type: 'زيت', title: `${o.oil_type} — ${o.oil_brand}`, link: `/buildings/${o.building_id}` })),
          ...(pRes.data || []).map(p => ({ type: 'قطعة غيار', title: p.part_name, link: `/elevators/${p.elevator_id}` })),
        ];

        setSearchResults(results);
      } catch (error) {
        console.error('Search error', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(handleSearch, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery, role]);

  const navItems = [
    { name: 'لوحة التحكم', path: '/', icon: LayoutDashboard, resource: 'dashboard' },
    { name: 'المباني', path: '/buildings', icon: Building2, resource: 'buildings' },
    { name: 'المصاعد', path: '/elevators', icon: ArrowUpDown, resource: 'elevators' },
    { name: 'العملاء', path: '/customers', icon: Users, resource: 'customers' },
    { name: 'الفنيين', path: '/technicians', icon: Wrench, resource: 'technicians' },
    { name: 'الأعطال', path: '/faults', icon: AlertTriangle, resource: 'faults' },
    { name: 'الصيانة', path: '/maintenance', icon: ClipboardList, resource: 'maintenance' },
    { name: 'المخزن', path: '/inventory', icon: Package, resource: 'inventory' },
    { name: 'الزيت', path: '/oil', icon: Droplet, resource: 'oil' },
    { name: 'تغيير قطع الغيار', path: '/spare-parts', icon: PackageOpen, resource: 'spare_parts' },
    { name: 'المالية', path: '/finance', icon: Wallet, resource: 'finance' },
    { name: 'التقارير', path: '/reports', icon: FileBarChart, resource: 'reports' },
    { name: 'الحضور والدخول', path: '/attendance', icon: Clock3, resource: 'attendance' },
    { name: 'إدارة الصلاحيات', path: '/permissions', icon: ShieldCheck, resource: 'permissions' },
    { name: 'سجل الحركات', path: '/audit-log', icon: History, resource: 'audit_log' },
  ];

  const filteredNavItems = navItems.filter((item) =>
    item.resource === 'permissions' ? isOwner : can(item.resource, 'view'),
  );

  const NavLinks = () => (
    <>
      {filteredNavItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setMobileMenuOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
            location.pathname === item.path
              ? 'bg-primary text-primary-foreground font-heading'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          }`}
        >
          <item.icon className="w-5 h-5" />
          <span>{item.name}</span>
        </Link>
      ))}
    </>
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-right" dir="rtl">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-sidebar border-l border-sidebar-border relative z-10">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3" dir="ltr">
            <img src="/green-delta-logo.svg" alt="Green Delta" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain shadow-sm ring-1 ring-border" />
            <div className="min-w-0"><h1 className="text-lg font-heading text-primary font-black tracking-wide leading-tight">GREEN DELTA</h1><p className="text-[11px] font-bold text-sidebar-foreground tracking-wider">ELEVATORS CO.</p></div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <NavLinks />
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-sm text-sidebar-foreground mb-4 pr-2">
            مرحباً، <span className="font-bold">{user?.email}</span>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 px-4 py-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل خروج</span>
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative flex w-64 max-w-sm flex-col bg-sidebar h-full right-0">
            <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2" dir="ltr"><img src="/green-delta-logo.svg" alt="Green Delta" className="h-11 w-11 rounded-lg bg-white object-contain ring-1 ring-border" /><div><h1 className="text-base font-heading text-primary font-black tracking-wide">GREEN DELTA</h1><p className="text-[9px] font-bold text-sidebar-foreground">ELEVATORS CO.</p></div></div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-sidebar-foreground">
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              <NavLinks />
            </nav>
            <div className="p-4 border-t border-sidebar-border">
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 px-4 py-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>تسجيل خروج</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden relative z-0">
        {/* Header */}
        <header className="h-16 shrink-0 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 relative z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden text-foreground"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="hidden sm:flex items-center bg-muted rounded-md px-3 py-1.5 w-64 border border-border relative">
              <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
              <input
                type="text"
                placeholder={role === 'technician' ? 'ابحث عن أي مبنى أو مصعد مكلف...' : 'بحث شامل...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-sm text-foreground"
              />
              
              {/* Search Results Dropdown */}
              {searchQuery.trim().length >= 2 && (
                <div className="absolute top-full right-0 mt-2 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden flex flex-col z-50 max-h-64">
                  {isSearching ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">جاري البحث...</div>
                  ) : searchResults.length > 0 ? (
                    <div className="overflow-y-auto">
                      {searchResults.map((res, i) => (
                        res.link ? (
                          <Link key={i} to={res.link} onClick={() => setSearchQuery('')} className="flex items-center justify-between gap-2 p-3 hover:bg-muted border-b border-border last:border-0">
                            <span className="min-w-0"><span className="block text-sm font-medium">{res.title}</span>{res.subtitle && <span className="block text-xs text-muted-foreground truncate">{res.subtitle}</span>}</span>
                            <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-md shrink-0">{res.type}</span>
                          </Link>
                        ) : (
                          <div key={i} className="flex items-center justify-between gap-2 p-3 border-b border-border last:border-0">
                            <span className="min-w-0"><span className="block text-sm font-medium">{res.title}</span>{res.subtitle && <span className="block text-xs text-muted-foreground truncate">{res.subtitle}</span>}</span>
                            <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded-md shrink-0">{res.type}</span>
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-muted text-foreground transition-colors"
              aria-label="تغيير المظهر"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 min-w-0 relative z-0">
          {children}
        </main>
      </div>
    </div>
  );
};
