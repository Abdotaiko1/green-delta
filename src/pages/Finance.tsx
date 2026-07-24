import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Scale, Plus, Trash2, Search } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type Entry = {
  id: string;
  entry_date: string;
  entry_type: 'إيراد' | 'مصروف';
  category: string;
  description: string | null;
  amount: number;
  source_type: string | null;
  maintenance_id: string | null;
  building_id: string | null;
  elevator_id: string | null;
  technician_id: string | null;
  invoice_number: string | null;
  buildings?: { name: string } | null;
  elevators?: { elevator_number: number; elevator_name?: string } | null;
  technicians?: { name: string } | null;
};

const money = (value: number) => `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;

const Finance: React.FC = () => {
  const { can } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [elevators, setElevators] = useState<{ id: string; building_id: string; elevator_number: number; elevator_name?: string }[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [buildingFilter, setBuildingFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: 'مصروف عام', amount: 0, entry_date: new Date().toISOString().slice(0, 10), description: '', building_id: '', elevator_id: '', technician_id: '', invoice_number: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [entriesRes, buildingsRes, elevatorsRes, techniciansRes] = await Promise.all([
        supabase.from('elevator_financial_entries').select('*, buildings(name), elevators(elevator_number, elevator_name), technicians(name)').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('buildings').select('id, name').order('name'),
        supabase.from('elevators').select('id, building_id, elevator_number, elevator_name').order('elevator_number'),
        supabase.from('technicians').select('id, name').order('name'),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (buildingsRes.error) throw buildingsRes.error;
      if (elevatorsRes.error) throw elevatorsRes.error;
      if (techniciansRes.error) throw techniciansRes.error;
      setEntries((entriesRes.data || []) as Entry[]);
      setBuildings(buildingsRes.data || []);
      setElevators(elevatorsRes.data || []);
      setTechnicians(techniciansRes.data || []);
    } catch (error: any) {
      toast.error(error.message || 'تعذر تحميل البيانات المالية');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => entries.filter((entry) => {
    const text = search.trim().toLowerCase();
    return (!month || entry.entry_date.startsWith(month))
      && (!buildingFilter || entry.building_id === buildingFilter)
      && (typeFilter === 'الكل' || entry.entry_type === typeFilter)
      && (!text || [entry.category, entry.description, entry.buildings?.name, entry.elevators?.elevator_name, entry.technicians?.name, entry.invoice_number].some((value) => String(value || '').toLowerCase().includes(text)));
  }), [entries, month, buildingFilter, typeFilter, search]);

  const totals = useMemo(() => {
    const revenue = filtered.filter((row) => row.entry_type === 'إيراد').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenses = filtered.filter((row) => row.entry_type === 'مصروف').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const salaries = filtered.filter((row) => row.entry_type === 'مصروف' && row.category === 'مرتبات').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const parts = filtered.filter((row) => row.entry_type === 'مصروف' && row.category === 'تكلفة قطع غيار').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const oil = filtered.filter((row) => row.entry_type === 'مصروف' && row.category === 'تكلفة زيت').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { revenue, expenses, salaries, parts, oil, net: revenue - expenses };
  }, [filtered]);

  const saveExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.amount <= 0 || !form.description.trim()) {
      toast.error('أدخل المبلغ وبيان المصروف');
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase.from('elevator_financial_entries').insert({
        entry_date: form.entry_date,
        entry_type: 'مصروف',
        category: form.category,
        description: form.description.trim(),
        amount: Number(form.amount),
        building_id: form.building_id || null,
        elevator_id: form.elevator_id || null,
        technician_id: form.technician_id || null,
        invoice_number: form.invoice_number.trim() || null,
        source_type: 'manual',
      });
      if (error) throw error;
      toast.success('تم تسجيل المصروف في الدفتر المالي');
      setDialogOpen(false);
      setForm({ category: 'مصروف عام', amount: 0, entry_date: new Date().toISOString().slice(0, 10), description: '', building_id: '', elevator_id: '', technician_id: '', invoice_number: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر تسجيل المصروف');
    } finally {
      setSaving(false);
    }
  };

  const deleteManual = async (entry: Entry) => {
    if (entry.source_type !== 'manual' || !window.confirm('هل تريد حذف هذا القيد اليدوي؟')) return;
    const { error } = await supabase.from('elevator_financial_entries').delete().eq('id', entry.id).eq('source_type', 'manual');
    if (error) toast.error(error.message); else { toast.success('تم حذف القيد'); fetchData(); }
  };

  const availableElevators = elevators.filter((row) => !form.building_id || row.building_id === form.building_id);
  const summaryCards = [
    { title: 'إجمالي الإيرادات', value: totals.revenue, icon: TrendingUp, className: 'text-success' },
    { title: 'إجمالي المصروفات', value: totals.expenses, icon: TrendingDown, className: 'text-destructive' },
    { title: 'صافي الأرباح', value: totals.net, icon: Scale, className: totals.net >= 0 ? 'text-success' : 'text-destructive' },
    { title: 'المرتبات', value: totals.salaries, icon: Wallet, className: 'text-warning' },
  ];

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row justify-between gap-3 md:items-center">
      <div><h2 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6" /> المالية</h2><p className="text-muted-foreground">دفتر موحد للإيرادات والمصروفات والأرباح والمرتبات.</p></div>
      {can('finance', 'create') && <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 ml-1" /> إضافة مصروف أو مرتب</Button>}
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{summaryCards.map((card) => <Card key={card.title}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><card.icon className={`w-5 h-5 ${card.className}`} />{card.title}</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${card.className}`}>{money(card.value)}</div></CardContent></Card>)}</div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card><CardContent className="pt-5"><div className="text-sm text-muted-foreground">تكلفة قطع الغيار</div><div className="font-bold text-lg">{money(totals.parts)}</div></CardContent></Card>
      <Card><CardContent className="pt-5"><div className="text-sm text-muted-foreground">تكلفة الزيت</div><div className="font-bold text-lg">{money(totals.oil)}</div></CardContent></Card>
      <Card><CardContent className="pt-5"><div className="text-sm text-muted-foreground">مصروفات أخرى</div><div className="font-bold text-lg">{money(totals.expenses - totals.parts - totals.oil - totals.salaries)}</div></CardContent></Card>
    </div>

    <div className="bg-card border rounded-md p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
      <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      <select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">كل المباني</option>{buildings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="الكل">إيرادات ومصروفات</option><option value="إيراد">إيرادات فقط</option><option value="مصروف">مصروفات فقط</option></select>
      <div className="flex items-center border rounded-md px-3"><Search className="w-4 h-4 text-muted-foreground ml-2" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في القيود..." className="bg-transparent outline-none w-full text-sm" /></div>
    </div>

    <div className="bg-card border rounded-md overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">البند</TableHead><TableHead className="text-right">البيان</TableHead><TableHead className="text-right">المبنى / المصعد</TableHead><TableHead className="text-right">المبلغ</TableHead><TableHead className="text-right">المصدر</TableHead><TableHead className="text-right">إجراء</TableHead></TableRow></TableHeader><TableBody>
      {loading ? <TableRow><TableCell colSpan={8} className="text-center py-8">جاري التحميل...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد قيود مطابقة</TableCell></TableRow> : filtered.map((entry) => <TableRow key={entry.id}><TableCell>{entry.entry_date}</TableCell><TableCell><span className={entry.entry_type === 'إيراد' ? 'text-success font-bold' : 'text-destructive font-bold'}>{entry.entry_type}</span></TableCell><TableCell>{entry.category}</TableCell><TableCell>{entry.description || '—'}{entry.technicians?.name && <div className="text-xs text-muted-foreground">{entry.technicians.name}</div>}</TableCell><TableCell>{entry.buildings?.name || 'عام'}{entry.elevators && <div className="text-xs text-muted-foreground">{entry.elevators.elevator_name || `مصعد ${entry.elevators.elevator_number}`}</div>}</TableCell><TableCell className="font-bold">{money(entry.amount)}</TableCell><TableCell>{entry.source_type === 'oil' ? 'زيت' : entry.source_type === 'spare_part' ? 'قطع غيار' : entry.source_type === 'maintenance_invoice' ? 'تحصيل صيانة' : entry.maintenance_id ? 'صيانة' : 'يدوي'}</TableCell><TableCell>{entry.source_type === 'manual' && can('finance', 'delete') && <Button variant="ghost" size="icon" onClick={() => deleteManual(entry)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}</TableCell></TableRow>)}
    </TableBody></Table></div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl"><DialogHeader><DialogTitle className="text-right">إضافة مصروف أو مرتب</DialogTitle></DialogHeader><form onSubmit={saveExpense} className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>نوع المصروف</Label><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, technician_id: event.target.value === 'مرتبات' ? form.technician_id : '' })} className="h-10 w-full rounded-md border bg-background px-3"><option value="مصروف عام">مصروف عام</option><option value="مرتبات">مرتبات</option><option value="مواصلات">مواصلات</option><option value="أدوات ومعدات">أدوات ومعدات</option><option value="إيجار ومرافق">إيجار ومرافق</option><option value="ضرائب ورسوم">ضرائب ورسوم</option></select></div><div className="space-y-2"><Label>التاريخ</Label><Input type="date" value={form.entry_date} onChange={(event) => setForm({ ...form, entry_date: event.target.value })} required /></div></div>
      {form.category === 'مرتبات' && <div className="space-y-2"><Label>الفني (اختياري)</Label><select value={form.technician_id} onChange={(event) => setForm({ ...form, technician_id: event.target.value })} className="h-10 w-full rounded-md border bg-background px-3"><option value="">موظف غير مسجل — اكتب اسمه في البيان</option>{technicians.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>}
      <div className="space-y-2"><Label>المبلغ *</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} required /></div>
      <div className="space-y-2"><Label>البيان *</Label><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="مثال: مرتب شهر يوليو أو فاتورة كهرباء" required /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>المبنى (اختياري)</Label><select value={form.building_id} onChange={(event) => setForm({ ...form, building_id: event.target.value, elevator_id: '' })} className="h-10 w-full rounded-md border bg-background px-3"><option value="">مصروف عام</option>{buildings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div className="space-y-2"><Label>المصعد (اختياري)</Label><select value={form.elevator_id} onChange={(event) => setForm({ ...form, elevator_id: event.target.value })} disabled={!form.building_id} className="h-10 w-full rounded-md border bg-background px-3 disabled:opacity-50"><option value="">بدون مصعد</option>{availableElevators.map((row) => <option key={row.id} value={row.id}>{row.elevator_name || `مصعد ${row.elevator_number}`}</option>)}</select></div></div>
      <div className="space-y-2"><Label>رقم الفاتورة (اختياري)</Label><Input value={form.invoice_number} onChange={(event) => setForm({ ...form, invoice_number: event.target.value })} /></div>
      <DialogFooter><Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ القيد المالي'}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </div>;
};

export default Finance;
