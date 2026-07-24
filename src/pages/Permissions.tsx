import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type Role = 'manager' | 'accountant' | 'technician';
type PermissionRow = { resource: string; can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean };

const roles: { value: Role; label: string }[] = [
  { value: 'manager', label: 'المدير' },
  { value: 'accountant', label: 'المحاسب' },
  { value: 'technician', label: 'الفني' },
];

const resources = [
  ['dashboard', 'لوحة التحكم'], ['buildings', 'المباني'], ['elevators', 'المصاعد'],
  ['customers', 'العملاء'], ['technicians', 'الفنيون والمهام'], ['faults', 'الأعطال'],
  ['maintenance', 'الصيانة والخطوط'], ['inventory', 'المخزن'], ['oil', 'تغيير الزيت'],
  ['spare_parts', 'تغيير قطع الغيار'], ['finance', 'المالية'], ['reports', 'التقارير'],
  ['attendance', 'الحضور والدخول'],
  ['audit_log', 'سجل الحركات'],
] as const;

const emptyRows = (): PermissionRow[] => resources.map(([resource]) => ({
  resource, can_view: false, can_create: false, can_update: false, can_delete: false,
}));

const Permissions: React.FC = () => {
  const { refreshPermissions } = useAuth();
  const [role, setRole] = useState<Role>('technician');
  const [rows, setRows] = useState<PermissionRow[]>(emptyRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('role_permissions').select('*').eq('role', role);
      if (error) toast.error(error.message);
      const stored = new Map((data || []).map((row) => [row.resource, row]));
      setRows(emptyRows().map((row) => ({ ...row, ...(stored.get(row.resource) || {}) })));
      setLoading(false);
    };
    load();
  }, [role]);

  const toggle = (resource: string, key: keyof Omit<PermissionRow, 'resource'>, value: boolean) => {
    setRows((current) => current.map((row) => {
      if (row.resource !== resource) return row;
      const next = { ...row, [key]: value };
      if (key === 'can_view' && !value) {
        next.can_create = false;
        next.can_update = false;
        next.can_delete = false;
      } else if (key !== 'can_view' && value) {
        next.can_view = true;
      }
      return next;
    }));
  };

  const save = async () => {
    setSaving(true);
    const payload = rows.map((row) => ({ role, ...row, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('role_permissions').upsert(payload, { onConflict: 'role,resource' });
    setSaving(false);
    if (error) return toast.error(error.message);
    await refreshPermissions();
    toast.success('تم حفظ صلاحيات الدور بنجاح');
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6" /> إدارة الصلاحيات</h2><p className="text-muted-foreground">حدد ما يستطيع كل دور مشاهدته أو إضافته أو تعديله أو حذفه.</p></div>
      <Button onClick={save} disabled={saving || loading}><Save className="ml-2 h-4 w-4" />{saving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}</Button>
    </div>
    <div className="flex flex-wrap gap-2">{roles.map((item) => <Button key={item.value} variant={role === item.value ? 'default' : 'outline'} onClick={() => setRole(item.value)}>{item.label}</Button>)}</div>
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table><TableHeader><TableRow><TableHead className="text-right">القسم</TableHead><TableHead className="text-center">يشاهد</TableHead><TableHead className="text-center">يضيف</TableHead><TableHead className="text-center">يعدل</TableHead><TableHead className="text-center">يحذف</TableHead></TableRow></TableHeader>
      <TableBody>{loading ? <TableRow><TableCell colSpan={5} className="py-10 text-center">جاري التحميل...</TableCell></TableRow> : rows.map((row) => <TableRow key={row.resource}>
        <TableCell className="font-medium">{resources.find(([key]) => key === row.resource)?.[1]}</TableCell>
        {(['can_view', 'can_create', 'can_update', 'can_delete'] as const).map((key) => <TableCell key={key} className="text-center"><Switch checked={row[key]} onCheckedChange={(value) => toggle(row.resource, key, value)} /></TableCell>)}
      </TableRow>)}</TableBody></Table>
    </div>
    <p className="text-sm text-muted-foreground">إلغاء «يشاهد» يلغي الإضافة والتعديل والحذف تلقائيًا. صفحة الصلاحيات نفسها تظل للمدير فقط لحماية النظام.</p>
  </div>;
};

export default Permissions;
