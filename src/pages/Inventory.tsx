import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, ShoppingCart, TriangleAlert, PackageCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRow } from '@/lib/database';

type InventoryItem = {
  id: string;
  part_code: string;
  part_name: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  supplier: string;
  minimum_stock: number;
  last_purchase_at: string | null;
};

type PurchaseRequest = {
  id: string;
  inventory_id: string;
  requested_quantity: number;
  supplier: string | null;
  unit_price: number;
  status: 'مطلوب' | 'تم الطلب' | 'تم الاستلام' | 'ملغي';
  notes: string | null;
  created_at: string;
  inventory?: { part_code: string; part_name: string } | null;
};

const Inventory: React.FC = () => {
  const { can } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  
  const [formData, setFormData] = useState({
    part_code: '',
    part_name: '',
    quantity: 0,
    purchase_price: 0,
    sale_price: 0,
    supplier: '',
    minimum_stock: 5,
  });
  const [requestForm, setRequestForm] = useState({ inventory_id: '', requested_quantity: 1, supplier: '', unit_price: 0, notes: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [itemsRes, requestsRes] = await Promise.all([
        supabase.from('inventory').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_requests').select('*, inventory(part_code, part_name)').order('created_at', { ascending: false }).limit(100),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      setItems((itemsRes.data || []) as InventoryItem[]);
      setPurchaseRequests(requestsRes.error ? [] : (requestsRes.data || []) as unknown as PurchaseRequest[]);
    } catch (error: any) {
      toast.error('خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? Number(value) : value 
    }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ part_code: '', part_name: '', quantity: 0, purchase_price: 0, sale_price: 0, supplier: '', minimum_stock: 5 });
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingId(item.id);
    setFormData({
      part_code: item.part_code,
      part_name: item.part_name,
      quantity: item.quantity,
      purchase_price: item.purchase_price,
      sale_price: item.sale_price,
      supplier: item.supplier,
      minimum_stock: item.minimum_stock,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, part_code: formData.part_code.trim().toUpperCase() || null };
    try {
      if (editingId) {
        const { error } = await supabase.from('inventory').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('تم التحديث بنجاح');
      } else {
        const { error } = await supabase.from('inventory').insert([payload]);
        if (error) throw error;
        toast.success('تمت الإضافة بنجاح');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.code === '23505' ? 'كود القطعة مستخدم بالفعل' : error.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه القطعة؟')) return;
    try {
      await deleteRow('inventory', id);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء الحذف');
    }
  };

  const openPurchaseRequest = (item?: InventoryItem) => {
    setRequestForm({
      inventory_id: item?.id || '',
      requested_quantity: item ? Math.max(item.minimum_stock - item.quantity, 1) : 1,
      supplier: item?.supplier || '',
      unit_price: item?.purchase_price || 0,
      notes: '',
    });
    setRequestOpen(true);
  };

  const savePurchaseRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestForm.inventory_id || requestForm.requested_quantity <= 0) return toast.error('اختر القطعة وأدخل كمية صحيحة');
    setSavingRequest(true);
    const { error } = await supabase.from('purchase_requests').insert({
      inventory_id: requestForm.inventory_id,
      requested_quantity: requestForm.requested_quantity,
      supplier: requestForm.supplier.trim() || null,
      unit_price: requestForm.unit_price,
      notes: requestForm.notes.trim() || null,
    });
    setSavingRequest(false);
    if (error) return toast.error(error.message || 'تعذر إنشاء طلب الشراء');
    toast.success('تم إنشاء طلب الشراء');
    setRequestOpen(false);
    fetchData();
  };

  const updateRequestStatus = async (request: PurchaseRequest, status: PurchaseRequest['status']) => {
    const message = status === 'تم الاستلام'
      ? `سيتم إضافة ${request.requested_quantity} قطعة إلى المخزون. هل تريد المتابعة؟`
      : `هل تريد تغيير حالة الطلب إلى «${status}»؟`;
    if (!window.confirm(message)) return;
    const { error } = await supabase.from('purchase_requests').update({ status }).eq('id', request.id);
    if (error) return toast.error(error.message || 'تعذر تحديث طلب الشراء');
    toast.success(status === 'تم الاستلام' ? 'تم الاستلام وتحديث كمية المخزون تلقائيًا' : 'تم تحديث حالة الطلب');
    fetchData();
  };

  const filteredItems = items.filter(i => 
    i.part_name.includes(search) || i.part_code.includes(search) || i.supplier.includes(search)
  );
  const lowStockItems = items.filter((item) => item.quantity <= item.minimum_stock);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة المخزن</h2>
          <p className="text-muted-foreground">عرض وإدارة قطع الغيار والأسعار.</p>
        </div>
        {can('inventory', 'create') && <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openPurchaseRequest()} className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> طلب شراء</Button>
          <Button onClick={openAddModal} className="flex items-center gap-2"><Plus className="w-4 h-4" /> إضافة قطعة غيار</Button>
        </div>}
      </div>

      {lowStockItems.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
        <div className="mb-3 flex items-center gap-2 font-bold text-destructive"><TriangleAlert className="h-5 w-5" /> تنبيه: {lowStockItems.length} قطعة وصلت إلى الحد الأدنى أو أقل</div>
        <div className="flex flex-wrap gap-2">{lowStockItems.map((item) => <Button key={item.id} variant="outline" size="sm" disabled={!can('inventory', 'create')} onClick={() => openPurchaseRequest(item)}>{item.part_code} — {item.part_name} ({item.quantity}/{item.minimum_stock})</Button>)}</div>
      </div>}

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
        <input
          type="text"
          placeholder="بحث بكود القطعة أو اسمها أو المورد..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-sm"
        />
      </div>

      <div className="bg-card rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">كود القطعة</TableHead>
              <TableHead className="text-right">اسم القطعة</TableHead>
              <TableHead className="text-right">الكمية</TableHead>
              <TableHead className="text-right">الحد الأدنى</TableHead>
              <TableHead className="text-right">سعر الشراء</TableHead>
              <TableHead className="text-right">سعر البيع</TableHead>
              <TableHead className="text-right">المورد</TableHead>
              {(can('inventory', 'create') || can('inventory', 'update') || can('inventory', 'delete')) && <TableHead className="text-right">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا يوجد مطابقة</TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-bold text-primary">{item.part_code}</TableCell>
                  <TableCell className="font-medium">{item.part_name}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.quantity <= item.minimum_stock ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                      {item.quantity}
                    </span>
                  </TableCell>
                  <TableCell>{item.minimum_stock}</TableCell>
                  <TableCell className="dir-ltr text-right">{item.purchase_price} ج.م{item.last_purchase_at && <div className="text-xs text-muted-foreground">آخر شراء: {new Date(item.last_purchase_at).toLocaleDateString('ar-EG')}</div>}</TableCell>
                  <TableCell className="dir-ltr text-right">{item.sale_price} ج.م</TableCell>
                  <TableCell>{item.supplier}</TableCell>
                  {(can('inventory', 'create') || can('inventory', 'update') || can('inventory', 'delete')) && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {can('inventory', 'create') && <Button variant="ghost" size="icon" onClick={() => openPurchaseRequest(item)} title="طلب شراء"><ShoppingCart className="w-4 h-4 text-amber-600" /></Button>}
                        {can('inventory', 'update') && <Button variant="ghost" size="icon" onClick={() => openEditModal(item)}>
                          <Edit className="w-4 h-4 text-primary" />
                        </Button>}
                        {can('inventory', 'delete') && <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingId ? 'تعديل قطعة' : 'إضافة قطعة جديدة'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>كود القطعة</Label>
              {editingId ? (
                <Input value={formData.part_code} readOnly className="dir-ltr text-right bg-muted font-mono" />
              ) : (
                <div className="h-10 rounded-md border bg-muted px-3 flex items-center text-sm text-muted-foreground">يُنشأ تلقائيًا مثل SP0001</div>
              )}
            </div>
            <div className="space-y-2">
              <Label>اسم القطعة</Label>
              <Input name="part_name" value={formData.part_name} onChange={handleInputChange} required />
            </div>
            <div className="space-y-2">
              <Label>الكمية المتوفرة</Label>
              <Input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} required min={0} />
            </div>
            <div className="space-y-2">
              <Label>الحد الأدنى للمخزون</Label>
              <Input type="number" name="minimum_stock" value={formData.minimum_stock} onChange={handleInputChange} required min={0} />
              <p className="text-xs text-muted-foreground">سيظهر تنبيه عندما تصبح الكمية مساوية لهذا الرقم أو أقل.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>سعر الشراء (ج.م)</Label>
                <Input type="number" step="0.01" name="purchase_price" value={formData.purchase_price} onChange={handleInputChange} required min={0} className="dir-ltr text-right" />
              </div>
              <div className="space-y-2">
                <Label>سعر البيع (ج.م)</Label>
                <Input type="number" step="0.01" name="sale_price" value={formData.sale_price} onChange={handleInputChange} required min={0} className="dir-ltr text-right" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>المورد</Label>
              <Input name="supplier" value={formData.supplier} onChange={handleInputChange} required />
            </div>
            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">{editingId ? 'حفظ التعديلات' : 'إضافة القطعة'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <div className="flex items-center justify-between"><div><h3 className="text-lg font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> طلبات الشراء</h3><p className="text-sm text-muted-foreground">عند اختيار «تم الاستلام» تضاف الكمية للمخزون تلقائيًا ويُحفظ آخر سعر شراء.</p></div></div>
        <div className="overflow-x-auto rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">القطعة</TableHead><TableHead className="text-right">الكمية</TableHead><TableHead className="text-right">المورد / السعر</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">إجراء</TableHead></TableRow></TableHeader>
          <TableBody>{purchaseRequests.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد طلبات شراء</TableCell></TableRow> : purchaseRequests.map((request) => <TableRow key={request.id}><TableCell>{new Date(request.created_at).toLocaleDateString('ar-EG')}</TableCell><TableCell><div className="font-mono text-xs text-primary">{request.inventory?.part_code}</div><div className="font-medium">{request.inventory?.part_name}</div></TableCell><TableCell className="font-bold">{request.requested_quantity}</TableCell><TableCell>{request.supplier || '—'}<div className="text-xs text-muted-foreground">{Number(request.unit_price).toLocaleString('ar-EG')} ج.م للوحدة</div></TableCell><TableCell><span className={`rounded-full px-2 py-1 text-xs font-bold ${request.status === 'تم الاستلام' ? 'bg-success/15 text-success' : request.status === 'ملغي' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>{request.status}</span></TableCell><TableCell><div className="flex gap-1">{request.status === 'مطلوب' && can('inventory', 'update') && <Button size="sm" variant="outline" onClick={() => updateRequestStatus(request, 'تم الطلب')}>تم الطلب</Button>}{['مطلوب', 'تم الطلب'].includes(request.status) && can('inventory', 'update') && <Button size="sm" onClick={() => updateRequestStatus(request, 'تم الاستلام')} className="bg-emerald-600 hover:bg-emerald-700"><PackageCheck className="ml-1 h-4 w-4" /> استلام</Button>}{!['تم الاستلام', 'ملغي'].includes(request.status) && can('inventory', 'update') && <Button size="icon" variant="ghost" onClick={() => updateRequestStatus(request, 'ملغي')}><XCircle className="h-4 w-4 text-destructive" /></Button>}</div></TableCell></TableRow>)}</TableBody>
        </Table></div>
      </div>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent className="max-w-lg" dir="rtl"><DialogHeader><DialogTitle className="text-right">إنشاء طلب شراء</DialogTitle></DialogHeader><form onSubmit={savePurchaseRequest} className="space-y-4">
        <div className="space-y-2"><Label>القطعة *</Label><select value={requestForm.inventory_id} onChange={(event) => { const item = items.find((row) => row.id === event.target.value); setRequestForm((current) => ({ ...current, inventory_id: event.target.value, supplier: item?.supplier || '', unit_price: item?.purchase_price || 0, requested_quantity: item ? Math.max(item.minimum_stock - item.quantity, 1) : 1 })); }} required className="h-10 w-full rounded-md border bg-background px-3"><option value="">اختر القطعة</option>{items.map((item) => <option key={item.id} value={item.id}>{item.part_code} — {item.part_name} (المتاح {item.quantity})</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>الكمية المطلوبة *</Label><Input type="number" min="1" value={requestForm.requested_quantity} onChange={(event) => setRequestForm({ ...requestForm, requested_quantity: Number(event.target.value) })} required /></div><div className="space-y-2"><Label>سعر الوحدة المتوقع</Label><Input type="number" min="0" step="0.01" value={requestForm.unit_price} onChange={(event) => setRequestForm({ ...requestForm, unit_price: Number(event.target.value) })} /></div></div>
        <div className="space-y-2"><Label>المورد</Label><Input value={requestForm.supplier} onChange={(event) => setRequestForm({ ...requestForm, supplier: event.target.value })} /></div>
        <div className="space-y-2"><Label>ملاحظات</Label><Input value={requestForm.notes} onChange={(event) => setRequestForm({ ...requestForm, notes: event.target.value })} /></div>
        <DialogFooter><Button type="submit" disabled={savingRequest}>{savingRequest ? 'جاري الحفظ...' : 'حفظ طلب الشراء'}</Button></DialogFooter>
      </form></DialogContent></Dialog>
    </div>
  );
};

export default Inventory;
