/*
  Google Sheet -> Supabase import helper.
  Export each original sheet as CSV and run:
    node scripts/import-sheet-csv.mjs Settings settings.csv
    node scripts/import-sheet-csv.mjs Transactions transactions.csv
  Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
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
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c === '"'){
      if(quoted && input[i+1] === '"'){ cell+='"'; i++; }
      else quoted=!quoted;
    } else if(c===',' && !quoted){ row.push(cell); cell=''; }
    else if((c==='\\n'||c==='\\r') && !quoted){
      if(c==='\\r' && input[i+1]==='\\n') i++;
      row.push(cell); rows.push(row); row=[]; cell='';
    } else cell+=c;
  }
  if(cell.length || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
const table=map[sheetName];
const rows=parseCSV(fs.readFileSync(csvPath,'utf8')).filter(r=>r.some(Boolean));
const dataRows = sheetName === 'Places' ? rows : rows.slice(1);
const records = dataRows.map((cols, rowIndex) => {
  const record={};
  const max=Math.min(cols.length, 23);
  for(let i=0;i<max;i++) record[`col_${String.fromCharCode(97+i)}`]=cols[i] ?? '';
  if (sheetName === 'Settings') record.row_number = rowIndex + 1;
  return record;
});
const supabase=createClient(url,key,{auth:{persistSession:false}});
if(sheetName==='Settings'){
  const {error}=await supabase.from(table).upsert(records, { onConflict: 'row_number' });
  if(error) throw error;
}else{
  const {error}=await supabase.from(table).insert(records);
  if(error) throw error;
}
console.log(`Imported ${records.length} row(s) into ${table}.`);
