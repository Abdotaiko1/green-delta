export type SpreadsheetCell = string | number | boolean | null;
export type SpreadsheetRow = Record<string, SpreadsheetCell>;

const decodeText = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);

const unzipXlsxEntries = async (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;

  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }

  if (eocd < 0) throw new Error('ملف Excel غير صالح أو تالف');

  const entryCount = view.getUint16(eocd + 10, true);
  let centralOffset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, Uint8Array>();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw new Error('تعذر قراءة محتويات ملف Excel');
    }

    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const fileName = decodeText(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error('تعذر قراءة جزء من ملف Excel');
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);

    if (method === 0) {
      entries.set(fileName, compressed);
    } else if (method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      entries.set(fileName, new Uint8Array(await new Response(stream).arrayBuffer()));
    } else {
      throw new Error('طريقة ضغط ملف Excel غير مدعومة');
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const elementsByLocalName = (parent: Document | Element, localName: string) =>
  Array.from(parent.getElementsByTagName('*')).filter((element) => element.localName === localName);

const columnNumber = (reference: string) => {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() || '';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const parseXlsx = async (file: File): Promise<SpreadsheetRow[]> => {
  const entries = await unzipXlsxEntries(await file.arrayBuffer());
  const parser = new DOMParser();
  const sharedStringsXml = entries.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml
    ? elementsByLocalName(parser.parseFromString(decodeText(sharedStringsXml), 'application/xml'), 'si')
      .map((item) => elementsByLocalName(item, 't').map((text) => text.textContent || '').join(''))
    : [];
  const sheetName = Array.from(entries.keys())
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];

  if (!sheetName) throw new Error('لم يتم العثور على ورقة بيانات داخل الملف');

  const sheetXml = parser.parseFromString(decodeText(entries.get(sheetName)!), 'application/xml');
  const matrix = elementsByLocalName(sheetXml, 'row').map((row) => {
    const cells: SpreadsheetCell[] = [];
    for (const cell of elementsByLocalName(row, 'c')) {
      const reference = cell.getAttribute('r') || '';
      const type = cell.getAttribute('t');
      const valueElement = elementsByLocalName(cell, 'v')[0];
      const raw = valueElement?.textContent ?? '';
      let value: SpreadsheetCell = raw;

      if (type === 's') value = sharedStrings[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = elementsByLocalName(cell, 't').map((item) => item.textContent || '').join('');
      else if (type === 'b') value = raw === '1';
      else if (type !== 'str' && raw !== '' && Number.isFinite(Number(raw))) value = Number(raw);

      cells[columnNumber(reference)] = value;
    }
    return cells;
  }).filter((row) => row.some((value) => value !== undefined && value !== null && String(value).trim() !== ''));

  if (matrix.length < 2) return [];
  const headers = matrix[0].map((value) => String(value ?? '').replace(/^\uFEFF/, '').trim());
  return matrix.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])),
  );
};

const parseCsv = (text: string): SpreadsheetRow[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || null])),
  );
};

export const parseSpreadsheetFile = async (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return parseCsv(await file.text());
  if (extension === 'xlsx') return parseXlsx(file);
  throw new Error('ارفع ملف Excel بصيغة XLSX أو CSV');
};

