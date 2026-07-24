import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PackageOpen, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { deleteRow } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import BuildingCombobox from '@/components/BuildingCombobox';
import { useAuth } from '@/contexts/AuthContext';

type Building = { id: string; name: string };
type Elevator = { id: string; building_id: string; elevator_number: number; elevator_name: string | null };
type Technician = { id: string; name: string };
type InventoryItem = { id: string; part_code: string; part_name: string; quantity: number; sale_price: number; purchase_price: number };
type Replacement = {
  id: string;
  building_id: string;
  elevator_id: string;
  part_name: string;
  inventory_id: string;
  quantity_used: number;
  part_code_snapshot?: string | null;
  replacement_date: string;
  price: number;
  cost_price?: number;
  technician_id: string | null;
  invoice_number: string | null;
  notes: string | null;
  buildings?: { name: string };
  elevators?: { elevator_number: number; elevator_name: string | null };
  technicians?: { name: string } | null;
  inventory?: { part_code: string } | null;
};

const SparePartReplacements: React.FC = () => {
  const { role, can } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedBuilding = searchParams.get('building') || '';
  const requestedElevator = searchParams.get('elevator') || '';
  const [records, setRecords] = useState<Replacement[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    building_id: requestedBuilding,
    elevator_id: requestedElevator,
    part_name: '',
    inventory_id: '',
    is_external: false,
    quantity_used: 1,
    replacement_date: new Date().toISOString().slice(0, 10),
    price: 0,
    cost_price: 0,
    technician_id: '',
    invoice_number: '',
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const recordsQuery = role === 'technician'
        ? supabase.from('spare_part_replacements').select('id, building_id, elevator_id, inventory_id, part_code_snapshot, quantity_used, part_name, replacement_date, technician_id, invoice_number, notes, buildings(name), elevators(elevator_number, elevator_name), technicians(name)').order('replacement_date', { ascending: false })
        : supabase.from('spare_part_replacements').select('*, buildings(name), elevators(elevator_number, elevator_name), technicians(name), inventory(part_code)').order('replacement_date', { ascending: false });
      const [recordsRes, buildingsRes, elevatorsRes, techniciansRes, inventoryRes] = await Promise.all([
        recordsQuery,
        supabase.from('buildings').select('id, name').order('name'),
        supabase.from('elevators').select('id, building_id, elevator_number, elevator_name').order('elevator_number'),
        supabase.from('technicians').select('id, name').order('name'),
        role === 'technician' ? Promise.resolve({ data: [], error: null }) : supabase.from('inventory').select('id, part_code, part_name, quantity, sale_price, purchase_price').order('part_code'),
      ]);

      // Load each selector independently. A missing/new spare-parts table must
      // not leave the building and elevator dropdowns empty.
      setBuildings(buildingsRes.data || []);
      setElevators(elevatorsRes.data || []);
      setTechnicians(techniciansRes.data || []);
      setInventoryItems(inventoryRes.data || []);

      if (buildingsRes.error) throw buildingsRes.error;
      if (elevatorsRes.error) throw elevatorsRes.error;
      if (recordsRes.error) {
        setRecords([]);
        toast.error('شغّل تحديث جدول قطع الغيار في Supabase أولاً');
      } else {
        setRecords((recordsRes.data || []) as Replacement[]);
      }
    } catch (error: any) {
      toast.error(error.message || 'تعذر تحميل تغييرات قطع الغيار');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [role]);

  const availableElevators = useMemo(
    () => elevators.filter((elevator) => elevator.building_id === formData.building_id),
    [elevators, formData.building_id],
  );

  const openAdd = () => {
    const requestedElevatorRow = elevators.find((elevator) => elevator.id === requestedElevator);
    const defaultBuildingId = requestedBuilding || requestedElevatorRow?.building_id || buildings[0]?.id || '';
    const defaultElevatorId = requestedElevator || elevators.find((elevator) => elevator.building_id === defaultBuildingId)?.id || '';
    setFormData({
      building_id: defaultBuildingId,
      elevator_id: defaultElevatorId,
      part_name: '',
      inventory_id: '',
      is_external: false,
      quantity_used: 1,
      replacement_date: new Date().toISOString().slice(0, 10),
      price: 0,
      cost_price: 0,
      technician_id: '',
      invoice_number: '',
      notes: '',
    });
    setIsOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.building_id || !formData.elevator_id || formData.quantity_used < 1 || (!formData.is_external && !formData.inventory_id) || (formData.is_external && !formData.part_name.trim())) {
      toast.error(formData.is_external ? 'اختر المبنى والمصعد واكتب اسم القطعة والكمية' : 'اختر المبنى والمصعد وكود القطعة والكمية');
      return;
    }
    const selectedItem = inventoryItems.find((item) => item.id === formData.inventory_id);
    if (!formData.is_external && (!selectedItem || formData.quantity_used > selectedItem.quantity)) {
      toast.error(`الكمية غير متوفرة. المتاح: ${selectedItem?.quantity || 0}`);
      return;
    }
    const { error } = await supabase.from('spare_part_replacements').insert([{
      building_id: formData.building_id,
      elevator_id: formData.elevator_id,
      inventory_id: formData.is_external ? null : formData.inventory_id,
      part_name: formData.part_name.trim(),
      replacement_date: formData.replacement_date,
      price: Number(formData.price),
      cost_price: Number(formData.cost_price),
      quantity_used: Number(formData.quantity_used),
      technician_id: formData.technician_id || null,
      invoice_number: formData.invoice_number.trim() || null,
      notes: formData.notes.trim() || null,
    }]);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(formData.is_external ? 'تم تسجيل القطعة الخارجية بدون خصم من المخزون' : `تم تسجيل التغيير وخصم ${formData.quantity_used} من المخزون`);
    setIsOpen(false);
    fetchData();
  };

  const handleDelete = async (record: Replacement) => {
    if (!window.confirm('هل تريد حذف سجل تغيير القطعة؟')) return;
    try {
      await deleteRow('spare_part_replacements', record.id);
      toast.success(record.inventory_id ? 'تم حذف السجل وإرجاع الكمية إلى المخزون' : 'تم حذف سجل القطعة الخارجية');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر الحذف');
    }
  };

  const filteredRecords = records.filter((record) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return [record.part_name, record.part_code_snapshot, record.inventory?.part_code, record.invoice_number, record.buildings?.name, record.elevators?.elevator_name, record.technicians?.name]
      .some((value) => String(value || '').toLowerCase().includes(text));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-2xl font-bold flex items-center gap-2"><PackageOpen className="w-6 h-6" /> تغيير قطع الغيار</h2><p className="text-muted-foreground">سجل مستقل لكل قطعة تم تغييرها في أي مصعد.</p></div>
        {can('spare_parts', 'create') && <Button onClick={openAdd}><Plus className="w-4 h-4 ml-1" /> تسجيل تغيير قطعة</Button>}
      </div>

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالقطعة أو المبنى أو المصعد أو الفاتورة..." className="bg-transparent border-none outline-none w-full text-sm" />
      </div>

      <div className="bg-card rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المبنى / المصعد</TableHead><TableHead className="text-right">الكود / القطعة</TableHead><TableHead className="text-right">الكمية</TableHead>{role !== 'technician' && <TableHead className="text-right">السعر</TableHead>}<TableHead className="text-right">الفني</TableHead><TableHead className="text-right">الفاتورة</TableHead>{can('spare_parts', 'delete') && <TableHead className="text-right">إجراء</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={role === 'manager' ? 8 : role === 'technician' ? 6 : 7} className="text-center py-8">جاري التحميل...</TableCell></TableRow> : filteredRecords.length === 0 ? <TableRow><TableCell colSpan={role === 'manager' ? 8 : role === 'technician' ? 6 : 7} className="text-center py-8 text-muted-foreground">لا توجد تغييرات مسجلة</TableCell></TableRow> : filteredRecords.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.replacement_date}</TableCell>
                <TableCell>{record.buildings?.name || '-'} / {record.elevators?.elevator_name || `مصعد ${record.elevators?.elevator_number || '-'}`}</TableCell>
                <TableCell><div className="font-mono font-bold text-primary">{record.part_code_snapshot || record.inventory?.part_code || 'خارجي'}</div><div className="font-medium">{record.part_name}</div></TableCell>
                <TableCell>{record.quantity_used || 1}</TableCell>
                {role !== 'technician' && <TableCell>{record.price}</TableCell>}
                <TableCell>{record.technicians?.name || '-'}</TableCell>
                <TableCell>{record.invoice_number || '-'}</TableCell>
                {can('spare_parts', 'delete') && <TableCell><Button variant="ghost" size="icon" onClick={() => handleDelete(record)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">تسجيل تغيير قطعة غيار</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label>المبنى</Label><BuildingCombobox buildings={buildings} value={formData.building_id} onChange={(buildingId) => setFormData({ ...formData, building_id: buildingId, elevator_id: elevators.find((elevator) => elevator.building_id === buildingId)?.id || '' })} /></div>
            <div className="space-y-2"><Label>المصعد</Label><select value={formData.elevator_id} onChange={(e) => setFormData({ ...formData, elevator_id: e.target.value })} required className="w-full h-10 rounded-md border bg-background px-3"><option value="">اختر المصعد</option>{availableElevators.map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.elevator_name || `مصعد ${elevator.elevator_number}`}</option>)}</select></div>
            <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer bg-muted/30">
              <input type="checkbox" checked={formData.is_external} onChange={(e) => setFormData({ ...formData, is_external: e.target.checked, inventory_id: '', part_name: '', quantity_used: 1, price: 0, cost_price: 0 })} className="w-4 h-4" />
              <span><span className="font-bold">قطعة ليست موجودة في المخزن</span><span className="block text-xs text-muted-foreground">سجّلها كقطعة خارجية بدون خصم من المخزون</span></span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!formData.is_external && <div className="space-y-2 md:col-span-2"><Label>كود القطعة من المخزن</Label><select value={formData.inventory_id} onChange={(e) => { const item = inventoryItems.find((row) => row.id === e.target.value); setFormData({ ...formData, inventory_id: e.target.value, part_name: item?.part_name || '', quantity_used: 1, price: Number(item?.sale_price || 0), cost_price: Number(item?.purchase_price || 0) }); }} required className="w-full h-10 rounded-md border bg-background px-3"><option value="">اختر كود القطعة</option>{inventoryItems.map((item) => <option key={item.id} value={item.id} disabled={item.quantity < 1}>{item.part_code} — {item.part_name} — المتاح {item.quantity}{item.quantity < 1 ? ' (نفد)' : ''}</option>)}</select></div>}
              <div className="space-y-2"><Label>اسم القطعة</Label><Input value={formData.part_name} onChange={(e) => setFormData({ ...formData, part_name: e.target.value })} readOnly={!formData.is_external} required className={formData.is_external ? '' : 'bg-muted'} /></div>
              <div className="space-y-2"><Label>تاريخ التغيير</Label><Input type="date" value={formData.replacement_date} onChange={(e) => setFormData({ ...formData, replacement_date: e.target.value })} required /></div>
              <div className="space-y-2"><Label>الكمية المستخدمة</Label><Input type="number" min="1" max={formData.is_external ? undefined : inventoryItems.find((item) => item.id === formData.inventory_id)?.quantity || undefined} value={formData.quantity_used} onChange={(e) => { const quantity = Math.max(1, Number(e.target.value)); const item = inventoryItems.find((row) => row.id === formData.inventory_id); setFormData({ ...formData, quantity_used: quantity, price: formData.is_external ? formData.price : Number(item?.sale_price || 0) * quantity, cost_price: formData.is_external ? formData.cost_price : Number(item?.purchase_price || 0) * quantity }); }} required />{!formData.is_external && <p className="text-xs text-muted-foreground">المتاح: {inventoryItems.find((item) => item.id === formData.inventory_id)?.quantity ?? '-'}</p>}</div>
              <div className="space-y-2"><Label>المبلغ المحصل من العميل</Label><Input type="number" min="0" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} required /></div>
              <div className="space-y-2"><Label>تكلفة شراء القطعة</Label><Input type="number" min="0" step="0.01" value={formData.cost_price} onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })} readOnly={!formData.is_external} className={formData.is_external ? '' : 'bg-muted'} required /></div>
              <div className="space-y-2"><Label>الفني الذي ركبها</Label><select value={formData.technician_id} onChange={(e) => setFormData({ ...formData, technician_id: e.target.value })} className="w-full h-10 rounded-md border bg-background px-3"><option value="">بدون تحديد</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></div>
            </div>
            <div className="space-y-2"><Label>رقم الفاتورة (اختياري)</Label><Input value={formData.invoice_number} onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} /></div>
            <div className="space-y-2"><Label>ملاحظات (اختياري)</Label><Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
            <DialogFooter><Button type="submit">حفظ تغيير القطعة</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SparePartReplacements;
