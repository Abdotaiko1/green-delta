import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { parseSpreadsheetFile, SpreadsheetCell, SpreadsheetRow } from '@/lib/excelImport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type ImportPayload = {
  building_name: string;
  customer_number: string;
  month: string;
  monthly_price: number;
  elevator_count: number;
  customer_name: string;
  maintenance_line: string;
  address: string;
  owner: string;
};

type PreviewRow = { sourceRow: number; payload: ImportPayload; errors: string[] };
type MaintenanceLine = { id: string; name: string };
type ImportResult = {
  customers_created: number;
  buildings_created: number;
  buildings_updated: number;
  elevators_created: number;
  elevators_updated: number;
  errors: { row: number; building_name: string; message: string }[];
};

const aliases: Record<keyof ImportPayload, string[]> = {
  building_name: ['اسم العمارة', 'اسم المبنى', 'building_name', 'building name'],
  customer_number: ['رقم العميل', 'رقم الهاتف', 'هاتف العميل', 'customer_number', 'customer number', 'phone'],
  month: ['الشهر', 'شهر البداية', 'month', 'start month'],
  monthly_price: ['سعر الشهر', 'السعر الشهري', 'سعر الصيانة', 'monthly_price', 'monthly price'],
  elevator_count: ['عدد المصاعد', 'المصاعد', 'elevator_count', 'elevator count'],
  customer_name: ['اسم العميل', 'العميل', 'customer_name', 'customer name'],
  maintenance_line: ['خط الصيانة', 'الخط', 'maintenance_line', 'maintenance line'],
  address: ['العنوان', 'عنوان العمارة', 'address'],
  owner: ['المالك', 'المسؤول', 'owner'],
};

const normalizeDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
const cleanText = (value: SpreadsheetCell | undefined) => value == null ? '' : String(value).trim();
const readField = (row: SpreadsheetRow, field: keyof ImportPayload) => {
  const accepted = aliases[field].map((alias) => alias.toLowerCase());
  return Object.entries(row).find(([header]) => accepted.includes(header.trim().toLowerCase()))?.[1];
};
const parseNumber = (value: SpreadsheetCell | undefined) => {
  if (typeof value === 'number') return value;
  const normalized = normalizeDigits(cleanText(value)).replace(/[,،]/g, '');
  return normalized === '' ? Number.NaN : Number(normalized);
};

const arabicMonths: Record<string, number> = {
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6,
  يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

const parseMonth = (value: SpreadsheetCell | undefined) => {
  const yearNow = new Date().getFullYear();
  if (typeof value === 'number') {
    if (value >= 1 && value <= 12) return `${yearNow}-${String(value).padStart(2, '0')}`;
    if (value > 20_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }
  const normalized = normalizeDigits(cleanText(value));
  if (/^\d{4}-(0?[1-9]|1[0-2])$/.test(normalized)) {
    const [year, month] = normalized.split('-');
    return `${year}-${month.padStart(2, '0')}`;
  }
  if (/^(0?[1-9]|1[0-2])[/-]\d{4}$/.test(normalized)) {
    const [month, year] = normalized.split(/[/-]/);
    return `${year}-${month.padStart(2, '0')}`;
  }
  if (/^(0?[1-9]|1[0-2])$/.test(normalized)) return `${yearNow}-${normalized.padStart(2, '0')}`;
  const namedMonth = Object.entries(arabicMonths).find(([name]) => normalized.includes(name));
  if (!namedMonth) return '';
  return `${normalized.match(/\d{4}/)?.[0] || yearNow}-${String(namedMonth[1]).padStart(2, '0')}`;
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeRows = (rows: SpreadsheetRow[], maintenanceLine: string): PreviewRow[] => {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const buildingName = cleanText(readField(row, 'building_name'));
    const customerNumber = normalizeDigits(cleanText(readField(row, 'customer_number')));
    const monthValue = readField(row, 'month');
    const month = cleanText(monthValue) ? parseMonth(monthValue) : currentMonth();
    const monthlyPrice = parseNumber(readField(row, 'monthly_price'));
    const requestedCount = parseNumber(readField(row, 'elevator_count'));
    const elevatorCount = Number.isFinite(requestedCount) ? Math.trunc(requestedCount) : 1;
    const errors: string[] = [];
    if (!buildingName) errors.push('اسم العمارة مطلوب');
    if (cleanText(monthValue) && !month) errors.push('الشهر غير صحيح؛ استخدم 2026-07 أو 7/2026');
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) errors.push('سعر الشهر غير صحيح');
    if (elevatorCount < 1 || elevatorCount > 50) errors.push('عدد المصاعد يجب أن يكون من 1 إلى 50');
    if (!maintenanceLine) errors.push('اختر خط الصيانة قبل الاستيراد');
    const key = buildingName.toLowerCase();
    if (buildingName && seen.has(key)) errors.push('اسم العمارة مكرر داخل الملف');
    seen.add(key);
    return {
      sourceRow: index + 2,
      payload: {
        building_name: buildingName,
        customer_number: customerNumber,
        month,
        monthly_price: Number.isFinite(monthlyPrice) ? monthlyPrice : 0,
        elevator_count: elevatorCount,
        customer_name: cleanText(readField(row, 'customer_name')) || buildingName,
        maintenance_line: maintenanceLine,
        address: cleanText(readField(row, 'address')),
        owner: cleanText(readField(row, 'owner')),
      },
      errors,
    };
  });
};

const BulkImport: React.FC = () => {
  const { can } = useAuth();
  const [fileName, setFileName] = useState('');
  const [sourceRows, setSourceRows] = useState<SpreadsheetRow[]>([]);
  const [maintenanceLines, setMaintenanceLines] = useState<MaintenanceLine[]>([]);
  const [maintenanceLineId, setMaintenanceLineId] = useState('');
  const [linesLoading, setLinesLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const allowed = can('buildings', 'create') && can('elevators', 'create');
  const selectedLine = maintenanceLines.find((line) => line.id === maintenanceLineId);
  const rows = useMemo(() => normalizeRows(sourceRows, selectedLine?.name || ''), [sourceRows, selectedLine?.name]);
  const validRows = useMemo(() => rows.filter((row) => row.errors.length === 0), [rows]);
  const invalidRows = rows.length - validRows.length;

  useEffect(() => {
    const loadLines = async () => {
      setLinesLoading(true);
      const { data, error } = await supabase.from('maintenance_lines').select('id, name').order('name');
      if (error) toast.error('تعذر تحميل خطوط الصيانة');
      setMaintenanceLines((data || []) as MaintenanceLine[]);
      setLinesLoading(false);
    };
    void loadLines();
  }, []);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!maintenanceLineId) {
      toast.error('اختر خط الصيانة أولًا');
      return;
    }
    setReading(true);
    setResult(null);
    setSourceRows([]);
    setFileName(file.name);
    try {
      const parsedRows = await parseSpreadsheetFile(file);
      if (parsedRows.length === 0) throw new Error('الملف لا يحتوي على صفوف بيانات');
      if (parsedRows.length > 500) throw new Error('الحد الأقصى 500 صف في الملف الواحد');
      setSourceRows(parsedRows);
      toast.success(`تمت قراءة ${parsedRows.length} صف`);
    } catch (error: any) {
      setFileName('');
      toast.error(error.message || 'تعذر قراءة الملف');
    } finally {
      setReading(false);
    }
  };

  const runImport = async () => {
    if (!allowed || validRows.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('import_buildings_and_elevators', {
        p_rows: validRows.map((row) => row.payload),
      });
      if (error) throw error;
      const nextResult = data as ImportResult;
      setResult(nextResult);
      if (nextResult.errors?.length) toast.warning(`تم الاستيراد مع ${nextResult.errors.length} خطأ`);
      else toast.success('تم استيراد المباني والمصاعد بنجاح');
    } catch (error: any) {
      toast.error(error.message || 'فشل الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  if (!allowed) {
    return (
      <Card>
        <CardHeader><CardTitle>غير مسموح</CardTitle><CardDescription>تحتاج صلاحية إضافة المباني والمصاعد لاستخدام استيراد Excel.</CardDescription></CardHeader>
        <CardContent><Button asChild variant="outline"><Link to="/buildings">العودة للمباني</Link></Button></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h2 className="text-2xl font-bold font-heading">استيراد المباني والمصاعد من Excel</h2><p className="text-muted-foreground">راجع البيانات والأخطاء ثم احفظ الصفوف السليمة دفعة واحدة.</p></div>
        <Button asChild variant="outline"><Link to="/buildings"><ArrowRight className="ml-2 h-4 w-4" />العودة للمباني</Link></Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" />ارفع ملف البيانات</CardTitle><CardDescription>XLSX أو CSV، بحد أقصى 500 صف.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="bulk-import-line" className="text-sm font-bold">خط الصيانة لكل المباني في الملف <span className="text-destructive">*</span></label>
              <select
                id="bulk-import-line"
                value={maintenanceLineId}
                onChange={(event) => {
                  setMaintenanceLineId(event.target.value);
                  setResult(null);
                }}
                disabled={linesLoading || reading || importing}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{linesLoading ? 'جارٍ تحميل الخطوط...' : 'اختر خط الصيانة'}</option>
                {maintenanceLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">سيتم ربط جميع المباني والمصاعد الموجودة في الملف بهذا الخط.</p>
            </div>
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center hover:bg-primary/10">
              {reading ? <Loader2 className="mb-3 h-9 w-9 animate-spin text-primary" /> : <Upload className="mb-3 h-9 w-9 text-primary" />}
              <span className="font-bold">{fileName || 'اضغط لاختيار ملف Excel'}</span>
              <span className="mt-1 text-sm text-muted-foreground">لن يتم الحفظ قبل المعاينة والضغط على استيراد.</span>
              <Input type="file" accept=".xlsx,.csv" className="hidden" disabled={reading || importing || !maintenanceLineId} onChange={(event) => handleFile(event.target.files?.[0])} />
            </label>
            <Button asChild variant="secondary"><a href="/templates/green-delta-building-import-template.xlsx" download><Download className="ml-2 h-4 w-4" />تحميل قالب Excel الجاهز</a></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>الأعمدة المطلوبة</CardTitle><CardDescription>اكتب اسم العمارة وسعر الشهر، والباقي اختياري.</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><strong>إجباري داخل الملف:</strong> اسم العمارة، سعر الشهر.</div>
            <div><strong>إجباري قبل الرفع:</strong> اختيار خط الصيانة، ويُطبّق على الملف كله.</div>
            <div><strong>اختياري:</strong> رقم العميل، الشهر، عدد المصاعد، اسم العميل، العنوان، المالك.</div>
            <div className="rounded-md bg-muted p-3 text-muted-foreground">إذا تركت الشهر فارغًا، يستخدم النظام الشهر الحالي. ويمكن كتابته <span dir="ltr">2026-07</span> أو <span dir="ltr">7/2026</span> أو «يوليو 2026».</div>
            <div className="rounded-md bg-primary/10 p-3 text-primary">سعر الشهر هو إجمالي العمارة ويوزعه النظام على مصاعدها. عدد المصاعد الافتراضي واحد، ويولد كودًا تلقائيًا لكل مبنى ومصعد.</div>
          </CardContent>
        </Card>
      </div>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><CardTitle>معاينة قبل الحفظ</CardTitle><CardDescription>{validRows.length} صف صالح{invalidRows ? `، و${invalidRows} صف به أخطاء ولن يُحفظ` : '، وجميع الصفوف سليمة'}</CardDescription></div>
              <Button onClick={runImport} disabled={importing || validRows.length === 0}>{importing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}استيراد {validRows.length} صف</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[520px] overflow-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">صف</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">اسم العمارة</TableHead><TableHead className="text-right">رقم العميل</TableHead><TableHead className="text-right">الشهر</TableHead><TableHead className="text-right">سعر الشهر</TableHead><TableHead className="text-right">المصاعد</TableHead><TableHead className="text-right">الخط</TableHead><TableHead className="min-w-64 text-right">الملاحظات</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.sourceRow} className={row.errors.length ? 'bg-destructive/5' : ''}>
                      <TableCell>{row.sourceRow}</TableCell>
                      <TableCell>{row.errors.length ? <Badge variant="destructive"><AlertCircle className="ml-1 h-3 w-3" />خطأ</Badge> : <Badge><CheckCircle2 className="ml-1 h-3 w-3" />سليم</Badge>}</TableCell>
                      <TableCell className="font-medium">{row.payload.building_name || '—'}</TableCell>
                      <TableCell dir="ltr" className="text-right">{row.payload.customer_number || '—'}</TableCell>
                      <TableCell dir="ltr" className="text-right">{row.payload.month || '—'}</TableCell>
                      <TableCell>{row.payload.monthly_price.toLocaleString('ar-EG')}</TableCell>
                      <TableCell>{row.payload.elevator_count}</TableCell>
                      <TableCell>{row.payload.maintenance_line}</TableCell>
                      <TableCell className={row.errors.length ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{row.errors.join(' — ') || 'جاهز للاستيراد'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-primary/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-primary"><CheckCircle2 className="h-5 w-5" />نتيجة الاستيراد</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['عملاء جدد', result.customers_created],
              ['مبانٍ جديدة', result.buildings_created],
              ['مبانٍ محدثة', result.buildings_updated],
              ['مصاعد جديدة', result.elevators_created],
              ['أخطاء قاعدة البيانات', result.errors?.length || 0],
            ].map(([label, value]) => <div key={String(label)} className="rounded-md bg-muted p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value}</div></div>)}
            {result.errors?.length > 0 && <div className="sm:col-span-2 lg:col-span-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{result.errors.map((error) => <div key={`${error.row}-${error.message}`}>صف {error.row + 1}: {error.building_name} — {error.message}</div>)}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkImport;
