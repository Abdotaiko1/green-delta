import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, CheckCircle2, CalendarDays, Route, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRow } from '@/lib/database';
import BuildingCombobox from '@/components/BuildingCombobox';

type Maintenance = {
  id: string;
  type: 'دورية' | 'طارئة';
  building_id: string;
  elevator_id: string;
  visit_date: string;
  technician_id: string;
  notes: string;
  status?: 'مجدولة' | 'تمت' | 'ملغاة';
  price?: number;
  payment_collected?: boolean;
  buildings?: { name: string };
  elevators?: { elevator_number: number; elevator_name?: string };
  technicians?: { name: string };
};

type ElevatorPlan = {
  id: string;
  elevator_number: number;
  elevator_name?: string;
  building_id: string;
  maintenance_line_id: string;
  maintenance_subscription: string;
  maintenance_price: number | null;
  maintenance_start_date: string | null;
};

type PlanDraft = {
  visit_date: string;
  technician_id: string;
  payment_collected: boolean;
  notes: string;
};
type MaintenanceLine = { id: string; name: string };
type PlanBuilding = { id: string; name: string; maintenance_line_id: string };
type AssignedTask = {
  id: string;
  notes: string | null;
  target_type: 'خط' | 'مصعد';
  technicians?: { name: string };
  maintenance_lines?: { name: string } | null;
  elevators?: { elevator_number: number; elevator_name?: string; buildings?: { name: string } } | null;
};
type MaintenanceInvoice = {
  id: string;
  invoice_number: string;
  invoice_month: string;
  building_id: string;
  elevators_count: number;
  amount: number;
  status: 'غير محصلة' | 'تم التحصيل';
  collected_at: string | null;
  collected_by_name: string | null;
  buildings?: { name: string } | null;
};

const MaintenanceView: React.FC = () => {
  const { role, user, can } = useAuth();
  const [maintenanceList, setMaintenanceList] = useState<Maintenance[]>([]);
  const [buildings, setBuildings] = useState<PlanBuilding[]>([]);
  const [elevators, setElevators] = useState<ElevatorPlan[]>([]);
  const [maintenanceLines, setMaintenanceLines] = useState<MaintenanceLine[]>([]);
  const [newLineName, setNewLineName] = useState('');
  const [savingLine, setSavingLine] = useState(false);
  const [technicians, setTechnicians] = useState<{ id: string, name: string, status: string }[]>([]);
  const [currentTechnicianId, setCurrentTechnicianId] = useState('');
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [invoices, setInvoices] = useState<MaintenanceInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [collectingInvoice, setCollectingInvoice] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [planSearch, setPlanSearch] = useState('');
  const [visitSearch, setVisitSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [completingElevator, setCompletingElevator] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    type: 'دورية',
    building_id: '',
    elevator_id: '',
    visit_date: '',
    technician_id: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      
      let query = supabase.from('maintenance').select('*, buildings(name), elevators(elevator_number, elevator_name), technicians(name)').order('visit_date', { ascending: false });
      
      if (role === 'technician' && user) {
        const { data: techData } = await supabase.from('technicians').select('id').eq('user_id', user.id).single();
        if (techData) {
          setCurrentTechnicianId(techData.id);
          query = query.eq('technician_id', techData.id);
        }
      } else {
        setCurrentTechnicianId('');
      }

      const buildingsQuery = role === 'technician'
        ? supabase.rpc('technician_maintenance_building_options')
        : supabase.from('buildings').select('id, name, maintenance_line_id');
      const elevatorsQuery = role === 'technician'
        ? supabase.rpc('technician_maintenance_elevator_options')
        : supabase.from('elevators').select('id, elevator_number, elevator_name, building_id, maintenance_line_id, maintenance_subscription, maintenance_price, maintenance_start_date').order('elevator_number');

      const [mRes, bRes, eRes, tRes, linesRes, tasksRes] = await Promise.all([
        query,
        buildingsQuery,
        elevatorsQuery,
        supabase.from('technicians').select('id, name, status'),
        supabase.from('maintenance_lines').select('id, name').order('name'),
        supabase.from('technician_tasks').select('id, notes, target_type, technicians(name), maintenance_lines(name), elevators(elevator_number, elevator_name, buildings(name))').eq('task_type', 'صيانة').order('created_at', { ascending: false }),
      ]);
      
      if (mRes.error) throw mRes.error;
      
      setMaintenanceList(mRes.data as any);
      if (bRes.error) throw bRes.error;
      if (eRes.error) throw eRes.error;
      setBuildings((bRes.data || []) as PlanBuilding[]);
      setElevators((eRes.data || []) as ElevatorPlan[]);
      setTechnicians(tRes.data || []);
      if (linesRes.error) throw linesRes.error;
      setMaintenanceLines(linesRes.data || []);
      if (tasksRes.error) throw tasksRes.error;
      setAssignedTasks((tasksRes.data || []) as any);
    } catch (error: any) {
      toast.error('خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role, user]);

  const fetchInvoices = async () => {
    if (role === 'technician') {
      setInvoices([]);
      return;
    }
    setInvoicesLoading(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (selectedMonth <= currentMonth) {
        const { error: generateError } = await supabase.rpc('generate_monthly_maintenance_invoices', { p_month: `${selectedMonth}-01` });
        if (generateError) throw generateError;
      }
      const start = `${selectedMonth}-01`;
      const next = new Date(`${start}T00:00:00`);
      next.setMonth(next.getMonth() + 1);
      const { data, error } = await supabase.from('maintenance_invoices')
        .select('*, buildings(name)')
        .gte('invoice_month', start)
        .lt('invoice_month', next.toISOString().slice(0, 10))
        .order('created_at');
      if (error) throw error;
      setInvoices((data || []) as unknown as MaintenanceInvoice[]);
    } catch (error: any) {
      setInvoices([]);
      toast.error(error.message || 'تعذر تحميل فواتير الصيانة الشهرية');
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [selectedMonth, role]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ 
      type: 'دورية',
      building_id: '', 
      elevator_id: '', 
      visit_date: new Date().toISOString().split('T')[0],
      technician_id: '', 
      notes: '' 
    });
    setIsModalOpen(true);
  };

  const openEditModal = (m: Maintenance) => {
    setEditingId(m.id);
    setFormData({
      type: m.type,
      building_id: m.building_id,
      elevator_id: m.elevator_id,
      visit_date: m.visit_date,
      technician_id: m.technician_id,
      notes: m.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.building_id || !formData.elevator_id || !formData.technician_id) {
      toast.error('الرجاء تعبئة جميع الحقول المطلوبة');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase.from('maintenance').update(formData).eq('id', editingId);
        if (error) throw error;
        toast.success('تم التحديث بنجاح');
      } else {
        const { error } = await supabase.from('maintenance').insert([formData]);
        if (error) throw error;
        toast.success('تمت الإضافة بنجاح');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف سجل الصيانة هذا؟')) return;
    try {
      await deleteRow('maintenance', id);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء الحذف');
    }
  };

  const addMaintenanceLine = async () => {
    const name = newLineName.trim();
    if (!name) {
      toast.error('اكتب اسم الخط أولاً');
      return;
    }
    setSavingLine(true);
    try {
      const { error } = await supabase.from('maintenance_lines').insert([{ name }]);
      if (error) throw error;
      setNewLineName('');
      toast.success(`تمت إضافة خط ${name}`);
      await fetchData();
    } catch (error: any) {
      toast.error(error.code === '23505' ? 'اسم الخط موجود بالفعل' : error.message || 'تعذر إضافة الخط');
    } finally {
      setSavingLine(false);
    }
  };

  const deleteMaintenanceLine = async (line: MaintenanceLine) => {
    if (buildings.some((building) => building.maintenance_line_id === line.id)) {
      toast.error('لا يمكن حذف خط مرتبط بمبانٍ. انقل المباني إلى خط آخر أولاً.');
      return;
    }
    if (!window.confirm(`حذف خط ${line.name}؟`)) return;
    try {
      await deleteRow('maintenance_lines', line.id);
      toast.success('تم حذف الخط');
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر حذف الخط');
    }
  };

  const filteredList = useMemo(() => {
    const value = visitSearch.trim().toLocaleLowerCase('ar');
    if (!value) return maintenanceList;
    return maintenanceList.filter((visit) => [
      visit.type,
      visit.buildings?.name,
      visit.elevators?.elevator_name,
      visit.elevators?.elevator_number,
      visit.visit_date,
      visit.technicians?.name,
      visit.notes,
      visit.status,
      visit.payment_collected ? 'تم التحصيل' : 'بدون تحصيل',
    ].some((field) => String(field ?? '').toLocaleLowerCase('ar').includes(value)));
  }, [maintenanceList, visitSearch]);

  const availableElevators = elevators.filter(e => e.building_id === formData.building_id);

  const defaultVisitDate = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return selectedMonth === currentMonth ? new Date().toISOString().slice(0, 10) : `${selectedMonth}-01`;
  }, [selectedMonth]);

  const getPlanDraft = (elevatorId: string): PlanDraft => planDrafts[elevatorId] || {
    visit_date: defaultVisitDate,
    technician_id: role === 'technician'
      ? currentTechnicianId
      : technicians.find((technician) => technician.status !== 'إجازة')?.id || '',
    payment_collected: false,
    notes: '',
  };

  const updatePlanDraft = (elevatorId: string, patch: Partial<PlanDraft>) => {
    setPlanDrafts((current) => ({
      ...current,
      [elevatorId]: { ...getPlanDraft(elevatorId), ...patch },
    }));
  };

  const visitsByElevator = useMemo(() => {
    const rows = maintenanceList.filter((row) => row.status === 'تمت' && row.visit_date?.startsWith(selectedMonth));
    const grouped = new Map<string, Maintenance[]>();
    rows.forEach((row) => {
      grouped.set(row.elevator_id, [...(grouped.get(row.elevator_id) || []), row]);
    });
    return grouped;
  }, [maintenanceList, selectedMonth]);

  const visiblePlanLines = useMemo(() => maintenanceLines.map((line) => ({
    ...line,
    buildings: buildings.filter((building) => building.maintenance_line_id === line.id).map((building) => ({
      ...building,
      elevators: elevators.filter((elevator) => elevator.building_id === building.id).filter((elevator) => {
        const value = planSearch.trim();
        return !value || line.name.includes(value) || building.name.includes(value) || String(elevator.elevator_number).includes(value) || (elevator.elevator_name || '').includes(value);
      }),
    })).filter((building) => building.elevators.length > 0),
  })).filter((line) => line.buildings.length > 0), [maintenanceLines, buildings, elevators, planSearch]);

  const completeMaintenance = async (elevator: ElevatorPlan) => {
    const draft = getPlanDraft(elevator.id);
    const technicianId = role === 'technician' ? currentTechnicianId : draft.technician_id;
    if (!draft.visit_date || !technicianId) {
      toast.error('اختر تاريخ الصيانة والفني أولاً');
      return;
    }
    if (!draft.visit_date.startsWith(selectedMonth)) {
      toast.error('تاريخ الصيانة يجب أن يكون داخل الشهر المختار');
      return;
    }

    setCompletingElevator(elevator.id);
    try {
      const { error } = await supabase.rpc('complete_maintenance_visit', {
        p_elevator_id: elevator.id,
        p_visit_date: draft.visit_date,
        p_technician_id: role === 'technician' ? null : technicianId,
        p_notes: draft.notes.trim() || `صيانة شهر ${selectedMonth}`,
        p_payment_collected: draft.payment_collected,
      });
      if (error) throw error;
      toast.success(draft.payment_collected
        ? 'تم تسجيل الزيارة والتحصيل وإضافة الإيراد للمالية'
        : 'تم تسجيل الزيارة بدون تحصيل');
      setPlanDrafts((current) => ({
        ...current,
        [elevator.id]: {
          visit_date: draft.visit_date,
          technician_id: draft.technician_id,
          payment_collected: false,
          notes: '',
        },
      }));
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر إتمام الصيانة');
    } finally {
      setCompletingElevator(null);
    }
  };

  const collectInvoice = async (invoice: MaintenanceInvoice) => {
    if (!window.confirm(`تأكيد تحصيل فاتورة ${invoice.buildings?.name || ''} بمبلغ ${Number(invoice.amount).toLocaleString('ar-EG')} ج.م؟`)) return;
    setCollectingInvoice(invoice.id);
    try {
      const { error } = await supabase.rpc('collect_maintenance_invoice', { p_invoice_id: invoice.id });
      if (error) throw error;
      toast.success('تم تحصيل الصيانة وإضافتها إلى الإيرادات');
      await fetchInvoices();
    } catch (error: any) {
      toast.error(error.message || 'تعذر تحصيل الفاتورة');
    } finally {
      setCollectingInvoice(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة الصيانة</h2>
          <p className="text-muted-foreground">جدولة ومتابعة الصيانة الدورية والطارئة للمصاعد.</p>
        </div>
        {can('maintenance', 'create') && (
          <Button onClick={openAddModal} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            إضافة سجل صيانة
          </Button>
        )}
      </div>

      {(can('maintenance', 'create') || can('maintenance', 'delete')) && (
        <div className="bg-card rounded-md border p-4 space-y-4">
          <div>
            <h3 className="font-bold flex items-center gap-2"><Route className="w-5 h-5" /> خطوط الصيانة</h3>
            <p className="text-sm text-muted-foreground">أضف خطوطًا مثل أكتوبر أو حدائق الأهرام أو فيصل، ثم اربط بها المباني والمصاعد.</p>
          </div>
          {can('maintenance', 'create') && <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
            <Input value={newLineName} onChange={(event) => setNewLineName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addMaintenanceLine(); } }} placeholder="اسم الخط الجديد" />
            <Button onClick={addMaintenanceLine} disabled={savingLine}><Plus className="w-4 h-4 ml-1" /> {savingLine ? 'جاري الإضافة...' : 'إضافة خط'}</Button>
          </div>}
          <div className="flex flex-wrap gap-2">
            {maintenanceLines.length === 0 ? <span className="text-sm text-muted-foreground">لا توجد خطوط بعد</span> : maintenanceLines.map((line) => (
              <div key={line.id} className="flex items-center gap-2 rounded-full border bg-muted/40 py-1 pr-3 pl-1">
                <span className="text-sm font-medium">{line.name}</span>
                {can('maintenance', 'delete') && <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => deleteMaintenanceLine(line)} title="حذف الخط"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {assignedTasks.length > 0 && (
        <div className="bg-card rounded-md border p-4 space-y-3">
          <h3 className="font-bold">مهام الصيانة المكلف بها</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{role === 'manager' && <TableHead className="text-right">الفني</TableHead>}<TableHead className="text-right">الهدف</TableHead><TableHead className="text-right">الملاحظات</TableHead></TableRow></TableHeader>
              <TableBody>{assignedTasks.map((task) => (
                <TableRow key={task.id}>
                  {role === 'manager' && <TableCell>{task.technicians?.name}</TableCell>}
                  <TableCell>{task.target_type === 'خط' ? task.maintenance_lines?.name : `${task.elevators?.buildings?.name || ''} — ${task.elevators?.elevator_name || `مصعد ${task.elevators?.elevator_number || ''}`}`}</TableCell>
                  <TableCell>{task.notes || '—'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
        <input
          type="text"
          placeholder="بحث في الخطة بالخط أو المبنى أو المصعد..."
          value={planSearch}
          onChange={(e) => setPlanSearch(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-sm"
        />
      </div>

      {role !== 'technician' && <div className="rounded-md border bg-card overflow-hidden">
        <div className="border-b p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h3 className="font-bold flex items-center gap-2"><ReceiptText className="w-5 h-5" /> فواتير الصيانة الشهرية</h3><p className="text-sm text-muted-foreground">تُنشأ فاتورة لكل عمارة تلقائيًا أول مرة تفتح فيها الشهر، وقيمتها مجموع أسعار صيانة مصاعدها.</p></div>
          <div className="flex flex-wrap items-center gap-3 text-sm"><Input type="month" value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setPlanDrafts({}); }} className="w-44" /><span>الإجمالي: <strong>{invoices.reduce((sum, row) => sum + Number(row.amount || 0), 0).toLocaleString('ar-EG')} ج.م</strong></span><span className="text-warning">غير محصل: <strong>{invoices.filter((row) => row.status === 'غير محصلة').reduce((sum, row) => sum + Number(row.amount || 0), 0).toLocaleString('ar-EG')} ج.م</strong></span></div>
        </div>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-right">رقم الفاتورة</TableHead><TableHead className="text-right">الشهر</TableHead><TableHead className="text-right">العمارة</TableHead><TableHead className="text-right">عدد المصاعد</TableHead><TableHead className="text-right">المبلغ</TableHead><TableHead className="text-right">التحصيل</TableHead><TableHead className="text-right">إجراء</TableHead></TableRow></TableHeader>
          <TableBody>{invoicesLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">جاري تجهيز فواتير الشهر...</TableCell></TableRow> : invoices.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">لا توجد فواتير لهذا الشهر</TableCell></TableRow> : invoices.map((invoice) => <TableRow key={invoice.id}>
            <TableCell className="font-mono text-xs">{invoice.invoice_number}</TableCell><TableCell>{invoice.invoice_month.slice(0, 7)}</TableCell><TableCell className="font-medium">{invoice.buildings?.name || '—'}</TableCell><TableCell>{invoice.elevators_count}</TableCell><TableCell className="font-bold">{Number(invoice.amount).toLocaleString('ar-EG')} ج.م</TableCell>
            <TableCell>{invoice.status === 'تم التحصيل' ? <div className="text-success"><span className="inline-flex items-center gap-1 font-bold"><CheckCircle2 className="w-4 h-4" /> تم التحصيل</span><div className="text-xs">{invoice.collected_at ? new Date(invoice.collected_at).toLocaleString('ar-EG') : ''}{invoice.collected_by_name ? ` — ${invoice.collected_by_name}` : ''}</div></div> : <span className="font-bold text-warning">غير محصلة</span>}</TableCell>
            <TableCell>{invoice.status === 'تم التحصيل' ? <CheckCircle2 className="w-6 h-6 text-success" /> : can('maintenance', 'update') ? <Button onClick={() => collectInvoice(invoice)} disabled={collectingInvoice === invoice.id} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="ml-1 w-4 h-4" /> {collectingInvoice === invoice.id ? 'جاري التحصيل...' : 'تحصيل الصيانة'}</Button> : <span className="text-muted-foreground">غير مسموح</span>}</TableCell>
          </TableRow>)}</TableBody></Table></div>
      </div>}

      <div className="bg-card rounded-md border overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div>
            <h3 className="font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5" /> خطة الصيانة الشهرية</h3>
            <p className="text-sm text-muted-foreground">كل المصاعد تظهر تلقائيًا حسب الخط والمبنى. يمكنك تسجيل أكثر من زيارة للمصعد في نفس الشهر.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="plan-month" className="whitespace-nowrap">الشهر</Label>
            <Input id="plan-month" type="month" value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setPlanDrafts({}); }} className="w-44" />
          </div>
        </div>
        <div className="divide-y">
          {loading ? <div className="p-8 text-center text-muted-foreground">جاري تجهيز الخطة...</div> : visiblePlanLines.length === 0 ? <div className="p-8 text-center text-muted-foreground">لا توجد مصاعد مطابقة</div> : visiblePlanLines.map((line) => (
            <div key={line.id} className="border-b last:border-b-0">
              <div className="px-4 py-3 bg-primary/10 text-primary font-bold flex items-center gap-2"><Route className="w-4 h-4" /> {line.name} — {line.buildings.length} مبنى</div>
              {line.buildings.map((building) => <div key={building.id}>
              <div className="px-4 py-3 bg-muted/50 font-bold">{building.name} — {building.elevators.length} مصعد</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">المصعد</TableHead>
                    <TableHead className="text-right">الاشتراك</TableHead>
                    {role !== 'technician' && <TableHead className="text-right">السعر</TableHead>}
                    <TableHead className="text-right">البداية</TableHead>
                    <TableHead className="text-right">زيارات الشهر</TableHead>
                    <TableHead className="text-right">تاريخ الزيارة الجديدة</TableHead>
                    <TableHead className="text-right">الفني</TableHead>
                    <TableHead className="text-right">التحصيل</TableHead>
                    <TableHead className="text-right">ملاحظات الزيارة</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{building.elevators.map((elevator) => {
                    const visits = visitsByElevator.get(elevator.id) || [];
                    const draft = getPlanDraft(elevator.id);
                    return <TableRow key={elevator.id}>
                      <TableCell className="font-medium">{elevator.elevator_name || `مصعد ${elevator.elevator_number}`}</TableCell>
                      <TableCell>{elevator.maintenance_subscription || '-'}</TableCell>
                      {role !== 'technician' && <TableCell>{Number(elevator.maintenance_price || 0).toLocaleString('ar-EG')}</TableCell>}
                      <TableCell>{elevator.maintenance_start_date || '-'}</TableCell>
                      <TableCell>
                        <div className="min-w-64 space-y-1.5">
                          {visits.length === 0 ? <span className="text-sm text-muted-foreground">لا توجد زيارات هذا الشهر</span> : visits.map((visit, index) => (
                            <div key={visit.id} className="rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
                              <div className="font-bold">زيارة {visits.length - index}: {visit.visit_date} — {visit.technicians?.name || '-'}</div>
                              <div className={visit.payment_collected ? 'text-success font-bold' : 'text-warning font-bold'}>
                                {visit.payment_collected
                                  ? role === 'technician'
                                    ? 'تم التحصيل'
                                    : `تم التحصيل — ${Number(visit.price || 0).toLocaleString('ar-EG')} ج.م`
                                  : 'بدون تحصيل'}
                              </div>
                              {visit.notes && <div className="mt-0.5 text-muted-foreground">{visit.notes}</div>}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell><Input type="date" value={draft.visit_date} onChange={(event) => updatePlanDraft(elevator.id, { visit_date: event.target.value })} className="min-w-36" /></TableCell>
                      <TableCell>{role === 'technician' ? technicians.find((technician) => technician.id === currentTechnicianId)?.name || '-' : <select value={draft.technician_id} onChange={(event) => updatePlanDraft(elevator.id, { technician_id: event.target.value })} className="flex h-10 min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">اختر الفني</option>{technicians.map((technician) => <option key={technician.id} value={technician.id} disabled={technician.status === 'إجازة'}>{technician.name}{technician.status === 'إجازة' ? ' (إجازة)' : ''}</option>)}</select>}</TableCell>
                      <TableCell><select value={draft.payment_collected ? 'collected' : 'not_collected'} onChange={(event) => updatePlanDraft(elevator.id, { payment_collected: event.target.value === 'collected' })} className="flex h-10 min-w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="not_collected">بدون تحصيل</option><option value="collected">تم التحصيل</option></select></TableCell>
                      <TableCell><Input value={draft.notes} onChange={(event) => updatePlanDraft(elevator.id, { notes: event.target.value })} placeholder="ملاحظات اختيارية" className="min-w-44" /></TableCell>
                      <TableCell>{can('maintenance', 'update') ? <Button onClick={() => completeMaintenance(elevator)} disabled={completingElevator === elevator.id}><CheckCircle2 className="ml-1 h-4 w-4" />{completingElevator === elevator.id ? 'جاري الحفظ...' : 'تمت الصيانة'}</Button> : <span className="text-muted-foreground">غير مسموح</span>}</TableCell>
                    </TableRow>;
                  })}</TableBody>
                </Table>
              </div>
            </div>)}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-md border overflow-hidden">
        <div className="border-b p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5" /> سجل الزيارات</h3>
            <p className="text-sm text-muted-foreground">البحث يشمل المبنى والمصعد والفني والتاريخ والملاحظات.</p>
          </div>
          <div className="flex items-center rounded-md border bg-background px-3 py-2 w-full md:max-w-md">
            <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
            <input type="search" value={visitSearch} onChange={(event) => setVisitSearch(event.target.value)} placeholder="ابحث في الزيارات..." className="bg-transparent border-none outline-none w-full text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">المبنى / المصعد</TableHead>
              <TableHead className="text-right">تاريخ الزيارة</TableHead>
              <TableHead className="text-right">الفني</TableHead>
              <TableHead className="text-right">الملاحظات</TableHead>
              <TableHead className="text-right">التحصيل</TableHead>
              <TableHead className="text-right">{role === 'technician' ? 'الحالة' : 'الحالة / السعر'}</TableHead>
              {(can('maintenance', 'update') || can('maintenance', 'delete')) && <TableHead className="text-right w-24">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={role === 'manager' ? 8 : 7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            ) : filteredList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={role === 'manager' ? 8 : 7} className="text-center py-8 text-muted-foreground">لا يوجد مطابقة</TableCell>
              </TableRow>
            ) : (
              filteredList.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${m.type === 'طارئة' ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}`}>
                      {m.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{m.buildings?.name}</span>
                      <span className="text-xs text-muted-foreground">
                        مصعد: {m.elevators?.elevator_name ? `${m.elevators.elevator_name} (${m.elevators.elevator_number})` : m.elevators?.elevator_number}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="dir-ltr text-right">{m.visit_date}</TableCell>
                  <TableCell>{m.technicians?.name}</TableCell>
                  <TableCell className="max-w-[150px] truncate" title={m.notes}>{m.notes || '-'}</TableCell>
                  <TableCell><span className={m.payment_collected ? 'text-success font-bold' : 'text-warning font-bold'}>{m.payment_collected ? 'تم التحصيل' : 'بدون تحصيل'}</span></TableCell>
                  <TableCell><div className="text-sm"><span className={m.status === 'تمت' ? 'text-success font-bold' : 'text-muted-foreground'}>{m.status || 'مجدولة'}</span>{role !== 'technician' && <div>{Number(m.price || 0).toLocaleString('ar-EG')}</div>}</div></TableCell>
                  {(can('maintenance', 'update') || can('maintenance', 'delete')) && <TableCell>
                    <div className="flex items-center gap-2">
                      {can('maintenance', 'update') && <Button variant="ghost" size="icon" onClick={() => openEditModal(m)}>
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>}
                      {can('maintenance', 'delete') && <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>}
                    </div>
                  </TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingId ? 'تعديل سجل صيانة' : 'إضافة سجل صيانة'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>نوع الصيانة</Label>
                <select 
                  name="type" 
                  value={formData.type} 
                  onChange={handleInputChange} 
                  required
                  disabled={role !== 'manager'}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                >
                  <option value="دورية">دورية</option>
                  <option value="طارئة">طارئة</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>تاريخ الزيارة</Label>
                <Input 
                  type="date" 
                  name="visit_date" 
                  value={formData.visit_date} 
                  onChange={handleInputChange} 
                  required 
                  disabled={role !== 'manager' && !!editingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبنى</Label>
                <BuildingCombobox
                  buildings={buildings}
                  value={formData.building_id}
                  disabled={role !== 'manager'}
                  onChange={(buildingId) => setFormData((current) => ({
                    ...current,
                    building_id: buildingId,
                    elevator_id: elevators.find((elevator) => elevator.building_id === buildingId)?.id || '',
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>المصعد</Label>
                <select 
                  name="elevator_id" 
                  value={formData.elevator_id} 
                  onChange={handleInputChange} 
                  required
                  disabled={role !== 'manager' || !formData.building_id}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                >
                  <option value="" disabled>اختر المصعد</option>
                  {availableElevators.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.elevator_name ? `${e.elevator_name} (${e.elevator_number})` : e.elevator_number}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>الفني المعين</Label>
              <select 
                name="technician_id" 
                value={formData.technician_id} 
                onChange={handleInputChange} 
                required
                disabled={role !== 'manager'}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
              >
                <option value="" disabled>اختر الفني</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id} disabled={t.status === 'إجازة'}>
                    {t.name} {t.status === 'إجازة' ? '(في إجازة)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>الملاحظات (اختياري)</Label>
              <Input name="notes" value={formData.notes} onChange={handleInputChange} />
            </div>

            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">حفظ التغييرات</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaintenanceView;
