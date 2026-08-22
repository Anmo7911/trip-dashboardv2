/*
  Google Sheet -> Supabase import helper.
  Export each original sheet as CSV and run:
    node --env-file=.env scripts/import-sheet-csv.mjs Settings sheet-export/Settings.csv
    node --env-file=.env scripts/import-sheet-csv.mjs Places sheet-export/Places.csv
*/
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [sheetName, csvPath] = process.argv.slice(2);
const map = {
  Settings: 'settings_sheet',
  Transactions: 'transactions_sheet',
  Members: 'members_sheet',
  Places: 'places_sheet',
  Budget: 'budget_sheet',
  Messages: 'messages_sheet',
  Archives: 'archives_sheet'
};

if (!sheetName || !csvPath || !map[sheetName]) {
  throw new Error(`Usage: node scripts/import-sheet-csv.mjs <Settings|Transactions|Members|Places|Budget|Messages|Archives> <csv-file>`);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

function parseCSV(input) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function sanitizeValue(val) {
  if (!val) return null;
  const lower = val.toLowerCase().trim();
  const invalidPlaceholders = [
    '', 'to be announce', 'to be announced', 'tba', 'tbd', 
    'n/a', 'na', '-', 'none', 'null', 'morning', 'evening', 'afternoon'
  ];
  if (invalidPlaceholders.includes(lower)) return null;

  // Convert 12-hour AM/PM times (e.g., "8:00 PM") to 24-hour "20:00:00"
  const time12Regex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i;
  const match = val.match(time12Regex);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const seconds = match[3] || '00';
    const meridian = match[4].toLowerCase();

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
  }

  return val;
}

const table = map[sheetName];
const rawContent = fs.readFileSync(csvPath, 'utf8');
const rows = parseCSV(rawContent);

if (rows.length === 0) {
  console.log(`No rows found in ${csvPath}`);
  process.exit(0);
}

// Drop header row 1
const dataRows = rows.slice(1);

const records = dataRows.map((cols, rowIndex) => {
  const record = {};
  const max = Math.min(cols.length, 23);
  for (let i = 0; i < max; i++) {
    const rawVal = cols[i] ?? '';
    record[`col_${String.fromCharCode(97 + i)}`] = sanitizeValue(rawVal);
  }
  if (sheetName === 'Settings') {
    record.row_number = rowIndex + 1;
  }
  return record;
});

if (records.length === 0) {
  console.log(`0 data rows found to insert.`);
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

if (sheetName === 'Settings') {
  const { error } = await supabase.from(table).upsert(records, { onConflict: 'row_number' });
  if (error) throw error;
} else {
  const { error } = await supabase.from(table).insert(records);
  if (error) throw error;
}

console.log(`✅ Successfully imported ${records.length} row(s) into ${table}!`);
