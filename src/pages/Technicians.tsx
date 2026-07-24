import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRow } from '@/lib/database';
import { useAuth } from '@/contexts/AuthContext';

type Technician = {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  specialization: string;
  status: 'متاح' | 'مشغول' | 'إجازة';
  technician_buildings?: { building_id: string }[];
};

type TechnicianTask = {
  id: string;
  technician_id: string;
  task_type: 'عطل' | 'صيانة';
  target_type: 'خط' | 'مصعد';
  notes: string | null;
  status: 'مكلف' | 'تمت';
  created_at: string;
  technicians?: { name: string };
  maintenance_lines?: { name: string } | null;
  elevators?: { elevator_number: number; elevator_name?: string; buildings?: { name: string } } | null;
};

const Technicians: React.FC = () => {
  const { can } = useAuth();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [technicianUsers, setTechnicianUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [maintenanceLines, setMaintenanceLines] = useState<{ id: string; name: string }[]>([]);
  const [elevators, setElevators] = useState<{ id: string; elevator_number: number; elevator_name?: string; buildings?: { name: string } }[]>([]);
  const [tasks, setTasks] = useState<TechnicianTask[]>([]);
  const [taskSearch, setTaskSearch] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ technician_id: '', task_type: 'عطل', target_type: 'مصعد', target_id: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    specialization: '',
    status: 'متاح',
    user_id: '',
    assigned_building_ids: [] as string[],
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [techniciansRes, buildingsRes, usersRes, linesRes, elevatorsRes, tasksRes] = await Promise.all([
        supabase.from('technicians').select('*, technician_buildings(building_id)').order('created_at', { ascending: false }),
        supabase.from('buildings').select('id, name').order('name'),
        supabase.from('users').select('id, full_name').eq('role', 'technician').order('full_name'),
        supabase.from('maintenance_lines').select('id, name').order('name'),
        supabase.from('elevators').select('id, elevator_number, elevator_name, buildings(name)').order('elevator_number'),
        supabase.from('technician_tasks').select('*, technicians(name), maintenance_lines(name), elevators(elevator_number, elevator_name, buildings(name))').order('created_at', { ascending: false }).limit(50),
      ]);
      if (techniciansRes.error) throw techniciansRes.error;
      if (buildingsRes.error) throw buildingsRes.error;
      if (usersRes.error) throw usersRes.error;
      if (linesRes.error) throw linesRes.error;
      if (elevatorsRes.error) throw elevatorsRes.error;
      if (tasksRes.error) throw tasksRes.error;
      setTechnicians((techniciansRes.data || []) as Technician[]);
      setBuildings(buildingsRes.data || []);
      setTechnicianUsers(usersRes.data || []);
      setMaintenanceLines(linesRes.data || []);
      setElevators((elevatorsRes.data || []) as any);
      setTasks((tasksRes.data || []) as any);
    } catch (error: any) {
      toast.error('خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', phone: '', specialization: '', status: 'متاح', user_id: '', assigned_building_ids: [] });
    setIsModalOpen(true);
  };

  const openEditModal = (technician: Technician) => {
    setEditingId(technician.id);
    setFormData({
      name: technician.name,
      phone: technician.phone,
      specialization: technician.specialization,
      status: technician.status,
      user_id: technician.user_id || '',
      assigned_building_ids: technician.technician_buildings?.map((row) => row.building_id) || [],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.user_id) {
      toast.error('اختر حساب تسجيل الدخول الخاص بالفني');
      return;
    }
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        specialization: formData.specialization,
        status: formData.status,
        user_id: formData.user_id,
      };
      let technicianId = editingId;
      if (editingId) {
        const { error } = await supabase.from('technicians').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('technicians').insert([payload]).select('id').single();
        if (error) throw error;
        technicianId = data.id;
      }
      if (technicianId) {
        const { error: deleteError } = await supabase.from('technician_buildings').delete().eq('technician_id', technicianId);
        if (deleteError) throw deleteError;
        if (formData.assigned_building_ids.length) {
          const { error: assignmentError } = await supabase.from('technician_buildings').insert(
            formData.assigned_building_ids.map((buildingId) => ({ technician_id: technicianId, building_id: buildingId })),
          );
          if (assignmentError) throw assignmentError;
        }
      }
      toast.success(editingId ? 'تم تحديث الفني وتكليفاته' : 'تمت إضافة الفني وتكليفاته');
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الفني؟')) return;
    try {
      await deleteRow('technicians', id);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء الحذف');
    }
  };

  const taskTargets = (taskForm.target_type === 'خط'
    ? maintenanceLines.map((line) => ({ id: line.id, label: line.name }))
    : elevators.map((elevator) => ({
        id: elevator.id,
        label: `${elevator.buildings?.name || 'مبنى غير محدد'} — ${elevator.elevator_name || `مصعد ${elevator.elevator_number}`}`,
      })))
    .filter((target) => target.label.toLowerCase().includes(taskSearch.trim().toLowerCase()));

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskForm.technician_id || !taskForm.target_id) {
      toast.error('اختر الفني والخط أو المصعد');
      return;
    }
    try {
      setSavingTask(true);
      const { error } = await supabase.from('technician_tasks').insert({
        technician_id: taskForm.technician_id,
        task_type: taskForm.task_type,
        target_type: taskForm.target_type,
        maintenance_line_id: taskForm.target_type === 'خط' ? taskForm.target_id : null,
        elevator_id: taskForm.target_type === 'مصعد' ? taskForm.target_id : null,
        notes: taskForm.notes.trim() || null,
      });
      if (error) throw error;
      toast.success('تم تكليف الفني بالمهمة');
      setTaskForm({ technician_id: '', task_type: 'عطل', target_type: 'مصعد', target_id: '', notes: '' });
      setTaskSearch('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر حفظ التكليف');
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!window.confirm('هل تريد حذف هذا التكليف؟')) return;
    try {
      await deleteRow('technician_tasks', id);
      toast.success('تم حذف التكليف');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر حذف التكليف');
    }
  };

  const taskTargetLabel = (task: TechnicianTask) => task.target_type === 'خط'
    ? task.maintenance_lines?.name || 'خط محذوف'
    : `${task.elevators?.buildings?.name || 'مبنى غير محدد'} — ${task.elevators?.elevator_name || `مصعد ${task.elevators?.elevator_number || ''}`}`;

  const filteredTechnicians = technicians.filter(t => 
    t.name.includes(search) || t.specialization.includes(search) || t.status.includes(search)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'متاح': return 'bg-success/20 text-success';
      case 'مشغول': return 'bg-warning/20 text-warning';
      case 'إجازة': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة الفنيين</h2>
          <p className="text-muted-foreground">عرض وإدارة بيانات فنيي الصيانة وحالتهم.</p>
        </div>
        {can('technicians', 'create') && <Button onClick={openAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          إضافة فني
        </Button>}
      </div>

      <div className="bg-card rounded-md border p-4 space-y-4">
        <div>
          <h3 className="text-lg font-bold">تكليف مهام</h3>
          <p className="text-sm text-muted-foreground">اختر الفني ونوع المهمة ثم ابحث داخل الخطوط أو المصاعد.</p>
        </div>
        {can('technicians', 'create') && <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={taskForm.technician_id} onChange={(e) => setTaskForm((current) => ({ ...current, technician_id: e.target.value }))} required className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="">اختر الفني</option>
            {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
          </select>
          <select value={taskForm.task_type} onChange={(e) => setTaskForm((current) => ({ ...current, task_type: e.target.value as 'عطل' | 'صيانة' }))} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="عطل">عطل</option>
            <option value="صيانة">صيانة</option>
          </select>
          <select value={taskForm.target_type} onChange={(e) => { setTaskForm((current) => ({ ...current, target_type: e.target.value as 'خط' | 'مصعد', target_id: '' })); setTaskSearch(''); }} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="مصعد">مصعد</option>
            <option value="خط">خط</option>
          </select>
          <Input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder={`بحث داخلي عن ${taskForm.target_type}...`} />
          <select value={taskForm.target_id} onChange={(e) => setTaskForm((current) => ({ ...current, target_id: e.target.value }))} required className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2">
            <option value="">اختر {taskForm.target_type}</option>
            {taskTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
          <Input value={taskForm.notes} onChange={(e) => setTaskForm((current) => ({ ...current, notes: e.target.value }))} placeholder="ملاحظات المهمة (اختياري)" />
          <Button type="submit" disabled={savingTask}>{savingTask ? 'جاري الحفظ...' : 'تكليف المهمة'}</Button>
        </form>}

        {tasks.length > 0 && (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead className="text-right">الفني</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الخط / المصعد</TableHead><TableHead className="text-right">ملاحظات</TableHead><TableHead className="text-right">حذف</TableHead></TableRow></TableHeader>
              <TableBody>{tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{task.technicians?.name}</TableCell><TableCell>{task.task_type}</TableCell><TableCell>{taskTargetLabel(task)}</TableCell><TableCell>{task.notes || '—'}</TableCell>
                  <TableCell>{can('technicians', 'delete') && <Button variant="ghost" size="icon" onClick={() => handleDeleteTask(task.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
        <input
          type="text"
          placeholder="بحث بالاسم أو التخصص..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-sm"
        />
      </div>

      <div className="bg-card rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">الهاتف</TableHead>
              <TableHead className="text-right">التخصص</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">المباني المكلف بها</TableHead>
              <TableHead className="text-right w-24">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            ) : filteredTechnicians.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد مطابقة</TableCell>
              </TableRow>
            ) : (
              filteredTechnicians.map((technician) => (
                <TableRow key={technician.id}>
                  <TableCell className="font-medium">{technician.name}</TableCell>
                  <TableCell className="dir-ltr text-right">{technician.phone}</TableCell>
                  <TableCell>{technician.specialization}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(technician.status)}`}>
                      {technician.status}
                    </span>
                  </TableCell>
                  <TableCell>{technician.technician_buildings?.length || 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {can('technicians', 'update') && <Button variant="ghost" size="icon" onClick={() => openEditModal(technician)}>
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>}
                      {can('technicians', 'delete') && <Button variant="ghost" size="icon" onClick={() => handleDelete(technician.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingId ? 'تعديل فني' : 'إضافة فني جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>حساب تسجيل الدخول *</Label>
              <select name="user_id" value={formData.user_id} onChange={handleInputChange} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="" disabled>اختر حساب الفني</option>
                {technicianUsers.map((account) => <option key={account.id} value={account.id}>{account.full_name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">أنشئ الحساب أولًا من Supabase Authentication ثم أضفه إلى جدول users بدور technician.</p>
            </div>
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input name="name" value={formData.name} onChange={handleInputChange} required />
            </div>
            <div className="space-y-2">
              <Label>الهاتف</Label>
              <Input name="phone" value={formData.phone} onChange={handleInputChange} required className="dir-ltr text-right" />
            </div>
            <div className="space-y-2">
              <Label>التخصص</Label>
              <Input name="specialization" value={formData.specialization} onChange={handleInputChange} required />
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
                <option value="متاح">متاح</option>
                <option value="مشغول">مشغول</option>
                <option value="إجازة">إجازة</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>المباني المكلف بها</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {buildings.length === 0 ? <span className="text-sm text-muted-foreground">لا توجد مبانٍ</span> : buildings.map((building) => (
                  <label key={building.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={formData.assigned_building_ids.includes(building.id)} onChange={(event) => setFormData((current) => ({ ...current, assigned_building_ids: event.target.checked ? [...current.assigned_building_ids, building.id] : current.assigned_building_ids.filter((id) => id !== building.id) }))} />
                    {building.name}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">{editingId ? 'حفظ التعديلات' : 'إضافة الفني'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Technicians;
