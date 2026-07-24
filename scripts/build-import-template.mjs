import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = process.env.PROJECT_ROOT || new URL('..', import.meta.url).pathname;
const outputDir = `${root}/../outputs/019f6a72-4ac2-7310-80fb-a59346f3fc47`;
const publicDir = `${root}/public/templates`;
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });

const workbook = Workbook.create();
const data = workbook.worksheets.add('بيانات الاستيراد');
const instructions = workbook.worksheets.add('التعليمات');
const example = workbook.worksheets.add('مثال');
const headers = [
  'اسم العمارة',
  'رقم العميل',
  'سعر الشهر',
  'الشهر',
  'عدد المصاعد',
  'اسم العميل',
  'العنوان',
  'المالك',
];

data.showGridLines = false;
data.getRange('A1:H1').values = [headers];
data.getRange('A1:H1').format = {
  fill: '#008A4B',
  font: { bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  borders: { preset: 'outside', style: 'thin', color: '#006837' },
};
data.getRange('A1:H1').format.rowHeight = 30;
data.getRange('A2:H101').format = {
  fill: '#FFFFFF',
  borders: { preset: 'inside', style: 'thin', color: '#E5E7EB' },
  verticalAlignment: 'center',
};
data.getRange('B2:B101').format.numberFormat = '@';
data.getRange('C2:C101').format.numberFormat = '#,##0.00';
data.getRange('D2:D101').format.numberFormat = '@';
data.getRange('E2:E101').format.numberFormat = '0';
data.getRange('A:A').format.columnWidth = 24;
data.getRange('B:B').format.columnWidth = 18;
data.getRange('C:E').format.columnWidth = 15;
data.getRange('F:F').format.columnWidth = 22;
data.getRange('G:H').format.columnWidth = 28;
data.freezePanes.freezeRows(1);
data.getRange('E2:E101').dataValidation = {
  rule: { type: 'whole', operator: 'between', formula1: 1, formula2: 50 },
};
data.tables.add('A1:H101', true, 'BuildingImportTable').style = 'TableStyleMedium4';

instructions.showGridLines = false;
instructions.getRange('A1:F1').merge();
instructions.getRange('A1').values = [['تعليمات استيراد مباني ومصاعد Green Delta']];
instructions.getRange('A1:F1').format = {
  fill: '#008A4B',
  font: { bold: true, color: '#FFFFFF', size: 16 },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
};
instructions.getRange('A1:F1').format.rowHeight = 38;
instructions.getRange('A3:B12').values = [
  ['العمود', 'طريقة الكتابة'],
  ['اسم العمارة', 'إجباري — اسم واضح وغير مكرر داخل الملف'],
  ['رقم العميل', 'اختياري — اكتبه كنص للحفاظ على الصفر في بداية الرقم'],
  ['سعر الشهر', 'إجباري — إجمالي اشتراك العمارة الشهري بالجنيه المصري، ويوزعه النظام على مصاعدها'],
  ['الشهر', 'اختياري — إذا تُرك فارغًا يستخدم الشهر الحالي. مثال 2026-07 أو 7/2026'],
  ['عدد المصاعد', 'اختياري — الافتراضي 1، والحد الأقصى 50'],
  ['اسم العميل', 'اختياري — إذا تُرك فارغًا يستخدم اسم العمارة'],
  ['خط الصيانة', 'إجباري من شاشة الرفع — اختره مرة واحدة قبل رفع الملف ليُطبق على كل الصفوف'],
  ['العنوان', 'اختياري ويمكن استكماله لاحقًا'],
  ['المالك', 'اختياري ويمكن استكماله لاحقًا'],
];
instructions.getRange('A3:B3').format = {
  fill: '#E8F5EE',
  font: { bold: true, color: '#006837' },
  borders: { preset: 'outside', style: 'thin', color: '#B7DCC8' },
};
instructions.getRange('A4:B12').format = {
  wrapText: true,
  verticalAlignment: 'center',
  borders: { preset: 'inside', style: 'thin', color: '#E5E7EB' },
};
instructions.getRange('A:A').format.columnWidth = 22;
instructions.getRange('B:B').format.columnWidth = 65;
instructions.getRange('A4:B12').format.rowHeight = 32;
instructions.freezePanes.freezeRows(3);

example.showGridLines = false;
example.getRange('A1:H2').values = [
  headers,
  ['عمارة النيل', '', 1500, '', 2, 'أحمد محمد', '6 أكتوبر - الحي السابع', 'أحمد محمد'],
];
example.getRange('A1:H1').format = {
  fill: '#008A4B',
  font: { bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
};
example.getRange('A2:H2').format = { fill: '#FFF8E1', verticalAlignment: 'center' };
example.getRange('B2').format.numberFormat = '@';
example.getRange('C2').format.numberFormat = '#,##0.00';
example.getRange('D2').format.numberFormat = '@';
example.getRange('A:H').format.columnWidth = 22;
example.getRange('G:H').format.columnWidth = 28;
example.freezePanes.freezeRows(1);

const inspect = await workbook.inspect({
  kind: 'table',
  range: 'بيانات الاستيراد!A1:H8',
  include: 'values,formulas',
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log(inspect.ndjson);

const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(formulaErrors.ndjson);

for (const sheetName of ['بيانات الاستيراد', 'التعليمات', 'مثال']) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(`${outputDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const finalPath = `${outputDir}/green-delta-building-import-template.xlsx`;
const publicPath = `${publicDir}/green-delta-building-import-template.xlsx`;
await xlsx.save(finalPath);
await fs.copyFile(finalPath, publicPath);
console.log(finalPath);
