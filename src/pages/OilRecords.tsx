import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Droplet, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { deleteRow } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import BuildingCombobox from '@/components/BuildingCombobox';
import { useAuth } from '@/contexts/AuthContext';

type Building = { id: string; name: string };
type Elevator = { id: string; building_id: string; elevator_number: number; elevator_name: string | null };
type OilRecord = {
  id: string;
  building_id: string;
  elevator_id: string | null;
  oil_type: string;
  oil_brand: string;
  oil_quantity: number;
  price: number;
  cost_amount: number;
  change_date: string;
  next_change_date: string;
  notes: string | null;
  buildings?: { name: string };
  elevators?: { elevator_number: number; elevator_name: string | null } | null;
};

const addSixMonths = (date: string) => {
  const next = new Date(`${date}T12:00:00`);
  next.setMonth(next.getMonth() + 6);
  return next.toISOString().slice(0, 10);
};

const OilRecords: React.FC = () => {
  const { role, can } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedBuilding = searchParams.get('building') || '';
  const requestedElevator = searchParams.get('elevator') || '';
  const [records, setRecords] = useState<OilRecord[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState({
    building_id: requestedBuilding,
    elevator_id: '',
    oil_type: '',
    oil_brand: '',
    oil_quantity: 0,
    price: 0,
    cost_amount: 0,
    change_date: today,
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const buildingsQuery = role === 'technician'
        ? supabase.rpc('technician_oil_building_options')
        : supabase.from('buildings').select('id, name').order('name');
      const elevatorsQuery = role === 'technician'
        ? supabase.rpc('technician_oil_elevator_options')
        : supabase.from('elevators').select('id, building_id, elevator_number, elevator_name').order('elevator_number');
      const [recordsRes, buildingsRes, elevatorsRes] = await Promise.all([
        supabase
          .from('oil_records')
          .select('*, buildings(name), elevators(elevator_number, elevator_name)')
          .order('next_change_date', { ascending: true }),
        buildingsQuery,
        elevatorsQuery,
      ]);

      if (recordsRes.error) throw recordsRes.error;
      if (buildingsRes.error) throw buildingsRes.error;
      if (elevatorsRes.error) throw elevatorsRes.error;
      setRecords((recordsRes.data || []) as OilRecord[]);
      setBuildings((buildingsRes.data || []) as Building[]);
      setElevators((elevatorsRes.data || []) as Elevator[]);
    } catch (error: any) {
      toast.error(error.message || 'تعذر تحميل سجل الزيت. شغّل تحديث قاعدة البيانات أولاً.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role]);

  const openAdd = () => {
    const requestedElevatorRow = elevators.find((elevator) => elevator.id === requestedElevator);
    const buildingId = requestedBuilding || requestedElevatorRow?.building_id || buildings[0]?.id || '';
    setFormData({
      building_id: buildingId,
      elevator_id: requestedElevator,
      oil_type: '',
      oil_brand: '',
      oil_quantity: 0,
      price: 0,
      cost_amount: 0,
      change_date: today,
      notes: '',
    });
    setIsOpen(true);
  };

  const availableElevators = useMemo(
    () => elevators.filter((elevator) => elevator.building_id === formData.building_id),
    [elevators, formData.building_id],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.building_id || !formData.oil_type || !formData.oil_brand) {
      toast.error('أدخل المبنى ونوع الزيت والماركة');
      return;
    }

    const payload = {
      ...formData,
      elevator_id: formData.elevator_id || null,
      oil_quantity: Number(formData.oil_quantity),
      price: Number(formData.price),
      cost_amount: Number(formData.cost_amount),
      next_change_date: addSixMonths(formData.change_date),
      notes: formData.notes || null,
    };
    const { error } = role === 'technician'
      ? await supabase.rpc('technician_record_oil', {
          p_building_id: payload.building_id,
          p_elevator_id: payload.elevator_id,
          p_oil_type: payload.oil_type,
          p_oil_brand: payload.oil_brand,
          p_oil_quantity: payload.oil_quantity,
          p_price: payload.price,
          p_cost_amount: payload.cost_amount,
          p_change_date: payload.change_date,
          p_notes: payload.notes,
        })
      : await supabase.from('oil_records').insert([payload]);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`تم تسجيل تغيير الزيت. التغيير القادم ${payload.next_change_date}`);
    setIsOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل تريد حذف سجل الزيت؟')) return;
    try {
      await deleteRow('oil_records', id);
      toast.success('تم حذف سجل الزيت');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر حذف السجل');
    }
  };

  const statusFor = (date: string) => {
    const days = Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: `متأخر ${Math.abs(days)} يوم`, className: 'bg-destructive/20 text-destructive' };
    if (days <= 30) return { label: `متبقي ${days} يوم`, className: 'bg-warning/20 text-warning' };
    return { label: 'في الموعد', className: 'bg-success/20 text-success' };
  };

  const dueCount = records.filter((record) => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return new Date(record.next_change_date) <= limit;
  }).length;

  const filteredRecords = records.filter((record) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return [record.oil_type, record.oil_brand, record.buildings?.name, record.elevators?.elevator_name, record.elevators?.elevator_number]
      .some((value) => String(value || '').toLowerCase().includes(text));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading flex items-center gap-2"><Droplet className="w-6 h-6" /> إدارة الزيت</h2>
          <p className="text-muted-foreground">يسجل موعد التغيير القادم تلقائيًا بعد 6 أشهر.</p>
        </div>
        {can('oil', 'create') && <Button onClick={openAdd} className="flex items-center gap-2"><Plus className="w-4 h-4" /> تسجيل تغيير زيت</Button>}
      </div>

      {dueCount > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 font-medium">
          تنبيه: يوجد {dueCount} سجل زيت موعده خلال 30 يومًا أو متأخر.
        </div>
      )}

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالمبنى أو المصعد أو نوع الزيت..." className="bg-transparent border-none outline-none w-full text-sm" />
      </div>

      <div className="bg-card rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-right">المبنى / المصعد</TableHead>
            <TableHead className="text-right">الزيت</TableHead>
            {role === 'manager' && <TableHead className="text-right">السعر</TableHead>}
            <TableHead className="text-right">تاريخ التغيير</TableHead>
            <TableHead className="text-right">التغيير القادم</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            {can('oil', 'delete') && <TableHead className="text-right">إجراء</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={role === 'manager' ? 7 : 5} className="text-center py-8">جاري التحميل...</TableCell></TableRow> :
              filteredRecords.length === 0 ? <TableRow><TableCell colSpan={role === 'manager' ? 7 : 5} className="text-center py-8 text-muted-foreground">لا توجد سجلات زيت مطابقة</TableCell></TableRow> :
              filteredRecords.map((record) => {
                const status = statusFor(record.next_change_date);
                return <TableRow key={record.id}>
                  <TableCell>{record.buildings?.name || '-'}{record.elevators ? ` / ${record.elevators.elevator_name || `مصعد ${record.elevators.elevator_number}`}` : ''}</TableCell>
                  <TableCell>{record.oil_type} — {record.oil_brand} ({record.oil_quantity})</TableCell>
                  {role === 'manager' && <TableCell>{Number(record.price || 0).toLocaleString('ar-EG')}</TableCell>}
                  <TableCell>{record.change_date}</TableCell>
                  <TableCell className="font-bold">{record.next_change_date}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.className}`}>{status.label}</span></TableCell>
                  {can('oil', 'delete') && <TableCell><Button variant="ghost" size="icon" onClick={() => handleDelete(record.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>}
                </TableRow>;
              })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">تسجيل تغيير زيت</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label>المبنى</Label><BuildingCombobox buildings={buildings} value={formData.building_id} onChange={(buildingId) => setFormData({ ...formData, building_id: buildingId, elevator_id: '' })} /></div>
            <div className="space-y-2"><Label>المصعد (اختياري)</Label><select name="elevator_id" value={formData.elevator_id} onChange={(e) => setFormData({ ...formData, elevator_id: e.target.value })} className="w-full h-10 rounded-md border bg-background px-3"><option value="">كل مصاعد المبنى</option>{availableElevators.map((e) => <option key={e.id} value={e.id}>{e.elevator_name || `مصعد ${e.elevator_number}`}</option>)}</select></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>نوع الزيت</Label><Input value={formData.oil_type} onChange={(e) => setFormData({ ...formData, oil_type: e.target.value })} required /></div>
              <div className="space-y-2"><Label>الماركة</Label><Input value={formData.oil_brand} onChange={(e) => setFormData({ ...formData, oil_brand: e.target.value })} required /></div>
              <div className="space-y-2"><Label>الكمية</Label><Input type="number" min="0" step="0.1" value={formData.oil_quantity} onChange={(e) => setFormData({ ...formData, oil_quantity: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>المبلغ المحصل من العميل</Label><Input type="number" min="0" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>تكلفة الزيت</Label><Input type="number" min="0" step="0.01" value={formData.cost_amount} onChange={(e) => setFormData({ ...formData, cost_amount: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>تاريخ التغيير</Label><Input type="date" value={formData.change_date} onChange={(e) => setFormData({ ...formData, change_date: e.target.value })} required /></div>
            </div>
            <div className="space-y-2"><Label>ملاحظات</Label><Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
            <p className="text-sm text-muted-foreground">موعد التغيير القادم تلقائيًا: <strong>{addSixMonths(formData.change_date)}</strong></p>
            <DialogFooter><Button type="submit">حفظ سجل الزيت</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OilRecords;
