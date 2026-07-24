import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type AuditEntry = {
  id: string;
  action: 'إضافة' | 'تعديل' | 'حذف';
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
};

const tableLabels: Record<string, string> = {
  buildings: 'المباني', elevators: 'المصاعد', customers: 'العملاء', technicians: 'الفنيون',
  faults: 'الأعطال', maintenance: 'الصيانة', maintenance_lines: 'خطوط الصيانة', inventory: 'المخزن',
  oil_records: 'الزيت', spare_part_replacements: 'قطع الغيار', elevator_financial_entries: 'المالية',
  technician_tasks: 'تكليفات الفنيين', technician_buildings: 'مباني الفنيين', purchase_requests: 'طلبات الشراء',
  maintenance_invoices: 'فواتير الصيانة الشهرية',
};

const ignoredKeys = new Set(['id', 'created_at', 'updated_at']);
const stringifyValue = (value: unknown) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

const AuditLog: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('الكل');
  const [actionFilter, setActionFilter] = useState('الكل');
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) toast.error(error.message || 'تعذر تحميل سجل الحركات');
    else setEntries((data || []) as unknown as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const filtered = useMemo(() => entries.filter((entry) => {
    const matchesTable = tableFilter === 'الكل' || entry.table_name === tableFilter;
    const matchesAction = actionFilter === 'الكل' || entry.action === actionFilter;
    const text = search.trim().toLowerCase();
    const matchesSearch = !text || [entry.user_name, tableLabels[entry.table_name], entry.record_id]
      .some((value) => String(value || '').toLowerCase().includes(text));
    return matchesTable && matchesAction && matchesSearch;
  }), [entries, tableFilter, actionFilter, search]);

  const changes = selected ? Array.from(new Set([
    ...Object.keys(selected.old_data || {}), ...Object.keys(selected.new_data || {}),
  ])).filter((key) => !ignoredKeys.has(key) && stringifyValue(selected.old_data?.[key]) !== stringifyValue(selected.new_data?.[key])) : [];

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6" /> سجل الحركات</h2><p className="text-muted-foreground">متابعة كل إضافة أو تعديل أو حذف ومن قام بها.</p></div>
      <Button variant="outline" onClick={fetchEntries}><RefreshCw className="ml-2 h-4 w-4" /> تحديث</Button>
    </div>

    <div className="grid gap-3 md:grid-cols-3">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالمستخدم أو القسم..." />
      <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="الكل">كل الأقسام</option>{Object.entries(tableLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="الكل">كل العمليات</option><option value="إضافة">إضافة</option><option value="تعديل">تعديل</option><option value="حذف">حذف</option></select>
    </div>

    <Card><CardContent className="overflow-x-auto p-0"><Table>
      <TableHeader><TableRow><TableHead className="text-right">الوقت</TableHead><TableHead className="text-right">المستخدم</TableHead><TableHead className="text-right">العملية</TableHead><TableHead className="text-right">القسم</TableHead><TableHead className="text-right">التفاصيل</TableHead></TableRow></TableHeader>
      <TableBody>{loading ? <TableRow><TableCell colSpan={5} className="py-10 text-center">جاري التحميل...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">لا توجد حركات مطابقة</TableCell></TableRow> : filtered.map((entry) => <TableRow key={entry.id}>
        <TableCell className="whitespace-nowrap">{new Date(entry.created_at).toLocaleString('ar-EG')}</TableCell>
        <TableCell className="font-medium">{entry.user_name || 'النظام'}</TableCell>
        <TableCell><span className={`rounded-full px-2 py-1 text-xs font-bold ${entry.action === 'إضافة' ? 'bg-success/15 text-success' : entry.action === 'حذف' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>{entry.action}</span></TableCell>
        <TableCell>{tableLabels[entry.table_name] || entry.table_name}</TableCell>
        <TableCell><Button variant="ghost" size="sm" onClick={() => setSelected(entry)}><Eye className="ml-1 h-4 w-4" /> عرض</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent></Card>

    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto" dir="rtl"><DialogHeader><DialogTitle className="text-right">تفاصيل الحركة</DialogTitle></DialogHeader>
      {selected && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-md bg-muted p-3 text-sm"><div>المستخدم: <strong>{selected.user_name || 'النظام'}</strong></div><div>القسم: <strong>{tableLabels[selected.table_name] || selected.table_name}</strong></div><div>العملية: <strong>{selected.action}</strong></div><div>الوقت: <strong>{new Date(selected.created_at).toLocaleString('ar-EG')}</strong></div></div>
      {changes.length === 0 ? <p className="text-muted-foreground">تم تسجيل العملية دون تغييرات حقول قابلة للعرض.</p> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead className="text-right">الحقل</TableHead><TableHead className="text-right">قبل</TableHead><TableHead className="text-right">بعد</TableHead></TableRow></TableHeader><TableBody>{changes.map((key) => <TableRow key={key}><TableCell className="font-mono text-xs">{key}</TableCell><TableCell className="max-w-52 break-words">{stringifyValue(selected.old_data?.[key])}</TableCell><TableCell className="max-w-52 break-words">{stringifyValue(selected.new_data?.[key])}</TableCell></TableRow>)}</TableBody></Table></div>}</div>}
    </DialogContent></Dialog>
  </div>;
};

export default AuditLog;
