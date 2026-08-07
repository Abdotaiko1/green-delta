import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Archive, RotateCcw, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import BuildingCombobox from '@/components/BuildingCombobox';
import { useAuth } from '@/contexts/AuthContext';

type Elevator = {
  id: string;
  elevator_code?: string;
  elevator_number: number;
  building_id: string;
  maintenance_line_id: string;
  brand: string | null;
  capacity: string | null;
  maintenance_start_date: string | null;
  maintenance_subscription: 'شهري' | '٣ شهور' | '٦ شهور' | 'سنوي';
  maintenance_price: number | null;
  wire_size: string | null;
  stops_count: number | null;
  operation_start_date: string | null;
  machine_type: string | null;
  chair_k_type: string | null;
  chair_t_type: string | null;
  counterweight_type: string | null;
  interior_buttons_shape: 'مربعة' | 'مدورة' | null;
  lock_type: string | null;
  tensioner_type: string | null;
  pump_type: string | null;
  controller_board_type: string | null;
  has_emergency: boolean | null;
  has_phase_correct: boolean | null;
  has_inverter: boolean | null;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  status: string;
  notes: string | null;
  elevator_name: string | null;
  archived_at: string | null;
  buildings?: { name: string; address: string };
  maintenance_lines?: { name: string };
};

type Building = {
  id: string;
  name: string;
  address: string;
  maintenance_line_id: string;
  elevator_count: number;
  archived_at: string | null;
};

const Elevators: React.FC = () => {
  const { role, can } = useAuth();
  const navigate = useNavigate();
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [maintenanceLines, setMaintenanceLines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [currentMapAddress, setCurrentMapAddress] = useState('');
  const [currentMapBuilding, setCurrentMapBuilding] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    elevator_number: 1,
    building_id: '',
    maintenance_line_id: '',
    brand: '',
    capacity: '',
    maintenance_start_date: '',
    maintenance_subscription: 'شهري',
    maintenance_price: '',
    wire_size: '',
    stops_count: '',
    operation_start_date: '',
    machine_type: '',
    chair_k_type: '',
    chair_t_type: '',
    counterweight_type: '',
    interior_buttons_shape: '',
    lock_type: '',
    tensioner_type: '',
    pump_type: '',
    controller_board_type: '',
    has_emergency: '',
    has_phase_correct: '',
    has_inverter: '',
    status: 'نشط',
    last_maintenance_date: '',
    notes: '',
    elevator_name: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [elevatorsRes, buildingsRes, linesRes] = await Promise.all([
        supabase.from('elevators').select('*, buildings(name, address), maintenance_lines(name)').order('created_at', { ascending: false }),
        supabase.from('buildings').select('id, name, address, maintenance_line_id, elevator_count, archived_at').is('archived_at', null),
        supabase.from('maintenance_lines').select('id, name').order('name'),
      ]);
        
      if (elevatorsRes.error) throw elevatorsRes.error;
      if (buildingsRes.error) throw buildingsRes.error;
      if (linesRes.error) throw linesRes.error;
      
      setElevators(elevatorsRes.data as any);
      setBuildings(buildingsRes.data || []);
      setMaintenanceLines(linesRes.data || []);
    } catch (error: any) {
      toast.error('خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'elevator_number' ? (parseInt(value, 10) || 0) : value
    }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      elevator_number: elevators.length > 0 ? Math.max(...elevators.map(e => e.elevator_number)) + 1 : 1,
      building_id: '',
      maintenance_line_id: '',
      brand: '',
      capacity: '',
      maintenance_start_date: '',
      maintenance_subscription: 'شهري',
      maintenance_price: '',
      wire_size: '',
      stops_count: '',
      operation_start_date: '',
      machine_type: '',
      chair_k_type: '',
      chair_t_type: '',
      counterweight_type: '',
      interior_buttons_shape: '',
      lock_type: '',
      tensioner_type: '',
      pump_type: '',
      controller_board_type: '',
      has_emergency: '',
      has_phase_correct: '',
      has_inverter: '',
      status: 'نشط',
      last_maintenance_date: '',
      notes: '',
      elevator_name: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (elevator: Elevator) => {
    setEditingId(elevator.id);
    setFormData({
      elevator_number: elevator.elevator_number,
      building_id: elevator.building_id,
      maintenance_line_id: elevator.maintenance_line_id,
      brand: elevator.brand || '',
      capacity: elevator.capacity || '',
      maintenance_start_date: elevator.maintenance_start_date || '',
      maintenance_subscription: elevator.maintenance_subscription || 'شهري',
      maintenance_price: elevator.maintenance_price == null ? '' : String(elevator.maintenance_price),
      wire_size: elevator.wire_size || '',
      stops_count: elevator.stops_count == null ? '' : String(elevator.stops_count),
      operation_start_date: elevator.operation_start_date || '',
      machine_type: elevator.machine_type || '',
      chair_k_type: elevator.chair_k_type || '',
      chair_t_type: elevator.chair_t_type || '',
      counterweight_type: elevator.counterweight_type || '',
      interior_buttons_shape: elevator.interior_buttons_shape || '',
      lock_type: elevator.lock_type || '',
      tensioner_type: elevator.tensioner_type || '',
      pump_type: elevator.pump_type || '',
      controller_board_type: elevator.controller_board_type || '',
      has_emergency: elevator.has_emergency == null ? '' : elevator.has_emergency ? 'نعم' : 'لا',
      has_phase_correct: elevator.has_phase_correct == null ? '' : elevator.has_phase_correct ? 'نعم' : 'لا',
      has_inverter: elevator.has_inverter == null ? '' : elevator.has_inverter ? 'نعم' : 'لا',
      status: elevator.status,
      last_maintenance_date: elevator.last_maintenance_date || '',
      notes: elevator.notes || '',
      elevator_name: elevator.elevator_name || '',
    });
    setIsModalOpen(true);
  };

  const openMap = (buildingName: string, address: string) => {
    setCurrentMapBuilding(buildingName);
    setCurrentMapAddress(address);
    setIsMapOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.maintenance_line_id || !formData.building_id || !formData.elevator_number || !formData.maintenance_subscription) {
      toast.error('الخط والمبنى ورقم المصعد ونوع الاشتراك حقول مطلوبة');
      return;
    }
    try {
      const selectedBuilding = buildings.find((building) => building.id === formData.building_id);
      const registeredElevators = elevators.filter((elevator) =>
        elevator.building_id === formData.building_id &&
        !elevator.archived_at &&
        elevator.id !== editingId
      ).length;
      if (selectedBuilding && registeredElevators >= selectedBuilding.elevator_count) {
        toast.error(`هذا المبنى مسجل له ${selectedBuilding.elevator_count} مصعد فقط، وتم تسجيل العدد بالكامل`);
        return;
      }

      const payload = {
        elevator_number: formData.elevator_number,
        building_id: formData.building_id,
        maintenance_line_id: formData.maintenance_line_id,
        maintenance_subscription: formData.maintenance_subscription,
        brand: formData.brand.trim() || null,
        capacity: formData.capacity.trim() || null,
        maintenance_start_date: formData.maintenance_start_date || null,
        maintenance_price: formData.maintenance_price === '' ? null : Number(formData.maintenance_price),
        wire_size: formData.wire_size.trim() || null,
        stops_count: formData.stops_count === '' ? null : Number(formData.stops_count),
        operation_start_date: formData.operation_start_date || null,
        machine_type: formData.machine_type.trim() || null,
        chair_k_type: formData.chair_k_type.trim() || null,
        chair_t_type: formData.chair_t_type.trim() || null,
        counterweight_type: formData.counterweight_type.trim() || null,
        interior_buttons_shape: formData.interior_buttons_shape || null,
        lock_type: formData.lock_type.trim() || null,
        tensioner_type: formData.tensioner_type.trim() || null,
        pump_type: formData.pump_type.trim() || null,
        controller_board_type: formData.controller_board_type.trim() || null,
        has_emergency: formData.has_emergency === '' ? null : formData.has_emergency === 'نعم',
        has_phase_correct: formData.has_phase_correct === '' ? null : formData.has_phase_correct === 'نعم',
        has_inverter: formData.has_inverter === '' ? null : formData.has_inverter === 'نعم',
        status: formData.status || 'نشط',
        last_maintenance_date: formData.last_maintenance_date || null,
        notes: formData.notes || null,
        elevator_name: formData.elevator_name || null,
      };

      if (editingId) {
        const { error } = await supabase.from('elevators').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('تم التحديث بنجاح');
      } else {
        const { error } = await supabase.from('elevators').insert([payload]);
        if (error) throw error;
        toast.success('تمت الإضافة بنجاح');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleArchive = async (elevator: Elevator) => {
    const restoring = Boolean(elevator.archived_at);
    if (!restoring && !window.confirm('هل تريد إيقاف وأرشفة هذا المصعد؟ ستظل الفواتير وسجلات الصيانة محفوظة.')) return;
    try {
      const { error } = await supabase.rpc('set_elevator_archived', {
        p_elevator_id: elevator.id,
        p_archived: !restoring,
      });
      if (error) throw error;
      toast.success(restoring ? 'تمت إعادة المصعد إلى المصاعد النشطة' : 'تم إيقاف وأرشفة المصعد مع الاحتفاظ بجميع سجلاته');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء تغيير حالة أرشفة المصعد');
    }
  };

  const filteredElevators = elevators.filter(e => 
    (showArchived ? Boolean(e.archived_at) : !e.archived_at) && (
      (e.elevator_code || '').toLowerCase().includes(search.toLowerCase()) ||
      String(e.elevator_number).includes(search) ||
      (e.elevator_name || '').includes(search) ||
      (e.brand || '').includes(search) ||
      (e.wire_size || '').includes(search) ||
      (e.machine_type || '').includes(search) ||
      (e.chair_k_type || '').includes(search) ||
      (e.chair_t_type || '').includes(search) ||
      (e.counterweight_type || '').includes(search) ||
      (e.interior_buttons_shape || '').includes(search) ||
      (e.lock_type || '').includes(search) ||
      (e.tensioner_type || '').includes(search) ||
      (e.pump_type || '').includes(search) ||
      (e.controller_board_type || '').includes(search) ||
      (e.maintenance_subscription || '').includes(search) ||
      (e.maintenance_lines?.name || '').includes(search) ||
      (e.buildings?.name || '').includes(search)
    )
  );

  const maintenanceAlert = (date: string | null) => {
    if (!date) return null;
    const days = Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);
    if (days < 0) return { text: `متأخرة ${Math.abs(days)} يوم`, className: 'text-destructive' };
    if (days <= 20) return { text: `متبقي ${days} يوم`, className: 'text-warning' };
    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'نشط':
      case 'active':
        return 'bg-success/20 text-success';
      case 'معطل':
      case 'broken':
      case 'inactive':
        return 'bg-destructive/20 text-destructive';
      case 'قيد الصيانة':
      case 'maintenance':
        return 'bg-warning/20 text-warning';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة المصاعد</h2>
          <p className="text-muted-foreground">عرض وإدارة جميع المصاعد المسجلة وحالتها الحالية.</p>
        </div>
        {can('elevators', 'create') && <Button onClick={openAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          إضافة مصعد
        </Button>}
      </div>

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
        <input
          type="text"
          placeholder="بحث برقم المصعد أو اسم المصعد أو المبنى..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-sm"
        />
      </div>
      {can('elevators', 'delete') && (
        <Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)} className="flex items-center gap-2">
          {showArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          {showArchived ? 'عرض المصاعد النشطة' : 'عرض المصاعد المؤرشفة'}
        </Button>
      )}

      <div className="bg-card rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">كود المصعد</TableHead>
              <TableHead className="text-right">رقم المصعد</TableHead>
              <TableHead className="text-right">اسم المصعد</TableHead>
              <TableHead className="text-right">المبنى</TableHead>
              <TableHead className="text-right">الخط</TableHead>
              <TableHead className="text-right">اشتراك الصيانة</TableHead>
              <TableHead className="text-right">سعر الصيانة</TableHead>
              <TableHead className="text-right">الوايرات / الوقفات</TableHead>
              <TableHead className="text-right">بيانات فنية</TableHead>
              <TableHead className="text-right">بداية الصيانة</TableHead>
              <TableHead className="text-right font-medium">الصيانة القادمة</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              {(can('elevators', 'update') || can('elevators', 'delete')) && <TableHead className="text-right w-32">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={role === 'manager' ? 13 : 12} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            ) : filteredElevators.length === 0 ? (
              <TableRow>
                <TableCell colSpan={role === 'manager' ? 13 : 12} className="text-center py-8 text-muted-foreground">لا يوجد مطابقة</TableCell>
              </TableRow>
            ) : (
              filteredElevators.map((elevator) => (
                <TableRow key={elevator.id} className="cursor-pointer hover:bg-muted/60" onClick={() => navigate(`/elevators/${elevator.id}`)}>
                  <TableCell className="font-mono text-xs">{elevator.elevator_code || '—'}</TableCell>
                  <TableCell className="font-medium">{elevator.elevator_number}</TableCell>
                  <TableCell>{elevator.elevator_name || '-'}</TableCell>
                  {role === 'manager' && <TableCell>
                    <div className="flex items-center gap-2">
                      {elevator.buildings?.name}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={(event) => { event.stopPropagation(); openMap(elevator.buildings?.name || '', elevator.buildings?.address || ''); }}>
                        <MapPin className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>}
                  <TableCell><span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{elevator.maintenance_lines?.name || '-'}</span></TableCell>
                  <TableCell>{elevator.maintenance_subscription}</TableCell>
                  <TableCell>{elevator.maintenance_price ?? '-'}</TableCell>
                  <TableCell>{elevator.wire_size || '-'} / {elevator.stops_count ?? '-'} وقفة</TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap">ماكينة: {elevator.machine_type || '-'}</div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">زراير: {elevator.interior_buttons_shape || '-'}</div>
                  </TableCell>
                  <TableCell>{elevator.maintenance_start_date || '-'}</TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap">{elevator.next_maintenance_date || '-'}</div>
                    {(() => {
                      const alert = maintenanceAlert(elevator.next_maintenance_date);
                      return alert ? <div className={`text-xs font-bold ${alert.className}`}>{alert.text}</div> : null;
                    })()}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(elevator.status)}`}>
                      {elevator.status === 'active' ? 'نشط' : elevator.status === 'maintenance' ? 'قيد الصيانة' : elevator.status === 'broken' ? 'معطل' : elevator.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {can('elevators', 'update') && <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openEditModal(elevator); }}>
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>}
                      {can('elevators', 'delete') && <Button title={elevator.archived_at ? 'إعادة للتشغيل' : 'إيقاف وأرشفة'} variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); handleArchive(elevator); }}>
                        {elevator.archived_at ? <RotateCcw className="w-4 h-4 text-success" /> : <Archive className="w-4 h-4 text-destructive" />}
                      </Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit/Add Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingId ? 'تعديل مصعد' : 'إضافة مصعد جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم المصعد</Label>
                <Input type="number" name="elevator_number" value={formData.elevator_number} onChange={handleInputChange} required min={1} />
              </div>
              <div className="space-y-2">
                <Label>اسم المصعد (اختياري)</Label>
                <Input name="elevator_name" value={formData.elevator_name} onChange={handleInputChange} placeholder="مثال: مصعد أ، مصعد ب..." />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>خط الصيانة *</Label>
                <select name="maintenance_line_id" value={formData.maintenance_line_id} onChange={(event) => setFormData((current) => ({ ...current, maintenance_line_id: event.target.value, building_id: '' }))} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="" disabled>اختر الخط</option>
                  {maintenanceLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>المبنى *</Label>
                <BuildingCombobox
                  buildings={buildings.filter((building) => building.maintenance_line_id === formData.maintenance_line_id)}
                  value={formData.building_id}
                  onChange={(buildingId) => setFormData((current) => ({ ...current, building_id: buildingId }))}
                  disabled={!formData.maintenance_line_id}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>نوع اشتراك الصيانة</Label>
                <select name="maintenance_subscription" value={formData.maintenance_subscription} onChange={handleInputChange} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="شهري">شهري</option>
                  <option value="٣ شهور">كل ٣ شهور</option>
                  <option value="٦ شهور">كل ٦ شهور</option>
                  <option value="سنوي">سنوي</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>بداية الصيانة (اختياري)</Label>
                <Input type="date" name="maintenance_start_date" value={formData.maintenance_start_date} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label>سعر الصيانة (اختياري)</Label>
                <Input type="number" min="0" step="0.01" name="maintenance_price" value={formData.maintenance_price} onChange={handleInputChange} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>تاريخ آخر صيانة (اختياري)</Label>
                <Input type="date" name="last_maintenance_date" value={formData.last_maintenance_date} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label>بداية تشغيل المصعد (اختياري)</Label>
                <Input type="date" name="operation_start_date" value={formData.operation_start_date} onChange={handleInputChange} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الماركة (اختياري)</Label>
                <Input name="brand" value={formData.brand} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label>الحمولة (اختياري)</Label>
                <Input name="capacity" value={formData.capacity} onChange={handleInputChange} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>مقاس الوايرات (اختياري)</Label>
                <Input name="wire_size" value={formData.wire_size} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label>عدد الوقفات (اختياري)</Label>
                <Input type="number" min="0" name="stops_count" value={formData.stops_count} onChange={handleInputChange} />
              </div>
            </div>
            <div className="border rounded-md p-4 space-y-4">
              <div className="font-bold">البيانات الفنية للمصعد</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نوع الماكينة (اختياري)</Label>
                  <Input name="machine_type" value={formData.machine_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>نوع التقل (اختياري)</Label>
                  <Input name="counterweight_type" value={formData.counterweight_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>نوع كراسي ك (اختياري)</Label>
                  <Input name="chair_k_type" value={formData.chair_k_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>نوع كراسي ت (اختياري)</Label>
                  <Input name="chair_t_type" value={formData.chair_t_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>شكل الزراير الداخلية (اختياري)</Label>
                  <select name="interior_buttons_shape" value={formData.interior_buttons_shape} onChange={handleInputChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">غير محدد</option>
                    <option value="مربعة">مربعة</option>
                    <option value="مدورة">مدورة</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>نوع الكالون (اختياري)</Label>
                  <Input name="lock_type" value={formData.lock_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>نوع الشدادات (اختياري)</Label>
                  <Input name="tensioner_type" value={formData.tensioner_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>نوع الطلمبات (اختياري)</Label>
                  <Input name="pump_type" value={formData.pump_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>نوع الكارتة (اختياري)</Label>
                  <Input name="controller_board_type" value={formData.controller_board_type} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label>يوجد طوارئ؟</Label>
                  <select name="has_emergency" value={formData.has_emergency} onChange={handleInputChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">غير محدد</option><option value="نعم">نعم</option><option value="لا">لا</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>يوجد فاز كوريكت؟</Label>
                  <select name="has_phase_correct" value={formData.has_phase_correct} onChange={handleInputChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">غير محدد</option><option value="نعم">نعم</option><option value="لا">لا</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>يوجد إنفرتر؟</Label>
                  <select name="has_inverter" value={formData.has_inverter} onChange={handleInputChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">غير محدد</option><option value="نعم">نعم</option><option value="لا">لا</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>الحالة (اختياري)</Label>
                <select 
                  name="status" 
                  value={formData.status} 
                  onChange={handleInputChange} 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="نشط">نشط</option>
                  <option value="معطل">معطل</option>
                  <option value="قيد الصيانة">قيد الصيانة</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Input name="notes" value={formData.notes} onChange={handleInputChange} placeholder="أي ملاحظات حول المصعد..." />
            </div>
            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">{editingId ? 'حفظ التعديلات' : 'إضافة المصعد'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Map Modal */}
      <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">موقع المبنى: {currentMapBuilding}</DialogTitle>
          </DialogHeader>
          <div className="w-full h-64 bg-muted rounded-md overflow-hidden">
            <iframe 
              width="100%" 
              height="100%" 
              frameBorder="0" 
              style={{ border: 0 }} 
              src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyB_LJOYJL-84SMuxNB7LtRGhxEQLjswvy0&q=${encodeURIComponent(currentMapAddress)}&language=ar&region=sa`} 
              allowFullScreen>
            </iframe>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Elevators;
