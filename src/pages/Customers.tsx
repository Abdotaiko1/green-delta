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

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

const Customers: React.FC = () => {
  const { can } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      toast.error('خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', phone: '', email: '', address: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingId(customer.id);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        const { error } = await supabase.from('customers').update(formData).eq('id', editingId);
        if (error) throw error;
        toast.success('تم التحديث بنجاح');
      } else {
        const { error } = await supabase.from('customers').insert([formData]);
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
    if (!window.confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    try {
      await deleteRow('customers', id);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء الحذف');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.includes(search) || c.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة العملاء</h2>
          <p className="text-muted-foreground">عرض وإدارة بيانات العملاء والتواصل.</p>
        </div>
        {can('customers', 'create') && <Button onClick={openAddModal} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          إضافة عميل
        </Button>}
      </div>

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
        <input
          type="text"
          placeholder="بحث بالاسم أو الهاتف..."
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
              <TableHead className="text-right">البريد الإلكتروني</TableHead>
              <TableHead className="text-right">العنوان</TableHead>
              <TableHead className="text-right w-24">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد مطابقة</TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="dir-ltr text-right">{customer.phone}</TableCell>
                  <TableCell className="dir-ltr text-right">{customer.email || '-'}</TableCell>
                  <TableCell>{customer.address}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {can('customers', 'update') && <Button variant="ghost" size="icon" onClick={() => openEditModal(customer)}>
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>}
                      {can('customers', 'delete') && <Button variant="ghost" size="icon" onClick={() => handleDelete(customer.id)}>
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
            <DialogTitle className="text-right">{editingId ? 'تعديل عميل' : 'إضافة عميل جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input name="name" value={formData.name} onChange={handleInputChange} required />
            </div>
            <div className="space-y-2">
              <Label>الهاتف</Label>
              <Input name="phone" value={formData.phone} onChange={handleInputChange} required className="dir-ltr text-right" />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" name="email" value={formData.email} onChange={handleInputChange} className="dir-ltr text-right" />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input name="address" value={formData.address} onChange={handleInputChange} required />
            </div>
            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">{editingId ? 'حفظ التعديلات' : 'إضافة العميل'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
