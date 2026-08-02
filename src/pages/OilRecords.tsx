import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Droplet, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { deleteRow } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type Elevator = {
  id: string;
  building_id: string;
  elevator_number: number;
  elevator_name: string | null;
  created_at: string;
  building_name: string;
  maintenance_line_name: string;
};

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
  changed_at: string;
  next_change_date: string;
  notes: string | null;
  exclude_from_finance: boolean;
};

type OilSheetRow = {
  elevator: Elevator;
  latestRecord?: OilRecord;
  nextChangeDate: string;
};

const cairoDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addSixMonths = (date: string) => {
  const next = new Date(`${date}T12:00:00`);
  next.setMonth(next.getMonth() + 6);
  return next.toISOString().slice(0, 10);
};

const oilChangeDateTimeLabel = (changeDate: string, recordedAt: string) => {
  const dateLabel = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Cairo',
  }).format(new Date(`${changeDate}T12:00:00`));
  const timeLabel = new Intl.DateTimeFormat('ar-EG', {
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(recordedAt));
  return `${dateLabel} — ${timeLabel}`;
};

const OilRecords: React.FC = () => {
  const { role, can } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedBuilding = searchParams.get('building') || '';
  const requestedElevator = searchParams.get('elevator') || '';
  const [records, setRecords] = useState<OilRecord[]>([]);
  const [elevators, setElevators] = useState<Elevator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedElevator, setSelectedElevator] = useState<Elevator | null>(null);
  const [formData, setFormData] = useState({
    change_date: cairoDate(),
    exclude_from_finance: false,
    oil_type: '',
    oil_brand: '',
    oil_quantity: 0,
    price: 0,
    cost_amount: 0,
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const elevatorsQuery = role === 'technician'
        ? supabase.rpc('technician_oil_elevator_options')
        : supabase
            .from('elevators')
            .select(`
              id,
              building_id,
              elevator_number,
              elevator_name,
              created_at,
              building:buildings(name, building_line:maintenance_lines(name)),
              elevator_line:maintenance_lines(name)
            `)
            .is('archived_at', null)
            .order('elevator_number');

      const [recordsRes, elevatorsRes] = await Promise.all([
        supabase
          .from('oil_records')
          .select('id, building_id, elevator_id, oil_type, oil_brand, oil_quantity, price, cost_amount, change_date, changed_at, next_change_date, notes, exclude_from_finance')
          .order('changed_at', { ascending: false }),
        elevatorsQuery,
      ]);

      if (recordsRes.error) throw recordsRes.error;
      if (elevatorsRes.error) throw elevatorsRes.error;

      const normalizedElevators = (elevatorsRes.data || []).map((raw: any): Elevator => ({
        id: raw.id,
        building_id: raw.building_id,
        elevator_number: raw.elevator_number,
        elevator_name: raw.elevator_name,
        created_at: raw.created_at,
        building_name: raw.building_name || raw.building?.name || 'مبنى غير محدد',
        maintenance_line_name:
          raw.maintenance_line_name
          || raw.elevator_line?.name
          || raw.building?.building_line?.name
          || 'غير محدد',
      }));

      setRecords((recordsRes.data || []) as OilRecord[]);
      setElevators(normalizedElevators);
    } catch (error: any) {
      toast.error(error.message || 'تعذر تحميل جدول الزيت. شغّل تحديث قاعدة البيانات أولاً.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role]);

  const latestByElevator = useMemo(() => {
    const result = new Map<string, OilRecord>();
    for (const record of records) {
      if (record.elevator_id && !result.has(record.elevator_id)) {
        result.set(record.elevator_id, record);
      }
    }
    return result;
  }, [records]);

  const sheetRows = useMemo<OilSheetRow[]>(() => elevators
    .map((elevator) => {
      const latestRecord = latestByElevator.get(elevator.id);
      return {
        elevator,
        latestRecord,
        nextChangeDate: latestRecord?.next_change_date || addSixMonths(elevator.created_at.slice(0, 10)),
      };
    })
    .sort((first, second) => {
      const lineOrder = first.elevator.maintenance_line_name.localeCompare(second.elevator.maintenance_line_name, 'ar');
      if (lineOrder !== 0) return lineOrder;
      const buildingOrder = first.elevator.building_name.localeCompare(second.elevator.building_name, 'ar');
      if (buildingOrder !== 0) return buildingOrder;
      return first.elevator.elevator_number - second.elevator.elevator_number;
    }), [elevators, latestByElevator]);

  const statusFor = (date: string, hasRecord: boolean) => {
    const days = Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);
    if (!hasRecord && days > 30) return { label: 'لم يسجل بعد', className: 'bg-muted text-muted-foreground' };
    if (days < 0) return { label: `متأخر ${Math.abs(days)} يوم`, className: 'bg-destructive/20 text-destructive' };
    if (days <= 30) return { label: `متبقي ${Math.max(days, 0)} يوم`, className: 'bg-warning/20 text-warning' };
    return { label: 'في الموعد', className: 'bg-success/20 text-success' };
  };

  const dueCount = sheetRows.filter((row) => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return new Date(`${row.nextChangeDate}T12:00:00`) <= limit;
  }).length;

  const filteredRows = sheetRows.filter((row) => {
    if (requestedElevator && row.elevator.id !== requestedElevator) return false;
    if (!requestedElevator && requestedBuilding && row.elevator.building_id !== requestedBuilding) return false;
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return [
      row.elevator.maintenance_line_name,
      row.elevator.building_name,
      row.elevator.elevator_name,
      row.elevator.elevator_number,
      row.latestRecord?.oil_type,
      row.latestRecord?.oil_brand,
    ].some((value) => String(value || '').toLowerCase().includes(text));
  });

  const openCompleteOil = (row: OilSheetRow) => {
    setSelectedElevator(row.elevator);
    setFormData({
      change_date: cairoDate(),
      exclude_from_finance: false,
      oil_type: row.latestRecord?.oil_type || '',
      oil_brand: row.latestRecord?.oil_brand || '',
      oil_quantity: Number(row.latestRecord?.oil_quantity || 0),
      price: Number(row.latestRecord?.price || 0),
      cost_amount: Number(row.latestRecord?.cost_amount || 0),
      notes: '',
    });
    setIsOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedElevator || !formData.change_date || !formData.oil_type.trim() || !formData.oil_brand.trim()) {
      toast.error('اختر تاريخ التغيير وأدخل نوع الزيت والماركة');
      return;
    }

    if (formData.change_date > cairoDate()) {
      toast.error('لا يمكن تسجيل تغيير الزيت بتاريخ مستقبلي');
      return;
    }

    const pressedAt = new Date().toISOString();
    const changeDate = formData.change_date;
    const payload = {
      building_id: selectedElevator.building_id,
      elevator_id: selectedElevator.id,
      oil_type: formData.oil_type.trim(),
      oil_brand: formData.oil_brand.trim(),
      oil_quantity: Number(formData.oil_quantity),
      price: Number(formData.price),
      cost_amount: Number(formData.cost_amount),
      change_date: changeDate,
      changed_at: pressedAt,
      next_change_date: addSixMonths(changeDate),
      notes: formData.notes.trim() || null,
      exclude_from_finance: formData.exclude_from_finance,
    };

    setSaving(true);
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
          p_exclude_from_finance: payload.exclude_from_finance,
        })
      : await supabase.from('oil_records').insert([payload]);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`تم تغيير الزيت. الموعد القادم ${payload.next_change_date}`);
    setIsOpen(false);
    setSelectedElevator(null);
    await fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل تريد حذف آخر سجل تغيير زيت؟ سيظل المصعد ظاهرًا في الجدول.')) return;
    try {
      await deleteRow('oil_records', id);
      toast.success('تم حذف سجل الزيت');
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || 'تعذر حذف السجل');
    }
  };

  const showFinancial = can('finance', 'view');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold font-heading">
          <Droplet className="h-6 w-6" />
          جدول تغيير الزيت
        </h2>
        <p className="text-muted-foreground">
          كل مصعد جديد يظهر هنا تلقائيًا تحت خطه ومبناه، والموعد القادم يُحسب بعد 6 أشهر من وقت تسجيل التغيير.
        </p>
      </div>

      {dueCount > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 font-medium">
          تنبيه: يوجد {dueCount} مصعد موعد تغيير زيته خلال 30 يومًا أو متأخر.
        </div>
      )}

      <div className="flex w-full items-center rounded-md border bg-card px-3 py-2 md:max-w-lg">
        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث بالخط أو المبنى أو المصعد أو نوع الزيت..."
          className="w-full border-none bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table className="min-w-[1100px]">
          <TableHeader className="sticky top-0 z-10 bg-muted/95">
            <TableRow>
              <TableHead className="text-right">الخط</TableHead>
              <TableHead className="text-right">المبنى</TableHead>
              <TableHead className="text-right">المصعد</TableHead>
              <TableHead className="text-right">آخر زيت</TableHead>
              {showFinancial && <TableHead className="text-right">السعر</TableHead>}
              <TableHead className="text-right">تاريخ آخر تغيير / وقت التسجيل</TableHead>
              <TableHead className="text-right">التغيير القادم</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={showFinancial ? 9 : 8} className="py-10 text-center">جاري تحميل جدول الزيت...</TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showFinancial ? 9 : 8} className="py-10 text-center text-muted-foreground">
                  لا توجد مصاعد مطابقة
                </TableCell>
              </TableRow>
            ) : filteredRows.map((row) => {
              const status = statusFor(row.nextChangeDate, Boolean(row.latestRecord));
              const elevatorLabel = row.elevator.elevator_name
                ? `${row.elevator.elevator_name} (${row.elevator.elevator_number})`
                : `مصعد ${row.elevator.elevator_number}`;
              return (
                <TableRow key={row.elevator.id}>
                  <TableCell className="font-medium">{row.elevator.maintenance_line_name}</TableCell>
                  <TableCell className="font-medium">{row.elevator.building_name}</TableCell>
                  <TableCell>{elevatorLabel}</TableCell>
                  <TableCell>
                    {row.latestRecord ? (
                      <div>
                        <div>{`${row.latestRecord.oil_type} — ${row.latestRecord.oil_brand} (${row.latestRecord.oil_quantity})`}</div>
                        {row.latestRecord.exclude_from_finance && (
                          <div className="mt-1 text-xs font-bold text-muted-foreground">سجل قديم — خارج المالية</div>
                        )}
                      </div>
                    ) : 'لم يسجل تغيير زيت'}
                  </TableCell>
                  {showFinancial && (
                    <TableCell>
                      {row.latestRecord ? Number(row.latestRecord.price || 0).toLocaleString('ar-EG') : '-'}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap">
                    {row.latestRecord
                      ? oilChangeDateTimeLabel(row.latestRecord.change_date, row.latestRecord.changed_at)
                      : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-bold">{row.nextChangeDate}</TableCell>
                  <TableCell>
                    <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can('oil', 'create') && (
                        <Button size="sm" onClick={() => openCompleteOil(row)} className="whitespace-nowrap bg-success text-success-foreground hover:bg-success/90">
                          <CheckCircle2 className="ml-1 h-4 w-4" />
                          تم تغيير الزيت
                        </Button>
                      )}
                      {row.latestRecord && can('oil', 'delete') && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(row.latestRecord?.id || '')}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">تأكيد تغيير الزيت</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p><strong>الخط:</strong> {selectedElevator?.maintenance_line_name}</p>
              <p><strong>المبنى:</strong> {selectedElevator?.building_name}</p>
              <p><strong>المصعد:</strong> {selectedElevator?.elevator_name || `مصعد ${selectedElevator?.elevator_number || ''}`}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>تاريخ تغيير الزيت</Label>
                <Input
                  type="date"
                  max={cairoDate()}
                  value={formData.change_date}
                  onChange={(event) => setFormData({ ...formData, change_date: event.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  الموعد القادم: {formData.change_date ? addSixMonths(formData.change_date) : '-'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>نوع الزيت</Label>
                <Input value={formData.oil_type} onChange={(event) => setFormData({ ...formData, oil_type: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>الماركة</Label>
                <Input value={formData.oil_brand} onChange={(event) => setFormData({ ...formData, oil_brand: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>الكمية</Label>
                <Input type="number" min="0" step="0.1" value={formData.oil_quantity} onChange={(event) => setFormData({ ...formData, oil_quantity: Number(event.target.value) })} />
              </div>
              {showFinancial && (
                <>
                  <div className="space-y-2">
                    <Label>المبلغ المحصل من العميل</Label>
                    <Input type="number" min="0" step="0.01" value={formData.price} onChange={(event) => setFormData({ ...formData, price: Number(event.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>تكلفة الزيت</Label>
                    <Input type="number" min="0" step="0.01" value={formData.cost_amount} onChange={(event) => setFormData({ ...formData, cost_amount: Number(event.target.value) })} />
                  </div>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-muted/30 p-3">
              <input
                type="checkbox"
                checked={formData.exclude_from_finance}
                onChange={(event) => setFormData({ ...formData, exclude_from_finance: event.target.checked })}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block font-bold">هذا تغيير زيت قديم — لا يُضاف إلى المالية</span>
                <span className="block text-xs text-muted-foreground">
                  سيتم حفظ السعر والتكلفة للتوثيق فقط بدون إنشاء إيراد أو مصروف.
                </span>
              </span>
            </label>
            <p className="text-sm text-muted-foreground">
              سيتم حفظ التاريخ المختار ووقت التسجيل الحالي، وحساب الموعد القادم تلقائيًا بعد 6 أشهر من التاريخ المختار.
            </p>
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                <CheckCircle2 className="ml-2 h-4 w-4" />
                {saving ? 'جاري التسجيل...' : 'تأكيد تم تغيير الزيت'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OilRecords;
