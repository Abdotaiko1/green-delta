import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type Role = 'manager' | 'accountant' | 'technician';
type Account = { id: string; email: string; full_name: string; role: Role };
type PermissionRow = {
  resource: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
};

const OWNER_EMAIL = 'greendelta@admin.com';

const resources = [
  ['dashboard', 'لوحة التحكم'], ['buildings', 'المباني'], ['elevators', 'المصاعد'],
  ['customers', 'العملاء'], ['technicians', 'الفنيون والمهام'], ['faults', 'الأعطال'],
  ['maintenance', 'الصيانة والخطوط'], ['inventory', 'المخزن'], ['oil', 'تغيير الزيت'],
  ['spare_parts', 'تغيير قطع الغيار'], ['finance', 'المالية'], ['reports', 'التقارير'],
  ['attendance', 'الحضور والدخول'], ['audit_log', 'سجل الحركات'],
] as const;

const roleLabels: Record<Role, string> = {
  manager: 'مدير',
  accountant: 'محاسب',
  technician: 'فني',
};

const emptyRows = (): PermissionRow[] => resources.map(([resource]) => ({
  resource,
  can_view: false,
  can_create: false,
  can_update: false,
  can_delete: false,
}));

const Permissions: React.FC = () => {
  const { isOwner, refreshPermissions } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [rows, setRows] = useState<PermissionRow[]>(emptyRows);
  const [search, setSearch] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasCustomPermissions, setHasCustomPermissions] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === selectedUserId) || null;
  const selectedIsOwner = selectedAccount?.email.toLowerCase() === OWNER_EMAIL;

  const filteredAccounts = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return accounts;
    return accounts.filter((account) =>
      [account.full_name, account.email, roleLabels[account.role]]
        .some((value) => value.toLowerCase().includes(text)),
    );
  }, [accounts, search]);

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      const { data, error } = await supabase.rpc('list_permission_accounts');
      setLoadingAccounts(false);
      if (error) {
        toast.error(error.message || 'تعذر تحميل الحسابات. شغّل تحديث قاعدة البيانات أولاً.');
        return;
      }
      const nextAccounts = (data || []) as Account[];
      setAccounts(nextAccounts);
      const firstEditable = nextAccounts.find((account) => account.email.toLowerCase() !== OWNER_EMAIL);
      setSelectedUserId(firstEditable?.id || nextAccounts[0]?.id || '');
    };
    if (isOwner) loadAccounts();
  }, [isOwner]);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!selectedAccount) {
        setRows(emptyRows());
        return;
      }
      if (selectedIsOwner) {
        setRows(emptyRows().map((row) => ({
          ...row,
          can_view: true,
          can_create: true,
          can_update: true,
          can_delete: true,
        })));
        setHasCustomPermissions(false);
        return;
      }

      setLoadingRows(true);
      const [userPermissionsRes, rolePermissionsRes] = await Promise.all([
        supabase
          .from('user_permissions')
          .select('resource, can_view, can_create, can_update, can_delete')
          .eq('user_id', selectedAccount.id),
        supabase
          .from('role_permissions')
          .select('resource, can_view, can_create, can_update, can_delete')
          .eq('role', selectedAccount.role),
      ]);
      setLoadingRows(false);

      if (userPermissionsRes.error) {
        toast.error(userPermissionsRes.error.message);
        return;
      }
      if (rolePermissionsRes.error) {
        toast.error(rolePermissionsRes.error.message);
        return;
      }

      const customRows = (userPermissionsRes.data || []) as PermissionRow[];
      const sourceRows = customRows.length > 0
        ? customRows
        : (rolePermissionsRes.data || []) as PermissionRow[];
      const stored = new Map(sourceRows.map((row) => [row.resource, row]));
      setRows(emptyRows().map((row) => ({ ...row, ...(stored.get(row.resource) || {}) })));
      setHasCustomPermissions(customRows.length > 0);
    };
    loadPermissions();
  }, [selectedAccount?.id, selectedAccount?.role, selectedIsOwner]);

  const toggle = (resource: string, key: keyof Omit<PermissionRow, 'resource'>, value: boolean) => {
    if (selectedIsOwner) return;
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
    if (!selectedAccount || selectedIsOwner) return;
    setSaving(true);
    const payload = rows.map((row) => ({
      user_id: selectedAccount.id,
      ...row,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('user_permissions').upsert(payload, {
      onConflict: 'user_id,resource',
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHasCustomPermissions(true);
    await refreshPermissions();
    toast.success(`تم حفظ صلاحيات ${selectedAccount.full_name}`);
  };

  const restoreRoleDefaults = async () => {
    if (!selectedAccount || selectedIsOwner) return;
    if (!window.confirm(`هل تريد إلغاء التخصيص والرجوع لصلاحيات دور ${roleLabels[selectedAccount.role]}؟`)) return;
    setSaving(true);
    const { error } = await supabase.from('user_permissions').delete().eq('user_id', selectedAccount.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data, error: roleError } = await supabase
      .from('role_permissions')
      .select('resource, can_view, can_create, can_update, can_delete')
      .eq('role', selectedAccount.role);
    if (roleError) {
      toast.error(roleError.message);
      return;
    }
    const stored = new Map(((data || []) as PermissionRow[]).map((row) => [row.resource, row]));
    setRows(emptyRows().map((row) => ({ ...row, ...(stored.get(row.resource) || {}) })));
    setHasCustomPermissions(false);
    toast.success('تم الرجوع إلى صلاحيات الدور الافتراضية');
  };

  if (!isOwner) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-center">
        <div>
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-2xl font-bold">إدارة الصلاحيات لمالك النظام فقط</h2>
          <p className="mt-2 text-muted-foreground">الحساب المسموح هو {OWNER_EMAIL}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6" />
            إدارة صلاحيات الحسابات
          </h2>
          <p className="text-muted-foreground">
            اختر مديرًا أو محاسبًا أو فنيًا وحدد له المشاهدة والإضافة والتعديل والحذف بشكل منفصل.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasCustomPermissions && !selectedIsOwner && (
            <Button variant="outline" onClick={restoreRoleDefaults} disabled={saving || loadingRows}>
              <RotateCcw className="ml-2 h-4 w-4" />
              صلاحيات الدور الافتراضية
            </Button>
          )}
          <Button onClick={save} disabled={saving || loadingRows || !selectedAccount || selectedIsOwner}>
            <Save className="ml-2 h-4 w-4" />
            {saving ? 'جاري الحفظ...' : 'حفظ صلاحيات الحساب'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-card p-4 md:grid-cols-[minmax(220px,1fr)_minmax(280px,2fr)]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو البريد أو الدور..."
            className="pr-9"
          />
        </div>
        <select
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          disabled={loadingAccounts}
          className="h-10 w-full rounded-md border bg-background px-3"
        >
          <option value="">{loadingAccounts ? 'جاري تحميل الحسابات...' : 'اختر الحساب'}</option>
          {filteredAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.full_name} — {account.email} — {roleLabels[account.role]}
            </option>
          ))}
        </select>
      </div>

      {selectedAccount && (
        <div className="rounded-md border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <strong>{selectedAccount.full_name}</strong>
            <span>{selectedAccount.email}</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">{roleLabels[selectedAccount.role]}</span>
            {selectedIsOwner ? (
              <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">مالك النظام — كل الصلاحيات ثابتة</span>
            ) : hasCustomPermissions ? (
              <span className="text-sm text-muted-foreground">صلاحيات مخصصة لهذا الحساب</span>
            ) : (
              <span className="text-sm text-muted-foreground">يستخدم صلاحيات دوره الافتراضية حتى تحفظ تخصيصًا</span>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">القسم</TableHead>
              <TableHead className="text-center">يشاهد</TableHead>
              <TableHead className="text-center">يضيف</TableHead>
              <TableHead className="text-center">يعدل</TableHead>
              <TableHead className="text-center">يحذف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingRows ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">جاري تحميل الصلاحيات...</TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.resource}>
                <TableCell className="font-medium">{resources.find(([key]) => key === row.resource)?.[1]}</TableCell>
                {(['can_view', 'can_create', 'can_update', 'can_delete'] as const).map((key) => (
                  <TableCell key={key} className="text-center">
                    <Switch
                      checked={row[key]}
                      disabled={!selectedAccount || selectedIsOwner}
                      onCheckedChange={(value) => toggle(row.resource, key, value)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        إلغاء «يشاهد» يلغي الإضافة والتعديل والحذف تلقائيًا. وحده حساب {OWNER_EMAIL} يستطيع فتح هذه الصفحة أو تغيير صلاحيات الآخرين.
      </p>
    </div>
  );
};

export default Permissions;
