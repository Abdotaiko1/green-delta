import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const workbookPath = '/Users/abdelrahmanmohamed/Documents/Codex/2026-07-16/subase-supbase/outputs/019f6a72-4ac2-7310-80fb-a59346f3fc47/green-delta-test-import.xlsx';
const outputDir = '/Users/abdelrahmanmohamed/Documents/Codex/2026-07-16/subase-supbase/outputs/019f6a72-4ac2-7310-80fb-a59346f3fc47';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));

const before = await workbook.inspect({
  kind: 'table,computedStyle',
  sheetId: 'بيانات الاستيراد',
  range: 'A1:C4',
  include: 'values,formulas',
  tableMaxRows: 5,
  tableMaxCols: 3,
});
console.log(before.ndjson);

const beforePreview = await workbook.render({
  sheetName: 'بيانات الاستيراد',
  range: 'A1:I4',
  scale: 1.5,
  format: 'png',
});
await fs.writeFile(`${outputDir}/green-delta-test-import-before.png`, new Uint8Array(await beforePreview.arrayBuffer()));

const sheet = workbook.worksheets.getItem('بيانات الاستيراد');
// Store the long identifier as a text-producing formula so spreadsheet
// viewers display every digit while the importer still reads the exact value.
sheet.getRange('B2').formulas = [['="0201233344455"']];
sheet.getRange('B2').format.numberFormat = '@';

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);

// Normalize B2 to an inline string in the generated OOXML. This preserves
// the leading zero and prevents Excel-compatible viewers from showing E+11.
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'green-delta-xlsx-'));
const patchedPath = path.join(os.tmpdir(), `green-delta-patched-${Date.now()}.xlsx`);
execFileSync('unzip', ['-q', workbookPath, '-d', tempDir]);
const worksheetPath = path.join(tempDir, 'xl', 'worksheets', 'sheet1.xml');
const worksheetXml = await fs.readFile(worksheetPath, 'utf8');
const patchedXml = worksheetXml.replace(
  /<x:c r="B2"[^>]*>[\s\S]*?<\/x:c>/,
  '<x:c r="B2" s="30" t="inlineStr"><x:is><x:t>0201233344455</x:t></x:is></x:c>',
);
if (patchedXml === worksheetXml) throw new Error('Could not locate B2 in worksheet XML');
await fs.writeFile(worksheetPath, patchedXml, 'utf8');
execFileSync('zip', ['-q', '-r', patchedPath, '.'], { cwd: tempDir });
await fs.copyFile(patchedPath, workbookPath);
await fs.rm(tempDir, { recursive: true, force: true });
await fs.rm(patchedPath, { force: true });

const verifiedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const check = await verifiedWorkbook.inspect({
  kind: 'table',
  range: 'بيانات الاستيراد!A1:I4',
  include: 'values,formulas',
  tableMaxRows: 5,
  tableMaxCols: 9,
});
console.log(check.ndjson);

const errors = await verifiedWorkbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(errors.ndjson);

const afterPreview = await verifiedWorkbook.render({
  sheetName: 'بيانات الاستيراد',
  range: 'A1:I4',
  scale: 1.5,
  format: 'png',
});
await fs.writeFile(`${outputDir}/green-delta-test-import-preview.png`, new Uint8Array(await afterPreview.arrayBuffer()));
console.log(workbookPath);
