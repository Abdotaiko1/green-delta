import React, { useEffect, useState } from 'react';
import { Clock3, MapPin, RefreshCw } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

type LoginSession = {
  id: string;
  login_at: string;
  logout_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  users?: { full_name: string; role: 'manager' | 'accountant' | 'technician' };
};

const roleLabel = { manager: 'مدير', accountant: 'محاسب', technician: 'فني' };

const Attendance: React.FC = () => {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('login_sessions')
      .select('id, login_at, logout_at, latitude, longitude, accuracy_meters, users(full_name, role)')
      .order('login_at', { ascending: false })
      .limit(300);
    if (error) toast.error(error.message || 'تعذر تحميل سجل الدخول');
    else setSessions((data || []) as unknown as LoginSession[]);
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, []);

  const formatDate = (value: string | null) => value
    ? new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    : '-';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Clock3 className="w-6 h-6" /> الحضور وتسجيل الدخول</h2>
          <p className="text-muted-foreground">وقت الدخول والخروج وموقع تسجيل الدخول لكل مستخدم.</p>
        </div>
        <Button variant="outline" onClick={fetchSessions}><RefreshCw className="w-4 h-4 ml-1" /> تحديث</Button>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-right">المستخدم</TableHead>
            <TableHead className="text-right">الصلاحية</TableHead>
            <TableHead className="text-right">الدخول</TableHead>
            <TableHead className="text-right">الخروج</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">موقع الدخول</TableHead>
          </TableRow></TableHeader>
          <TableBody>{loading ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow> : sessions.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد جلسات دخول بعد</TableCell></TableRow> : sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell className="font-bold">{session.users?.full_name || 'مستخدم'}</TableCell>
              <TableCell>{session.users?.role ? roleLabel[session.users.role] : '-'}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(session.login_at)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(session.logout_at)}</TableCell>
              <TableCell><span className={`px-2 py-1 rounded-full text-xs font-bold ${session.logout_at ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'}`}>{session.logout_at ? 'خرج' : 'متصل'}</span></TableCell>
              <TableCell>{session.latitude != null && session.longitude != null ? <a href={`https://www.google.com/maps?q=${session.latitude},${session.longitude}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> فتح الموقع{session.accuracy_meters ? ` (دقة ${Math.round(session.accuracy_meters)}م)` : ''}</a> : <span className="text-muted-foreground">لم يسمح بالموقع</span>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Attendance;
