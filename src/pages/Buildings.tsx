import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Archive, RotateCcw, MapPin, Droplet, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type Building = {
  id: string;
  building_code?: string;
  name: string;
  address: string;
  owner: string;
  phone: string;
  elevator_count: number;
  maintenance_line_id: string;
  maintenance_lines?: { name: string };
  google_maps_link?: string;
  notes: string;
  oil_records?: { next_change_date: string }[];
  archived_at: string | null;
};

const Buildings: React.FC = () => {
  const { role, can } = useAuth();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [maintenanceLines, setMaintenanceLines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    owner: '',
    phone: '',
    elevator_count: 0,
    google_maps_link: '',
    notes: '',
    maintenance_line_id: '',
  });

  const fetchBuildings = async () => {
    try {
      setLoading(true);
      const [{ data, error }, oilResult, linesResult] = await Promise.all([
        supabase.from('buildings').select('*, maintenance_lines(name)').order('created_at', { ascending: false }),
        supabase.from('oil_records').select('building_id, next_change_date'),
        supabase.from('maintenance_lines').select('id, name').order('name'),
      ]);
        
      if (error) throw error;
      const oilRows = oilResult.error ? [] : (oilResult.data || []);
      setBuildings((data || []).map((building) => ({
        ...building,
        oil_records: oilRows.filter((record) => record.building_id === building.id),
      })));
      if (linesResult.error) throw linesResult.error;
      setMaintenanceLines(linesResult.data || []);
    } catch (error: any) {
      console.error('Error fetching buildings:', error);
      toast.error('خطأ في جلب بيانات المباني');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuildings();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', address: '', owner: '', phone: '', elevator_count: 0, google_maps_link: '', notes: '', maintenance_line_id: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (building: Building) => {
    setEditingId(building.id);
    setFormData({
      name: building.name,
      address: building.address,
      owner: building.owner,
      phone: building.phone,
      elevator_count: building.elevator_count,
      google_maps_link: building.google_maps_link || '',
      notes: building.notes || '',
      maintenance_line_id: building.maintenance_line_id,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.maintenance_line_id) {
      toast.error('اختيار خط الصيانة مطلوب');
      return;
    }
    try {
      if (editingId) {
        const { error } = await supabase.from('buildings').update(formData).eq('id', editingId);
        if (error) throw error;
        toast.success('تم تحديث المبنى بنجاح');
      } else {
        const { error } = await supabase.from('buildings').insert([formData]);
        if (error) throw error;
        toast.success('تمت إضافة المبنى بنجاح');
      }
      setIsModalOpen(false);
      fetchBuildings();
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleArchive = async (building: Building) => {
    const restoring = Boolean(building.archived_at);
    if (!restoring && !window.confirm('هل تريد إيقاف وأرشفة هذا المبنى وكل مصاعده؟ ستظل جميع الفواتير والسجلات محفوظة.')) return;
    try {
      const { error } = await supabase.rpc('set_building_archived', {
        p_building_id: building.id,
        p_archived: !restoring,
      });
      if (error) throw error;
      toast.success(restoring ? 'تمت إعادة المبنى ومصاعده إلى القوائم النشطة' : 'تم إيقاف وأرشفة المبنى ومصاعده مع الاحتفاظ بكل السجلات');
      fetchBuildings();
    } catch (error: any) {
      toast.error(error.message || 'خطأ أثناء تغيير حالة أرشفة المبنى');
    }
  };

  const filteredBuildings = buildings.filter(b => 
    (showArchived ? Boolean(b.archived_at) : !b.archived_at) && (
      (b.building_code || '').toLowerCase().includes(search.toLowerCase()) ||
      b.name.includes(search) || b.address.includes(search) || (b.maintenance_lines?.name || '').includes(search)
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">إدارة المباني</h2>
          <p className="text-muted-foreground">عرض وإدارة جميع المباني المسجلة في النظام.</p>
        </div>
        {can('buildings', 'create') && (
          <div className="flex flex-wrap gap-2">
            {can('elevators', 'create') && (
              <Button asChild variant="outline">
                <Link to="/bulk-import" className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  استيراد Excel
                </Link>
              </Button>
            )}
            <Button onClick={openAddModal} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              إضافة مبنى
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center bg-card rounded-md border px-3 py-2 w-full md:max-w-md">
        <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
        <input
          type="text"
          placeholder="بحث باسم المبنى أو العنوان..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-sm"
        />
      </div>
      {can('buildings', 'delete') && (
        <Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)} className="flex items-center gap-2">
          {showArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          {showArchived ? 'عرض المباني النشطة' : 'عرض المباني المؤرشفة'}
        </Button>
      )}

      <div className="bg-card rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">كود المبنى</TableHead>
              <TableHead className="text-right">اسم المبنى</TableHead>
              <TableHead className="text-right">خط الصيانة</TableHead>
              <TableHead className="text-right">العنوان</TableHead>
              <TableHead className="text-right">المالك</TableHead>
              <TableHead className="text-right">الهاتف</TableHead>
              <TableHead className="text-right">المصاعد</TableHead>
              {(can('buildings', 'update') || can('buildings', 'delete')) && <TableHead className="text-right w-24">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={role === 'manager' ? 8 : 7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
              </TableRow>
            ) : filteredBuildings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={role === 'manager' ? 8 : 7} className="text-center py-8 text-muted-foreground">لا توجد مباني مطابقة للبحث</TableCell>
              </TableRow>
            ) : (
              filteredBuildings.map((building) => (
                <TableRow key={building.id} className="cursor-pointer hover:bg-muted/60" onClick={() => navigate(`/buildings/${building.id}`)}>
                  <TableCell className="font-mono text-xs">{building.building_code || '—'}</TableCell>
                  <TableCell className="font-medium">{building.name}</TableCell>
                  <TableCell><span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{building.maintenance_lines?.name || '-'}</span></TableCell>
                  {role === 'manager' && <TableCell>
                    {building.address}
                    {building.google_maps_link && (
                      <a href={building.google_maps_link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-primary hover:underline flex items-center gap-1 text-xs mt-1">
                        <MapPin className="w-3 h-3" />
                        عرض الخريطة
                      </a>
                    )}
                  </TableCell>}
                  <TableCell>{building.owner}</TableCell>
                  <TableCell className="dir-ltr text-right">{building.phone}</TableCell>
                  {role === 'manager' && <TableCell>
                    {building.elevator_count}
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const hasLateOrClose = building.oil_records?.some(r => {
                        if (!r.next_change_date) return false;
                        const diffTime = new Date(r.next_change_date).getTime() - new Date(today).getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return diffDays <= 7;
                      });
                      if (hasLateOrClose) {
                        return <div className="text-xs text-destructive font-bold flex items-center gap-1 mt-1"><Droplet className="w-3 h-3" /> زيت</div>;
                      }
                      return null;
                    })()}
                  </TableCell>}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild className="hidden md:flex">
                        <Link to={`/oil?building=${building.id}`} onClick={(event) => event.stopPropagation()} className="flex items-center gap-1">
                          <Droplet className="w-4 h-4" />
                          <span className="text-xs">سجل الزيت</span>
                        </Link>
                      </Button>
                      {can('buildings', 'update') && <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openEditModal(building); }}>
                        <Edit className="w-4 h-4 text-primary" />
                      </Button>}
                      {can('buildings', 'delete') && <Button title={building.archived_at ? 'إعادة للتشغيل' : 'إيقاف وأرشفة'} variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); handleArchive(building); }}>
                        {building.archived_at ? <RotateCcw className="w-4 h-4 text-success" /> : <Archive className="w-4 h-4 text-destructive" />}
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
            <DialogTitle className="text-right">{editingId ? 'تعديل مبنى' : 'إضافة مبنى جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>خط الصيانة *</Label>
              <select name="maintenance_line_id" value={formData.maintenance_line_id} onChange={handleInputChange} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="" disabled>اختر الخط التابع له المبنى</option>
                {maintenanceLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
              </select>
              {maintenanceLines.length === 0 && <p className="text-xs text-destructive">أضف خطًا أولاً من صفحة إدارة الصيانة.</p>}
            </div>
            <div className="space-y-2">
              <Label>اسم المبنى</Label>
              <Input name="name" value={formData.name} onChange={handleInputChange} required />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input name="address" value={formData.address} onChange={handleInputChange} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المالك</Label>
                <Input name="owner" value={formData.owner} onChange={handleInputChange} required />
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف</Label>
                <Input name="phone" value={formData.phone} onChange={handleInputChange} required className="dir-ltr text-right" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>عدد المصاعد</Label>
              <Input type="number" name="elevator_count" value={formData.elevator_count} onChange={handleInputChange} required min={0} />
            </div>
            <div className="space-y-2">
              <Label>رابط Google Maps (اختياري)</Label>
              <Input name="google_maps_link" value={formData.google_maps_link} onChange={handleInputChange} placeholder="https://goo.gl/maps/..." className="dir-ltr text-right" />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input name="notes" value={formData.notes} onChange={handleInputChange} />
            </div>
            <DialogFooter className="sm:justify-start pt-4">
              <Button type="submit" className="w-full sm:w-auto">{editingId ? 'حفظ التعديلات' : 'إضافة المبنى'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Buildings;
