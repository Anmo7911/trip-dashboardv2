# Squad Goals — Vercel + Supabase migration

This project is a standalone Vite frontend with a Vercel Node serverless API and Supabase PostgreSQL/Storage backend.

## Files

- `src/index.html` — original UI, CSS, HTML structure and client-side behavior, with only the Google Apps Script transport replaced by `/api/index`.
- `api/index.js` — server-side replacement for the GAS functions.
- `schema.sql` — PostgreSQL schema and Storage bucket policies.
- `scripts/import-sheet-csv.mjs` — imports exported Google Sheet CSVs while preserving the original column positions.
- `.env.example` — required environment variables.
- `vercel.json` — Vercel build/runtime configuration.

## Original sheet column mapping

### Settings
`Settings` preserves the spreadsheet grid by row: `row_number` is the original sheet row number and `A..W` are `col_a..col_w`. The original backend reads B1, B2/C2, B4/B5, B7/B8, B10/C10, B11/B12/B13/C13, B18/B19/B20/C20, B21/B22/B23. Import the original Settings CSV unchanged so the row numbers remain identical.

### Transactions
`A..J` -> `col_a..col_j`:
UTR, date, amount, category, source, notes, system timestamp, paidVia, claimant, verification status.

### Members
`A..P` -> `col_a..col_p`:
name, role/designation, image, PIN, attendance, unused F, signature, member role, verification, background-related source column, unused K, assigned role detail, unused M, final sign-off, mobile, email.
`member_sheet_meta` stores the original Members J2, J3 and Q2 values because those are sheet-level cells rather than member rows.

### Places
`A..L` -> `col_a..col_l`:
name, note, status, visited timestamp, unused E, trip day, target date, ETA, location, details, ATA, cancel status.

### Budget
`A..B` -> `col_a..col_b`: category, amount.

### Messages
`A..C` -> `col_a..col_c`: timestamp, sender, message.

### Archives
`A..E` -> `col_a..col_e`: name, dates, total spent, report URL, gallery URL.

## Storage

The private `trip-assets` bucket is used by the API for new signatures and general uploads. Storage references are stored as `storage:<path>` and converted to signed URLs server-side. Existing external URLs are preserved unchanged.

## Deployment

1. Create a Supabase project.
2. Run `schema.sql` in the Supabase SQL editor.
3. Export the original Google Sheets tabs as CSV and import them with `scripts/import-sheet-csv.mjs`.
4. Put `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `SUPABASE_STORAGE_BUCKET` into Vercel Environment Variables.
5. Push this directory to GitHub and import the repository into Vercel.
6. Build command: `npm run build`.
