import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRow } from '@/lib/database';
import BuildingCombobox from '@/components/BuildingCombobox';

type Fault = {
  id: string;
  report_number: string;
  building_id: string;
  elevator_id: string;
  description: string;
  priority: 'عالية' | 'متوسطة' | 'منخفضة';
  technician_id: string | null;
  status: 'مفتوح' | 'قيد المعالجة' | 'مغلق';
  repair_status: 'تم الإصلاح' | 'ما زال عاطل';
  fault_cause: string | null;
  buildings?: { name: string };
  elevators?: { elevator_number: number; elevator_name?: string };
  technicians?: { name: string };
};

type AssignedTask = {
  id: string;
  notes: string | null;
  target_type: 'خط' | 'مصعد';
  fault_result: 'تم الإصلاح' | 'ما زال عاطل' | null;
  fault_cause: string | null;
  technicians?: { name: string };
  maintenance_lines?: { name: string } | null;
  elevators?: { elevator_number: number; elevator_name?: string; buildings?: { name: string } } | null;
};

const Faults: React.FC = () => {
  const { role, user, can } = useAuth();
  const [faults, setFaults] = useState<Fault[]>([]);
  const [buildings, setBuildings] = useState<{ id: string, name: string }[]>([]);
  const [elevators, setElevators] = useState<{ id: string, elevator_number: number, elevator_name?: string, building_id: string }[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string, name: string, status: string }[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resultDialog, setResultDialog] = useState<{ open: boolean; kind: 'fault' | 'task'; id: string; repair_status: 'تم الإصلاح' | 'ما زال عاطل'; fault_cause: string }>({ open: false, kind: 'fault', id: '', repair_status: 'ما زال عاطل', fault_cause: '' });
  const [savingResult, setSavingResult] = useState(false);
  
  const [formData, setFormData] = useState({
    building_id: '',
    elevator_id: '',
    description: '',
    priority: 'متوسطة',
    technician_id: '',
    status: 'مفتوح',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      
      let query = supabase.from('faults').select('*, buildings(name), elevators(elevator_number, elevator_name), technicians(name)').order('created_at', { ascending: false });
      
      if (role === 'technician' && user) {
        const { data: techData } = await supabase.from('technicians').select('id').eq('user_id', user.id).single();
        if (techData) {
          query = query.eq('technician_id', techData.id);
        }
      }

      const [faultsRes, bRes, eRes, tRes, tasksRes] = await Promise.all([
        query,
        supabase.from('buildings').select('id, name'),
        supabase.from('elevators').select('id, elevator_number, elevator_name, building_id'),
        supabase.from('technicians').select('id, name, status'),
        supabase.from('technician_tasks').select('id, notes, target_type, fault_result, fault_cause, technicians(name), maintenance_lines(name), elevators(elevator_number, elevator_name, buildings(name))').eq('task_type', 'عطل').order('created_at', { ascending: false })
      ]);
      
      if (faultsRes.error) throw faultsRes.error;
      if (tasksRes.error) throw tasksRes.error;
      
      setFaults(faultsRes.data as any);
      setBuildings(bRes.data || []);
      setElevators(eRes.data || []);
      setTechnicians(tRes.data || []);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ 
      building_id: '', 
      elevator_id: '', 
      description: '', 
      priority: 'متوسطة', 
      technician_id: '', 
      status: 'مفتوح' 
    });
    setIsModalOpen(true);
  };

  const openEditModal = (fault: Fault) => {
    setEditingId(fault.id);
    setFormData({
      building_id: fault.building_id,
      elevator_id: fault.elevator_id,
      description: fault.description,
      priority: fault.priority,
      technician_id: fault.technician_id || '',
      status: fault.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.building_id || !formData.elevator_id) {
      toast.error('الرجاء اختيار المبنى والمصعد');
      return;
    }

    try {
      let finalStatus = formData.status;
      if (formData.technician_id && formData.status === 'مفتوح') {
        finalStatus = 'قيد المعالجة';
      }

      const payload = {
        ...formData,
        technician_id: formData.technician_id || null,
        status: finalStatus,
        report_number: editingId ? undefined : `F-${Date.now().toString().slice(-6)}`
      };
      
      // Remove report_number if editing
      if (editingId) delete payload.report_number;

      if (editingId) {
        const { error } = await supabase.from('faults').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('تم التحديث بنجاح');
      } else {
        const { error } = await supabase.from('faults').insert([payload]);
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
    if (!window.confirm('هل أنت متأكد من حذف هذا البلاغ؟')) return;
    try {
      await deleteRow('faults', id);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء الحذف');
    }
  };

  const openResultDialog = (kind: 'fault' | 'task', row: Fault | AssignedTask) => {
    const status = kind === 'fault' ? (row as Fault).repair_status : (row as AssignedTask).fault_result;
    setResultDialog({
      open: true,
      kind,
      id: row.id,
      repair_status: status || 'ما زال عاطل',
      fault_cause: row.fault_cause || '',
    });
  };

  const openCompleteDialog = (kind: 'fault' | 'task', row: Fault | AssignedTask) => {
    setResultDialog({
      open: true,
      kind,
      id: row.id,
      repair_status: 'تم الإصلاح',
      fault_cause: row.fault_cause || '',
    });
  };

  const saveFaultResult = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resultDialog.fault_cause.trim()) {
      toast.error('سبب العطل إجباري');
      return;
    }
    try {
      setSavingResult(true);
      let error;
      if (role === 'technician') {
        const functionName = resultDialog.kind === 'fault' ? 'technician_set_fault_result' : 'technician_set_fault_task_result';
        const idParameter = resultDialog.kind === 'fault' ? { p_fault_id: resultDialog.id } : { p_task_id: resultDialog.id };
        ({ error } = await supabase.rpc(functionName, {
          ...idParameter,
          p_repair_status: resultDialog.repair_status,
          p_fault_cause: resultDialog.fault_cause.trim(),
        }));
      } else if (resultDialog.kind === 'fault') {
        ({ error } = await supabase.from('faults').update({
          repair_status: resultDialog.repair_status,
          fault_cause: resultDialog.fault_cause.trim(),
          status: resultDialog.repair_status === 'تم الإصلاح' ? 'مغلق' : 'قيد المعالجة',
          repaired_at: resultDialog.repair_status === 'تم الإصلاح' ? new Date().toISOString() : null,
        }).eq('id', resultDialog.id));
      } else {
        ({ error } = await supabase.from('technician_tasks').update({
          fault_result: resultDialog.repair_status,
          fault_cause: resultDialog.fault_cause.trim(),
          status: resultDialog.repair_status === 'تم الإصلاح' ? 'تمت' : 'مكلف',
          completed_at: resultDialog.repair_status === 'تم الإصلاح' ? new Date().toISOString() : null,
        }).eq('id', resultDialog.id));
      }
      if (error) throw error;
      toast.success(resultDialog.repair_status === 'تم الإصلاح' ? 'تم تسجيل إصلاح العطل' : 'تم تسجيل أن العطل ما زال قائمًا');
      setResultDialog((current) => ({ ...current, open: false }));
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر حفظ نتيجة العطل');
    } finally {
      setSavingResult(false);
    }
  };

  const filteredFaults = faults.filter(f => 
    f.report_number.includes(search) || 
    (f.buildings?.name || '').includes(search) ||
    f.description.includes(search)
  );

  const remainingFaults = filteredFaults.filter((fault) => fault.repair_status !== 'تم الإصلاح');
  const completedFaults = filteredFaults.filter((fault) => fault.repair_status === 'تم الإصلاح');

  const getPriorityColor = (p: string) => {
    if (p === 'عالية') return 'text-destructive font-bold';
    if (p === 'متوسطة') return 'text-warning font-bold';
    return 'text-success font-bold';
  };

  const getStatusBadge = (status: string) => {
    if (status === 'مفتوح') return 'bg-destructive/20 text-destructive';
    if (status === 'قيد المعالجة') return 'bg-warning/20 text-warning';
    return 'bg-success/20 text-success';
  };

  const availableElevators = elevators.filter(e => e.building_id === formData.building_id);

  const renderFaultsTable = (rows: Fault[], completed: boolean) => (
    <div className="bg-card rounded-md border overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead className="text-right">رقم البلاغ</TableHead>
          <TableHead className="text-right">المبنى / المصعد</TableHead>
          <TableHead className="text-right">وصف العطل</TableHead>
          <TableHead className="text-right">الأولوية</TableHead>
          <TableHead className="text-right">الفني المعين</TableHead>
          <TableHead className="text-right">{completed ? 'سبب العطل' : 'الحالة'}</TableHead>
          <TableHead className="text-right w-40">إجراءات</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
          : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{completed ? 'لا توجد أعطال تم إصلاحها' : 'لا توجد أعطال متبقية'}</TableCell></TableRow>
          : rows.map((fault) => <TableRow key={fault.id} className={completed ? 'bg-success/5' : ''}>
            <TableCell className="font-medium dir-ltr text-right">{fault.report_number}</TableCell>
            <TableCell><div className="flex flex-col"><span>{fault.buildings?.name}</span><span className="text-xs text-muted-foreground">مصعد: {fault.elevators?.elevator_name ? `${fault.elevators.elevator_name} (${fault.elevators.elevator_number})` : fault.elevators?.elevator_number}</span></div></TableCell>
            <TableCell className="max-w-[200px] truncate" title={fault.description}>{fault.description}</TableCell>
            <TableCell className={getPriorityColor(fault.priority)}>{fault.priority}</TableCell>
            <TableCell>{fault.technicians?.name || <span className="text-muted-foreground">-</span>}</TableCell>
            <TableCell>{completed
              ? <span title={fault.fault_cause || ''}>{fault.fault_cause || '—'}</span>
              : <span className="px-2 py-1 rounded-full text-xs font-semibold bg-warning/20 text-warning">ما زال عاطل</span>}
            </TableCell>
            <TableCell><div className="flex items-center gap-2">
              {!completed && can('faults', 'update') && <Button size="sm" onClick={() => openCompleteDialog('fault', fault)} className="bg-emerald-600 text-white hover:bg-emerald-700" title="تأكيد إصلاح العطل"><CheckCircle2 className="w-4 h-4 ml-1" /> تم الإصلاح</Button>}
              {can('faults', 'update') && <Button variant="ghost" size="icon" onClick={() => role === 'technician' ? openResultDialog('fault', fault) : openEditModal(fault)} title="تعديل"><Edit className="w-4 h-4 text-primary" /></Button>}
              {can('faults', 'delete') && <Button variant="ghost" size="icon" onClick={() => handleDelete(fault.id)} title="حذف"><Trash2 className="w-4 h-4 text-destructive" /></Button>}
            </div></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة الأعطال</h2>
          <p className="text-muted-foreground">متابعة بلاغات الأعطال وتعيين الفنيين.</p>
        </div>
        {can('faults', 'create') && (
          <Button onClick={openAddModal} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            إضافة بلاغ عطل
          </Button>
        )}
      </div>

      {assignedTasks.length > 0 && (
        <div className="bg-card rounded-md border p-4 space-y-3">
          <h3 className="font-bold">مهام الأعطال المكلف بها</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{role === 'manager' && <TableHead className="text-right">الفني</TableHead>}<TableHead className="text-right">الهدف</TableHead><TableHead className="text-right">الملاحظات</TableHead><TableHead className="text-right">النتيجة</TableHead><TableHead className="text-right">سبب العطل</TableHead>{role === 'technician' && <TableHead className="text-right">تحديث</TableHead>}</TableRow></TableHeader>
              <TableBody>{assignedTasks.map((task) => (
                <TableRow key={task.id}>
                  {role === 'manager' && <TableCell>{task.technicians?.name}</TableCell>}
                  <TableCell>{task.target_type === 'خط' ? task.maintenance_lines?.name : `${task.elevators?.buildings?.name || ''} — ${task.elevators?.elevator_name || `مصعد ${task.elevators?.elevator_number || ''}`}`}</TableCell>
                  <TableCell>{task.notes || '—'}</TableCell>
                  <TableCell><span className={task.fault_result === 'تم الإصلاح' ? 'text-success font-bold' : 'text-warning font-bold'}>{task.fault_result || 'ما زال عاطل'}</span></TableCell>
                  <TableCell>{task.fault_cause || '—'}</TableCell>
                  {role === 'technician' && <TableCell><Button size="sm" onClick={() => openResultDialog('task', task)}>تسجيل النتيجة</Button></TableCell>}
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
          placeholder="بحث برقم البلاغ أو المبنى..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-sm"
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold flex items-center gap-2"><AlertCircle className="w-5 h-5 text-warning" /> الأعطال المتبقية</h3><span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-bold text-warning">{remainingFaults.length}</span></div>
        {renderFaultsTable(remainingFaults, false)}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-success" /> الأعطال التي تم إصلاحها</h3><span className="rounded-full bg-success/15 px-3 py-1 text-sm font-bold text-success">{completedFaults.length}</span></div>
        {renderFaultsTable(completedFaults, true)}
      </section>

      <Dialog open={resultDialog.open} onOpenChange={(open) => setResultDialog((current) => ({ ...current, open }))}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">تأكيد إصلاح العطل</DialogTitle></DialogHeader>
          <form onSubmit={saveFaultResult} className="space-y-4">
            {resultDialog.repair_status !== 'تم الإصلاح' && <div className="space-y-2">
              <Label>حالة العطل</Label>
              <select value={resultDialog.repair_status} onChange={(event) => setResultDialog((current) => ({ ...current, repair_status: event.target.value as 'تم الإصلاح' | 'ما زال عاطل' }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="ما زال عاطل">ما زال عاطل</option>
                <option value="تم الإصلاح">تم الإصلاح</option>
              </select>
            </div>}
            <div className="space-y-2">
              <Label>سبب العطل *</Label>
              <Input value={resultDialog.fault_cause} onChange={(event) => setResultDialog((current) => ({ ...current, fault_cause: event.target.value }))} placeholder="اكتب سبب العطل بالتفصيل" required />
            </div>
            <DialogFooter><Button type="submit" disabled={savingResult} className="bg-emerald-600 text-white hover:bg-emerald-700">{savingResult ? 'جاري الحفظ...' : 'تأكيد أن العطل تم إصلاحه'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingId ? 'تعديل بلاغ العطل' : 'إضافة بلاغ عطل'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبنى</Label>
                <BuildingCombobox
                  buildings={buildings}
                  value={formData.building_id}
                  disabled={role !== 'manager' && !!editingId}
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
                  disabled={(role !== 'manager' && !!editingId) || !formData.building_id}
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
              <Label>وصف العطل (اختياري)</Label>
              <Input 
                name="description" 
                value={formData.description} 
                onChange={handleInputChange} 
                placeholder="يمكن تركه فارغًا"
                disabled={role !== 'manager' && !!editingId}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الأولوية</Label>
                <select 
                  name="priority" 
                  value={formData.priority} 
                  onChange={handleInputChange} 
                  required
                  disabled={role !== 'manager' && !!editingId}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                >
                  <option value="عالية">عالية</option>
                  <option value="متوسطة">متوسطة</option>
                  <option value="منخفضة">منخفضة</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>الحالة</Label>
                <select 
                  name="status" 
                  value={formData.status} 
                  onChange={handleInputChange} 
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="مفتوح">مفتوح</option>
                  <option value="قيد المعالجة">قيد المعالجة</option>
                  <option value="مغلق">مغلق</option>
                </select>
              </div>
            </div>

            {role === 'manager' && (
              <div className="space-y-2">
                <Label>تعيين فني</Label>
                <select 
                  name="technician_id" 
                  value={formData.technician_id} 
                  onChange={handleInputChange} 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">بدون تعيين</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id} disabled={t.status === 'إجازة'}>
                      {t.name} {t.status === 'إجازة' ? '(في إجازة)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">حفظ التغييرات</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Faults;
