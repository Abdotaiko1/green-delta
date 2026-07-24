import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, ArrowUpDown, Wrench, AlertTriangle, ClipboardList, Users, Droplet, Timer, Trophy, CircleDollarSign, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';

type ProfitRow = { id: string; name: string; revenue: number; expenses: number; profit: number };
type ChartRow = { name: string; month: string; أعطال: number; صيانة: number };

const money = (value: number) => `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;

const Dashboard: React.FC = () => {
  const { role, user } = useAuth();
  const [stats, setStats] = useState({ buildings: 0, elevators: 0, technicians: 0, openFaults: 0, maintenanceToday: 0, maintenanceDue: 0, customers: 0, oilDue: 0 });
  const [kpis, setKpis] = useState({ delayedFaults: 0, averageRepairHours: 0, fastestTechnician: 'لا توجد بيانات', uncollectedAmount: 0 });
  const [profits, setProfits] = useState<{ buildings: ProfitRow[]; elevators: ProfitRow[]; lines: ProfitRow[] }>({ buildings: [], elevators: [], lines: [] });
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);
        const maintenanceLimit = new Date();
        maintenanceLimit.setDate(maintenanceLimit.getDate() + 20);
        const oilLimit = new Date();
        oilLimit.setDate(oilLimit.getDate() + 30);
        let nextStats = { buildings: 0, elevators: 0, technicians: 0, openFaults: 0, maintenanceToday: 0, maintenanceDue: 0, customers: 0, oilDue: 0 };

        if (role === 'manager' || role === 'accountant') {
          const [buildingsRes, elevatorsRes, customersRes] = await Promise.all([
            supabase.from('buildings').select('*', { count: 'exact', head: true }),
            supabase.from('elevators').select('*', { count: 'exact', head: true }),
            supabase.from('customers').select('*', { count: 'exact', head: true }),
          ]);
          nextStats = { ...nextStats, buildings: buildingsRes.count || 0, elevators: elevatorsRes.count || 0, customers: customersRes.count || 0 };
        }

        if (role === 'manager') {
          await supabase.rpc('generate_monthly_maintenance_invoices', { p_month: `${today.slice(0, 7)}-01` });
          const [techniciansRes, faultsRes, maintenanceTodayRes, maintenanceDueRes, oilDueRes, allFaultsRes, allMaintenanceRes, invoicesRes, financeRes, buildingsRes, elevatorsRes, linesRes] = await Promise.all([
            supabase.from('technicians').select('*', { count: 'exact', head: true }),
            supabase.from('faults').select('*', { count: 'exact', head: true }).in('status', ['مفتوح', 'قيد المعالجة']),
            supabase.from('maintenance').select('*', { count: 'exact', head: true }).eq('visit_date', today),
            supabase.from('elevators').select('*', { count: 'exact', head: true }).not('next_maintenance_date', 'is', null).lte('next_maintenance_date', maintenanceLimit.toISOString().slice(0, 10)),
            supabase.from('oil_records').select('*', { count: 'exact', head: true }).lte('next_change_date', oilLimit.toISOString().slice(0, 10)),
            supabase.from('faults').select('created_at, repaired_at, repair_status, status, technician_id, technicians(name)'),
            supabase.from('maintenance').select('visit_date, status, price, payment_collected'),
            supabase.from('maintenance_invoices').select('amount, status'),
            supabase.from('elevator_financial_entries').select('entry_type, amount, building_id, elevator_id'),
            supabase.from('buildings').select('id, name, maintenance_line_id'),
            supabase.from('elevators').select('id, elevator_number, elevator_name'),
            supabase.from('maintenance_lines').select('id, name'),
          ]);
          nextStats = { ...nextStats, technicians: techniciansRes.count || 0, openFaults: faultsRes.count || 0, maintenanceToday: maintenanceTodayRes.count || 0, maintenanceDue: maintenanceDueRes.count || 0, oilDue: oilDueRes.count || 0 };

          const faults = (allFaultsRes.data || []) as unknown as Array<{ created_at: string; repaired_at: string | null; repair_status: string | null; status: string; technician_id: string | null; technicians: { name: string } | null }>;
          const maintenance = (allMaintenanceRes.data || []) as Array<{ visit_date: string; status: string; price: number; payment_collected: boolean }>;
          const invoices = (invoicesRes.data || []) as Array<{ amount: number; status: string }>;
          const finance = (financeRes.data || []) as Array<{ entry_type: 'إيراد' | 'مصروف'; amount: number; building_id: string | null; elevator_id: string | null }>;
          const buildings = buildingsRes.data || [];
          const elevators = elevatorsRes.data || [];
          const lines = linesRes.data || [];
          const now = Date.now();
          const completedFaults = faults.filter((fault) => fault.repaired_at && (fault.repair_status === 'تم الإصلاح' || fault.status === 'مغلق'));
          const durations = completedFaults.map((fault) => Math.max(0, new Date(fault.repaired_at as string).getTime() - new Date(fault.created_at).getTime()) / 3_600_000);
          const technicianDurations = new Map<string, number[]>();
          completedFaults.forEach((fault) => {
            const name = fault.technicians?.name;
            if (!name || !fault.repaired_at) return;
            const hours = Math.max(0, new Date(fault.repaired_at).getTime() - new Date(fault.created_at).getTime()) / 3_600_000;
            technicianDurations.set(name, [...(technicianDurations.get(name) || []), hours]);
          });
          const fastest = [...technicianDurations.entries()].map(([name, values]) => ({ name, average: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((a, b) => a.average - b.average)[0];
          setKpis({
            delayedFaults: faults.filter((fault) => !fault.repaired_at && fault.status !== 'مغلق' && now - new Date(fault.created_at).getTime() >= 48 * 3_600_000).length,
            averageRepairHours: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
            fastestTechnician: fastest ? `${fastest.name} — ${fastest.average.toFixed(1)} ساعة` : 'لا توجد بيانات إصلاح كافية',
            uncollectedAmount: invoices.filter((row) => row.status === 'غير محصلة').reduce((sum, row) => sum + Number(row.amount || 0), 0),
          });

          const aggregate = (entities: Array<{ id: string; name: string }>, getEntityId: (entry: typeof finance[number]) => string | null) => entities.map((entity) => {
            const rows = finance.filter((entry) => getEntityId(entry) === entity.id);
            const revenue = rows.filter((entry) => entry.entry_type === 'إيراد').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
            const expenses = rows.filter((entry) => entry.entry_type === 'مصروف').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
            return { ...entity, revenue, expenses, profit: revenue - expenses };
          }).filter((row) => row.revenue !== 0 || row.expenses !== 0).sort((a, b) => b.profit - a.profit);
          const buildingRows = buildings.map((building) => ({ id: building.id, name: building.name }));
          const elevatorRows = elevators.map((elevator) => ({ id: elevator.id, name: elevator.elevator_name || `مصعد ${elevator.elevator_number}` }));
          const buildingLine = new Map(buildings.map((building) => [building.id, building.maintenance_line_id]));
          setProfits({
            buildings: aggregate(buildingRows, (entry) => entry.building_id),
            elevators: aggregate(elevatorRows, (entry) => entry.elevator_id),
            lines: aggregate(lines, (entry) => entry.building_id ? buildingLine.get(entry.building_id) || null : null),
          });
          setChartData(buildMonthlyChart(faults, maintenance));
        } else if (role === 'technician' && user) {
          const { data: techData } = await supabase.from('technicians').select('id').eq('user_id', user.id).single();
          if (techData) {
            const [faultsRes, maintenanceRes] = await Promise.all([
              supabase.from('faults').select('*', { count: 'exact', head: true }).eq('technician_id', techData.id).in('status', ['مفتوح', 'قيد المعالجة']),
              supabase.from('maintenance').select('*', { count: 'exact', head: true }).eq('technician_id', techData.id).eq('visit_date', today),
            ]);
            nextStats = { ...nextStats, openFaults: faultsRes.count || 0, maintenanceToday: maintenanceRes.count || 0 };
          }
        } else if (role === 'accountant') {
          const [faultsRes, maintenanceRes] = await Promise.all([
            supabase.from('faults').select('created_at'),
            supabase.from('maintenance').select('visit_date'),
          ]);
          setChartData(buildMonthlyChart(faultsRes.data || [], maintenanceRes.data || []));
        }
        setStats(nextStats);
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [role, user]);

  if (loading) return <div className="p-8 flex justify-center"><span className="text-muted-foreground">جاري تحميل البيانات...</span></div>;

  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold font-heading text-foreground">نظرة عامة</h2><p className="text-muted-foreground">ملخص مباشر للعمليات والأداء والنتائج المالية.</p></div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {(role === 'manager' || role === 'accountant') && <><StatCard title="إجمالي المباني" value={stats.buildings} icon={<Building2 className="h-4 w-4" />} /><StatCard title="إجمالي المصاعد" value={stats.elevators} icon={<ArrowUpDown className="h-4 w-4" />} /><StatCard title="العملاء" value={stats.customers} icon={<Users className="h-4 w-4" />} /></>}
      {role === 'manager' && <StatCard title="الفنيون" value={stats.technicians} icon={<Wrench className="h-4 w-4" />} />}
      {(role === 'manager' || role === 'technician') && <><StatCard title="أعطال مفتوحة" value={stats.openFaults} icon={<AlertTriangle className="h-4 w-4" />} className="border-warning/50" /><StatCard title="صيانة اليوم" value={stats.maintenanceToday} icon={<ClipboardList className="h-4 w-4" />} className="border-primary/50" /></>}
      {role === 'manager' && <><Link to="/elevators"><StatCard title="صيانة خلال 20 يومًا" value={stats.maintenanceDue} icon={<ClipboardList className="h-4 w-4" />} className="h-full border-orange-500/50" /></Link><Link to="/oil"><StatCard title="زيت خلال 30 يومًا" value={stats.oilDue} icon={<Droplet className="h-4 w-4" />} className="h-full border-sky-500/50" /></Link></>}
    </div>

    {role === 'manager' && <>
      <div><h3 className="text-xl font-bold">مؤشرات أداء المدير</h3><p className="text-sm text-muted-foreground">العطل يُعد متأخرًا إذا ظل مفتوحًا أكثر من 48 ساعة.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="الأعطال المتأخرة" value={kpis.delayedFaults} icon={<AlertTriangle className="h-4 w-4 text-destructive" />} className="border-destructive/50" />
        <StatCard title="متوسط زمن الإصلاح" value={`${kpis.averageRepairHours.toFixed(1)} ساعة`} icon={<Timer className="h-4 w-4" />} />
        <StatCard title="أسرع فني" value={kpis.fastestTechnician} icon={<Trophy className="h-4 w-4 text-amber-500" />} valueClassName="text-lg" />
        <StatCard title="مبالغ صيانة غير محصلة" value={money(kpis.uncollectedAmount)} icon={<CircleDollarSign className="h-4 w-4 text-warning" />} className="border-warning/50" valueClassName="text-xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ProfitTable title="أرباح المباني" rows={profits.buildings} />
        <ProfitTable title="أرباح المصاعد" rows={profits.elevators} />
        <ProfitTable title="أرباح خطوط الصيانة" rows={profits.lines} />
      </div>
    </>}

    {(role === 'manager' || role === 'accountant') && <Card><CardHeader><CardTitle>الأعطال والصيانة خلال آخر 6 أشهر</CardTitle></CardHeader><CardContent className="pl-2"><div className="h-[300px] w-full min-w-0 overflow-hidden"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} dx={-10} /><Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} /><Bar dataKey="صيانة" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /><Bar dataKey="أعطال" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>}
  </div>;
};

const StatCard = ({ title, value, icon, className = '', valueClassName = '' }: { title: string; value: React.ReactNode; icon: React.ReactNode; className?: string; valueClassName?: string }) => <Card className={className}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><span className="text-muted-foreground">{icon}</span></CardHeader><CardContent><div className={`text-2xl font-bold ${valueClassName}`}>{value}</div></CardContent></Card>;

const ProfitTable = ({ title, rows }: { title: string; rows: ProfitRow[] }) => <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-success" /> {title}</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-80 overflow-auto"><Table><TableHeader><TableRow><TableHead className="text-right">الاسم</TableHead><TableHead className="text-right">الإيرادات</TableHead><TableHead className="text-right">المصروفات</TableHead><TableHead className="text-right">الصافي</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">لا توجد حركة مالية</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{money(row.revenue)}</TableCell><TableCell>{money(row.expenses)}</TableCell><TableCell className={row.profit >= 0 ? 'font-bold text-success' : 'font-bold text-destructive'}>{money(row.profit)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>;

function buildMonthlyChart(faults: Array<{ created_at: string }>, maintenance: Array<{ visit_date: string }>): ChartRow[] {
  const formatter = new Intl.DateTimeFormat('ar-EG', { month: 'short' });
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { name: formatter.format(date), month, أعطال: faults.filter((row) => row.created_at?.slice(0, 7) === month).length, صيانة: maintenance.filter((row) => row.visit_date?.slice(0, 7) === month).length };
  });
}

export default Dashboard;
