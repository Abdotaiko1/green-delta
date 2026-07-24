import React from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

const Reports: React.FC = () => {
  const handlePrint = () => {
    window.print();
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data || !data.length) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => 
      Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const csv = `${headers}\n${rows}`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportReport = async (table: string, filename: string) => {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      downloadCSV(data, filename);
      toast.success('تم التصدير بنجاح');
    } catch (err: any) {
      toast.error('حدث خطأ أثناء التصدير');
    }
  };

  const exportRevenue = async () => {
    try {
      const { data, error } = await supabase.from('inventory').select('part_name, sale_price, purchase_price');
      if (error) throw error;
      const reportData = data.map(item => ({
        القطعة: item.part_name,
        'سعر الشراء': item.purchase_price,
        'سعر البيع': item.sale_price,
        'الربح': item.sale_price - item.purchase_price
      }));
      downloadCSV(reportData, 'تقرير_الايرادات');
      toast.success('تم التصدير بنجاح');
    } catch (err: any) {
      toast.error('حدث خطأ أثناء التصدير');
    }
  };

  const reports = [
    { title: 'تقرير الأعطال', description: 'تصدير بيانات الأعطال والحالة الحالية', action: () => exportReport('faults', 'تقرير_الاعطال') },
    { title: 'تقرير الصيانة', description: 'تصدير بيانات الصيانة الدورية والطارئة', action: () => exportReport('maintenance', 'تقرير_الصيانة') },
    { title: 'تقرير الفنيين', description: 'تصدير قائمة الفنيين وحالتهم', action: () => exportReport('technicians', 'تقرير_الفنيين') },
    { title: 'تقرير العقود (العملاء)', description: 'تصدير قائمة العملاء وبياناتهم', action: () => exportReport('customers', 'تقرير_العملاء') },
    { title: 'تقرير الإيرادات (المخزون)', description: 'تقرير مالي عن المخزون والأرباح المتوقعة', action: exportRevenue },
    { title: 'دفتر المالية الكامل', description: 'تصدير جميع الإيرادات والمصروفات والمرتبات وصافي الحركات', action: () => exportReport('elevator_financial_entries', 'دفتر_المالية') },
    { title: 'تقرير المباني', description: 'تصدير قائمة المباني والمصاعد', action: () => exportReport('buildings', 'تقرير_المباني') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold font-heading">التقارير</h2>
          <p className="text-muted-foreground">تصدير وطباعة التقارير والإحصائيات الخاصة بالنظام.</p>
        </div>
        <Button onClick={handlePrint} className="flex items-center gap-2" variant="outline">
          <Printer className="w-4 h-4" />
          طباعة الصفحة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report, index) => (
          <Card key={index} className="print:break-inside-avoid">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">{report.title}</CardTitle>
              </div>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 print:hidden">
              <div className="flex gap-2">
                <Button onClick={report.action} className="flex-1 flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  تصدير Excel (CSV)
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Reports;
