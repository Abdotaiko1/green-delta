import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowUpDown, Building2, CalendarDays, Droplet, PackageOpen, Wrench, AlertTriangle, WalletCards, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type TimelineItem = {
  id: string;
  date: string;
  type: 'عطل' | 'صيانة' | 'زيت' | 'قطعة غيار';
  title: string;
  details: string;
};

type FinancialEntry = {
  id: string;
  entry_date: string;
  entry_type: 'إيراد' | 'مصروف';
  category: string;
  description: string | null;
  amount: number;
};

const AssetHistory: React.FC = () => {
  const { role } = useAuth();
  const { id = '' } = useParams();
  const location = useLocation();
  const isBuilding = location.pathname.startsWith('/buildings/');
  const [asset, setAsset] = useState<any>(null);
  const [elevators, setElevators] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const filterColumn = isBuilding ? 'building_id' : 'elevator_id';
        const assetQuery = isBuilding
          ? supabase.from('buildings').select('*, maintenance_lines(name)').eq('id', id).single()
          : supabase.from('elevators').select('*, buildings(name, address), maintenance_lines(name)').eq('id', id).single();
        const partsQuery = role === 'technician'
          ? supabase.from('spare_part_replacements').select('id, part_name, part_code_snapshot, replacement_date, quantity_used, invoice_number, technicians(name)').eq(filterColumn, id)
          : supabase.from('spare_part_replacements').select('id, part_name, part_code_snapshot, replacement_date, price, quantity_used, invoice_number, technicians(name), inventory(part_code)').eq(filterColumn, id);

        const [assetRes, faultsRes, maintenanceRes, oilRes, partsRes, elevatorsRes, financeRes] = await Promise.all([
          assetQuery,
          supabase.from('faults').select('id, report_number, description, status, created_at').eq(filterColumn, id),
          supabase.from('maintenance').select('id, type, visit_date, notes, status, payment_collected, price, technicians(name)').eq(filterColumn, id),
          supabase.from('oil_records').select('id, oil_type, oil_brand, change_date, next_change_date').eq(filterColumn, id),
          partsQuery,
          isBuilding ? supabase.from('elevators').select('id, elevator_code, elevator_number, elevator_name, status, maintenance_subscription, next_maintenance_date').eq('building_id', id) : Promise.resolve({ data: [], error: null }),
          role === 'technician' ? Promise.resolve({ data: [], error: null }) : supabase.from('elevator_financial_entries').select('id, entry_date, entry_type, category, description, amount').eq(filterColumn, id).order('entry_date', { ascending: false }),
        ]);

        if (assetRes.error) throw assetRes.error;
        setAsset(assetRes.data);
        setElevators(elevatorsRes.data || []);
        setFinancialEntries((financeRes.data || []) as FinancialEntry[]);

        const items: TimelineItem[] = [
          ...(faultsRes.data || []).map((row: any) => ({
            id: `fault-${row.id}`,
            date: row.created_at,
            type: 'عطل' as const,
            title: `${row.report_number} — ${row.status}`,
            details: row.description,
          })),
          ...(maintenanceRes.data || []).map((row: any) => ({
            id: `maintenance-${row.id}`,
            date: row.visit_date,
            type: 'صيانة' as const,
            title: `صيانة ${row.type} — ${row.payment_collected ? 'تم التحصيل' : 'بدون تحصيل'}`,
            details: `${row.technicians?.name ? `الفني: ${row.technicians.name} — ` : ''}${row.notes || 'بدون ملاحظات'}${role === 'technician' ? '' : ` — المبلغ: ${Number(row.price || 0).toLocaleString('ar-EG')} ج.م`}`,
          })),
          ...(oilRes.data || []).map((row: any) => ({
            id: `oil-${row.id}`,
            date: row.change_date,
            type: 'زيت' as const,
            title: `${row.oil_type} — ${row.oil_brand}`,
            details: `التغيير القادم: ${row.next_change_date}`,
          })),
          ...(partsRes.data || []).map((row: any) => ({
            id: `part-${row.id}`,
            date: row.replacement_date,
            type: 'قطعة غيار' as const,
            title: `${row.part_code_snapshot || row.inventory?.part_code ? `${row.part_code_snapshot || row.inventory?.part_code} — ` : ''}${row.part_name}`,
            details: `الكمية: ${row.quantity_used || 1}${role === 'technician' ? '' : ` — السعر: ${row.price}`} — الفني: ${row.technicians?.name || '-'}${row.invoice_number ? ` — فاتورة ${row.invoice_number}` : ''}`,
          })),
        ];
        setTimeline(items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch (error: any) {
        toast.error(error.message || 'تعذر تحميل سجل البيانات');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [id, isBuilding, role]);

  const counts = useMemo(() => ({
    faults: timeline.filter((item) => item.type === 'عطل').length,
    maintenance: timeline.filter((item) => item.type === 'صيانة').length,
    oil: timeline.filter((item) => item.type === 'زيت').length,
    parts: timeline.filter((item) => item.type === 'قطعة غيار').length,
  }), [timeline]);

  const financialTotals = useMemo(() => {
    const revenue = financialEntries.filter((entry) => entry.entry_type === 'إيراد').reduce((total, entry) => total + Number(entry.amount || 0), 0);
    const expenses = financialEntries.filter((entry) => entry.entry_type === 'مصروف').reduce((total, entry) => total + Number(entry.amount || 0), 0);
    return { revenue, expenses, profit: revenue - expenses };
  }, [financialEntries]);

  const formatMoney = (value: number) => `${value.toLocaleString('ar-EG')} ج.م`;

  if (loading) return <div className="py-12 text-center text-muted-foreground">جاري تحميل السجل...</div>;
  if (!asset) return <div className="py-12 text-center">السجل غير موجود</div>;

  const title = isBuilding ? asset.name : (asset.elevator_name || `مصعد رقم ${asset.elevator_number}`);
  const maintenanceDays = asset.next_maintenance_date
    ? Math.ceil((new Date(`${asset.next_maintenance_date}T12:00:00`).getTime() - Date.now()) / 86400000)
    : null;
  const buildingMaintenanceAlerts = elevators.filter((elevator) => {
    if (!elevator.next_maintenance_date) return false;
    const days = Math.ceil((new Date(`${elevator.next_maintenance_date}T12:00:00`).getTime() - Date.now()) / 86400000);
    return days <= 20;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {isBuilding ? <Building2 className="w-6 h-6" /> : <ArrowUpDown className="w-6 h-6" />}
            سجل {title}
          </h2>
          {(asset.building_code || asset.elevator_code) && <div className="mt-1 font-mono text-xs font-bold text-primary">{asset.building_code || asset.elevator_code}</div>}
          <p className="text-muted-foreground">{isBuilding ? asset.address : `${asset.buildings?.name || ''}${asset.brand ? ` — ${asset.brand}` : ''}`} {asset.maintenance_lines?.name ? `— ${asset.maintenance_lines.name}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to={`/oil?${isBuilding ? 'building' : 'elevator'}=${id}`}><Droplet className="w-4 h-4 ml-1" /> تسجيل زيت</Link></Button>
          <Button asChild><Link to={`/spare-parts?${isBuilding ? 'building' : 'elevator'}=${id}`}><PackageOpen className="w-4 h-4 ml-1" /> تغيير قطعة</Link></Button>
        </div>
      </div>

      {!isBuilding && (
        <Card>
          <CardHeader><CardTitle>بيانات الصيانة والتشغيل</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">نوع الاشتراك</span><div className="font-bold">{asset.maintenance_subscription || '-'}</div></div>
            {role !== 'technician' && <div><span className="text-muted-foreground">سعر الصيانة</span><div className="font-bold">{asset.maintenance_price ?? '-'}</div></div>}
            <div><span className="text-muted-foreground">بداية الصيانة</span><div className="font-bold">{asset.maintenance_start_date || '-'}</div></div>
            <div><span className="text-muted-foreground">آخر صيانة</span><div className="font-bold">{asset.last_maintenance_date || '-'}</div></div>
            <div><span className="text-muted-foreground">الصيانة القادمة</span><div className="font-bold">{asset.next_maintenance_date || '-'}</div></div>
            <div><span className="text-muted-foreground">مقاس الوايرات</span><div className="font-bold">{asset.wire_size || '-'}</div></div>
            <div><span className="text-muted-foreground">عدد الوقفات</span><div className="font-bold">{asset.stops_count ?? '-'}</div></div>
            <div><span className="text-muted-foreground">بداية التشغيل</span><div className="font-bold">{asset.operation_start_date || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع الماكينة</span><div className="font-bold">{asset.machine_type || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع كراسي ك</span><div className="font-bold">{asset.chair_k_type || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع كراسي ت</span><div className="font-bold">{asset.chair_t_type || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع التقل</span><div className="font-bold">{asset.counterweight_type || '-'}</div></div>
            <div><span className="text-muted-foreground">الزراير الداخلية</span><div className="font-bold">{asset.interior_buttons_shape || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع الكالون</span><div className="font-bold">{asset.lock_type || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع الشدادات</span><div className="font-bold">{asset.tensioner_type || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع الطلمبات</span><div className="font-bold">{asset.pump_type || '-'}</div></div>
            <div><span className="text-muted-foreground">نوع الكارتة</span><div className="font-bold">{asset.controller_board_type || '-'}</div></div>
            <div><span className="text-muted-foreground">الطوارئ</span><div className="font-bold">{asset.has_emergency == null ? '-' : asset.has_emergency ? 'نعم' : 'لا'}</div></div>
            <div><span className="text-muted-foreground">فاز كوريكت</span><div className="font-bold">{asset.has_phase_correct == null ? '-' : asset.has_phase_correct ? 'نعم' : 'لا'}</div></div>
            <div><span className="text-muted-foreground">إنفرتر</span><div className="font-bold">{asset.has_inverter == null ? '-' : asset.has_inverter ? 'نعم' : 'لا'}</div></div>
          </CardContent>
        </Card>
      )}

      {!isBuilding && maintenanceDays !== null && maintenanceDays <= 20 && (
        <div className={`rounded-md border p-4 font-bold ${maintenanceDays < 0 ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-warning/40 bg-warning/10 text-warning'}`}>
          تنبيه الصيانة: {maintenanceDays < 0 ? `الموعد متأخر ${Math.abs(maintenanceDays)} يوم` : `متبقي ${maintenanceDays} يوم على موعد الصيانة`}
        </div>
      )}

      {!isBuilding && role !== 'technician' && (
        <Card>
          <CardHeader><CardTitle className="flex gap-2"><WalletCards className="w-5 h-5" /> الملف المالي للمصعد</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border p-4"><div className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="w-4 h-4 text-success" /> إجمالي الإيرادات</div><div className="text-xl font-bold text-success mt-1">{formatMoney(financialTotals.revenue)}</div></div>
              <div className="rounded-md border p-4"><div className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="w-4 h-4 text-destructive" /> إجمالي المصروفات</div><div className="text-xl font-bold text-destructive mt-1">{formatMoney(financialTotals.expenses)}</div></div>
              <div className="rounded-md border p-4"><div className="text-sm text-muted-foreground">صافي الأرباح</div><div className={`text-xl font-bold mt-1 ${financialTotals.profit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatMoney(financialTotals.profit)}</div></div>
            </div>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">الحركة</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">البيان</TableHead><TableHead className="text-right">المبلغ</TableHead></TableRow></TableHeader>
                <TableBody>{financialEntries.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد حركات مالية بعد. عند إتمام الصيانة سيُضاف السعر تلقائيًا.</TableCell></TableRow> : financialEntries.map((entry) => <TableRow key={entry.id}>
                  <TableCell>{entry.entry_date}</TableCell>
                  <TableCell><span className={entry.entry_type === 'إيراد' ? 'text-success font-bold' : 'text-destructive font-bold'}>{entry.entry_type}</span></TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>{entry.description || '-'}</TableCell>
                  <TableCell className="font-bold">{formatMoney(Number(entry.amount || 0))}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {isBuilding && buildingMaintenanceAlerts.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 font-bold text-warning">
          تنبيه: يوجد {buildingMaintenanceAlerts.length} مصعد موعد صيانته خلال 20 يومًا أو متأخر.
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2"><AlertTriangle className="w-4 h-4" /> الأعطال</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.faults}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2"><Wrench className="w-4 h-4" /> الصيانة</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.maintenance}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2"><Droplet className="w-4 h-4" /> الزيت</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.oil}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex gap-2"><PackageOpen className="w-4 h-4" /> قطع الغيار</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.parts}</CardContent></Card>
      </div>

      {isBuilding && elevators.length > 0 && (
        <Card>
          <CardHeader><CardTitle>مصاعد المبنى</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {elevators.map((elevator) => <Button key={elevator.id} variant="outline" asChild><Link to={`/elevators/${elevator.id}`}>{elevator.elevator_code ? `${elevator.elevator_code} — ` : ''}{elevator.elevator_name || `مصعد ${elevator.elevator_number}`} — {elevator.maintenance_subscription || '-'} — {elevator.next_maintenance_date || 'بدون موعد'}</Link></Button>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex gap-2"><CalendarDays className="w-5 h-5" /> السجل الزمني الكامل</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">البيان</TableHead><TableHead className="text-right">التفاصيل</TableHead></TableRow></TableHeader>
            <TableBody>
              {timeline.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد حركة مسجلة حتى الآن</TableCell></TableRow> : timeline.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{new Date(item.date).toLocaleDateString('ar-EG')}</TableCell>
                  <TableCell><span className="px-2 py-1 rounded-full bg-muted text-xs font-bold">{item.type}</span></TableCell>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>{item.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetHistory;
