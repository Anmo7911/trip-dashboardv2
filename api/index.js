import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// Fallback across all standard env variable names
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'trip-assets';

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function text(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function number(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function applySecurityMask(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts.map((part, index) => {
    if (part.length <= 2) return part.charAt(0) + 'x'.repeat(Math.max(0, part.length - 1));
    if (index === 0) return part.substring(0, 2) + 'x'.repeat(part.length - 2);
    if (index === parts.length - 1) return 'x'.repeat(part.length - 2) + part.substring(part.length - 2);
    return 'x'.repeat(part.length);
  }).join(' ');
}

function asIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? text(v) : d.toISOString();
}

function formatMonthDay(v, timeZone = 'Asia/Kolkata') {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return text(v);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone }).format(d);
}

function formatHHMM(v, timeZone = 'Asia/Kolkata') {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    const raw = text(v);
    return raw.length >= 5 ? raw.slice(0, 5) : raw;
  }
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d);
}

function json(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}

async function resolveAsset(value, expiresIn = 3600) {
  const raw = text(value);
  if (!raw) return '';
  if (!raw.startsWith('storage:')) return raw;
  const path = raw.slice('storage:'.length);
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) return '';
    return data?.signedUrl || '';
  } catch (err) {
    return '';
  }
}

async function dashboard() {
  const [
    settingsResult,
    txResult,
    membersResult,
    memberMetaResult,
    placesResult,
    budgetResult,
    messagesResult,
    archivesResult,
    appMetaResult
  ] = await Promise.all([
    supabase.from('settings_sheet').select('*').order('row_number', { ascending: true }),
    supabase.from('transactions_sheet').select('*').order('id', { ascending: true }),
    supabase.from('members_sheet').select('*').order('id', { ascending: true }),
    supabase.from('member_sheet_meta').select('*').limit(1).maybeSingle(),
    supabase.from('places_sheet').select('*').order('id', { ascending: true }),
    supabase.from('budget_sheet').select('*').order('id', { ascending: true }),
    supabase.from('messages_sheet').select('*').order('id', { ascending: false }).limit(50),
    supabase.from('archives_sheet').select('*').order('id', { ascending: true }),
    supabase.from('app_meta').select('*').limit(1).maybeSingle()
  ]);

  const settingsRows = settingsResult.data || [];
  const setting = (rowNumber, column) => {
    const row = settingsRows.find(r => Number(r.row_number) === rowNumber);
    return row ? row[`col_${column}`] : '';
  };
  const meta = appMetaResult?.data || {};
  const memberMeta = memberMetaResult?.data || {};

  const tripName = text(setting(2, 'b')) || 'App by Anmol';
  const secondaryTitle = text(setting(2, 'c')) || 'Zantar Mantar, Dilli';
  const tripNotice = text(setting(7, 'b'));
  const warningNotice = text(setting(8, 'b'));
  const startDate = setting(4, 'b') ? new Date(setting(4, 'b')).getTime() : null;
  const endDate = setting(5, 'b') ? new Date(setting(5, 'b')).getTime() : null;
  const eidStampImage = await resolveAsset(setting(12, 'b'));
  const guidelinesUrl = setting(11, 'b') || '';
  const tripReportUrl = setting(13, 'b') || '';
  const tripReportSubheading = text(setting(13, 'c'));
  const appStatus = text(setting(19, 'b')).toUpperCase();
  const signOffStatus = text(setting(21, 'b')).toLowerCase();
  const eidSubheading = text(setting(10, 'b'));
  const eidHeading = text(setting(10, 'c')) || tripName;
  const routeStatus = text(setting(18, 'b')).toUpperCase();
  const expenseStatus = text(setting(22, 'b'));
  const contributionToggle = text(setting(23, 'b')).toUpperCase();

  const categoryBudgets = { Food: 0, 'Entry Fee': 0, Fare: 0, Stay: 0, Water: 0, Other: 0 };
  let calculatedTotalBudget = 0;
  for (const row of budgetResult.data || []) {
    const catName = text(row.col_a);
    const catAmount = number(row.col_b);
    if (catName && Object.prototype.hasOwnProperty.call(categoryBudgets, catName)) {
      categoryBudgets[catName] = catAmount;
      calculatedTotalBudget += catAmount;
    }
  }
  const totalBudget = calculatedTotalBudget > 0 ? calculatedTotalBudget : number(setting(1, 'b'));

  const categorySpent = { Food: 0, 'Entry Fee': 0, Fare: 0, Stay: 0, Water: 0, Other: 0 };
  const memberContributions = {};
  const allTransactions = (txResult.data || []).filter(row => text(row.col_a) !== '');

  const transactions = allTransactions.map(row => {
    const amt = number(row.col_c);
    const cat = text(row.col_d);
    const claimant = text(row.col_i);
    const isVerified = text(row.col_j).toLowerCase() !== 'unverified';

    if (amt > 0 && isVerified) {
      if (Object.prototype.hasOwnProperty.call(categorySpent, cat)) categorySpent[cat] += amt;
      else categorySpent.Other += amt;
      if (claimant) memberContributions[claimant] = (memberContributions[claimant] || 0) + amt;
    }

    return {
      utr: text(row.col_a),
      date: asIso(row.col_b),
      amount: amt,
      category: cat,
      notes: row.col_f ?? '',
      isVerified
    };
  }).reverse();

  const isEncrypted = text(meta.security_status).toLowerCase() === 'encrypted';
  const defaultSecureAvatar = text(meta.default_secure_avatar) || 'https://ui-avatars.com/api/?name=U&background=cbd5e1&color=ffffff';
  const coordinatorBg = await resolveAsset(memberMeta.coordinator_bg);
  const memberBg = await resolveAsset(memberMeta.member_bg);
  const chiefCoordinatorSignature = await resolveAsset(memberMeta.chief_coordinator_signature);

  const members = [];
  for (const r of membersResult.data || []) {
    if (!text(r.col_a)) continue;
    const rawName = text(r.col_a);
    const roleName = text(r.col_b);
    const bgLink = roleName.toLowerCase().includes('coordinator') ? coordinatorBg : memberBg;
    let finalName = rawName;
    let finalImg = await resolveAsset(r.col_c);
    if (isEncrypted) {
      finalName = applySecurityMask(finalName);
      finalImg = defaultSecureAvatar;
    }
    members.push({
      name: finalName,
      role: roleName,
      img: finalImg,
      pin: text(r.col_d),
      attendance: text(r.col_e),
      designation: roleName,
      memberRole: text(r.col_h),
      verification: text(r.col_i),
      contribution: memberContributions[rawName] || 0,
      mobile: text(r.col_o),
      email: text(r.col_p),
      signature: await resolveAsset(r.col_g),
      bgImage: bgLink,
      finalSignOff: await resolveAsset(r.col_n),
      assignedRoleDetail: text(r.col_l) || 'No specific role assigned.'
    });
  }

  const timeZone = text(meta.trip_timezone) || 'Asia/Kolkata';
  const places = (placesResult.data || []).map((r, index) => ({
    rowId: index + 1,
    name: r.col_a,
    note: r.col_b,
    status: text(r.col_c) || 'Pending',
    timeString: r.col_d ? asIso(r.col_d) : '',
    tripDay: text(r.col_f),
    targetDate: r.col_g ? formatMonthDay(r.col_g, timeZone) : '',
    eta: r.col_h ? formatHHMM(`1970-01-01T${r.col_h}`, 'UTC') : '',
    location: text(r.col_i),
    details: text(r.col_j),
    ata: r.col_k ? formatHHMM(r.col_k, timeZone) : '',
    cancelStatus: text(r.col_l)
  }));

  const squadMessages = (messagesResult.data || []).reverse().map(r => ({
    timestamp: asIso(r.col_a),
    sender: text(r.col_b),
    text: text(r.col_c)
  }));

  const pastTrips = (archivesResult.data || []).map(r => ({
    name: text(r.col_a),
    dates: text(r.col_b),
    totalSpent: number(text(r.col_c).replace(/[^0-9.]/g, '')),
    reportUrl: text(r.col_d),
    galleryUrl: text(r.col_e)
  }));

  const totalExpenses = Object.values(categorySpent).reduce((a, b) => a + b, 0);
  return {
    appStatus, routeStatus, expenseStatus, contributionToggle, signOffStatus,
    chiefCoordinatorSignature, eidStampImage, tripName, secondaryTitle,
    guidelinesUrl, tripReportUrl, tripReportSubheading, eidSubheading, eidHeading,
    tripNotice, warningNotice,
    timeData: { start: Number.isFinite(startDate) ? startDate : null, end: Number.isFinite(endDate) ? endDate : null },
    stats: {
      budget: totalBudget,
      expenses: totalExpenses,
      balance: totalBudget - totalExpenses,
      percentLeft: totalBudget > 0 ? ((totalBudget - totalExpenses) / totalBudget) * 100 : 0
    },
    allocations: { limits: categoryBudgets, spent: categorySpent },
    transactions, members, places, messages: squadMessages, pastTrips
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const action = text(req.query?.action);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    switch (action) {
      case 'dashboard': return json(res, 200, await dashboard());
      default: return json(res, 200, await dashboard());
    }
  } catch (error) {
    console.error('API Error:', error);
    return json(res, 500, { error: error?.message || 'Internal server error' });
  }
}
