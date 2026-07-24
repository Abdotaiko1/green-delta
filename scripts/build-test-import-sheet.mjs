import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = '/Users/abdelrahmanmohamed/Documents/Codex/2026-07-16/subase-supbase/outputs/019f6a72-4ac2-7310-80fb-a59346f3fc47';
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('بيانات الاستيراد');
sheet.showGridLines = false;

sheet.getRange('A1:H4').values = [
  ['اسم العمارة', 'رقم العميل', 'سعر الشهر', 'الشهر', 'عدد المصاعد', 'اسم العميل', 'العنوان', 'المالك'],
  ['عمارة تجريبية النيل', '', 1500, '', 2, 'عميل تجريبي 1', '6 أكتوبر - عنوان تجريبي', 'مسؤول تجريبي 1'],
  ['عمارة تجريبية الهرم', '01012345678', 2200, '2026-08', 1, 'عميل تجريبي 2', 'حدائق الأهرام - عنوان تجريبي', 'مسؤول تجريبي 2'],
  ['عمارة تجريبية فيصل', '', 3000, '2026-09', 3, 'عميل تجريبي 3', 'فيصل - عنوان تجريبي', 'مسؤول تجريبي 3'],
];

sheet.getRange('A1:H1').format = {
  fill: '#008A4B',
  font: { bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  borders: { preset: 'outside', style: 'thin', color: '#006837' },
};
sheet.getRange('A1:H1').format.rowHeight = 32;
sheet.getRange('A2:H4').format = {
  verticalAlignment: 'center',
  borders: { preset: 'inside', style: 'thin', color: '#E5E7EB' },
};
sheet.getRange('A2:H4').format.rowHeight = 28;
sheet.getRange('B2:B4').format.numberFormat = '@';
sheet.getRange('C2:C4').format.numberFormat = '#,##0.00';
sheet.getRange('D2:D4').format.numberFormat = '@';
sheet.getRange('E2:E4').format.numberFormat = '0';
sheet.getRange('A:A').format.columnWidth = 25;
sheet.getRange('B:B').format.columnWidth = 20;
sheet.getRange('C:E').format.columnWidth = 15;
sheet.getRange('F:F').format.columnWidth = 23;
sheet.getRange('G:H').format.columnWidth = 30;
sheet.freezePanes.freezeRows(1);

const table = sheet.tables.add('A1:H4', true, 'GreenDeltaTestImport');
table.style = 'TableStyleMedium4';

const check = await workbook.inspect({
  kind: 'table',
  range: 'بيانات الاستيراد!A1:H4',
  include: 'values,formulas',
  tableMaxRows: 10,
  tableMaxCols: 10,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: 'بيانات الاستيراد',
  range: 'A1:H4',
  scale: 1.5,
  format: 'png',
});
await fs.writeFile(`${outputDir}/green-delta-test-import-preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = `${outputDir}/green-delta-test-import.xlsx`;
await output.save(outputPath);
console.log(outputPath);
