import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'trip-assets';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function text(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function number(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

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

function json(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}

// -------------------------------------------------------------
// USER API HELPERS
// -------------------------------------------------------------
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
  const [settingsResult, txResult, membersResult, memberMetaResult, placesResult, budgetResult, messagesResult, archivesResult, appMetaResult] = await Promise.all([
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
      id: row.id,
      utr: text(row.col_a),
      date: asIso(row.col_b),
      amount: amt,
      category: cat,
      notes: row.col_f ?? '',
      claimant: claimant,
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
      id: r.id,
      name: finalName,
      rawName: rawName,
      role: roleName,
      img: finalImg,
      rawImg: r.col_c,
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

  const places = (placesResult.data || []).map((r, index) => ({
    id: r.id,
    rowId: index + 1,
    name: r.col_a,
    note: r.col_b,
    status: text(r.col_c) || 'Pending',
    timeString: r.col_d ? asIso(r.col_d) : '',
    tripDay: text(r.col_f),
    targetDate: text(r.col_g),
    eta: text(r.col_h),
    location: text(r.col_i),
    details: text(r.col_j),
    ata: text(r.col_k),
    cancelStatus: text(r.col_l)
  }));

  const squadMessages = (messagesResult.data || []).map(r => ({
    id: r.id,
    timestamp: asIso(r.col_a),
    sender: text(r.col_b),
    text: text(r.col_c)
  }));

  const pastTrips = (archivesResult.data || []).map(r => ({
    id: r.id,
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
    transactions, members, places, messages: squadMessages, pastTrips,
    settingsRaw: settingsRows
  };
}

// -------------------------------------------------------------
// ADMIN ACTION HANDLERS
// -------------------------------------------------------------
async function adminLogin(username, password) {
  const { data, error } = await supabase.from('admin_auth').select('*').eq('username', text(username)).maybeSingle();
  if (error || !data) return { success: false, error: 'Invalid admin credentials' };
  if (text(data.password_hash) === text(password)) {
    return { success: true, token: crypto.randomUUID() };
  }
  return { success: false, error: 'Invalid password' };
}

async function adminUpdateSetting(rowNumber, col, value) {
  const { data: rows } = await supabase.from('settings_sheet').select('*').eq('row_number', Number(rowNumber));
  const patch = { [`col_${col.toLowerCase()}`]: value };
  if (rows?.length) {
    await supabase.from('settings_sheet').update(patch).eq('row_number', Number(rowNumber));
  } else {
    await supabase.from('settings_sheet').insert({ row_number: Number(rowNumber), ...patch });
  }
  return dashboard();
}

async function adminSaveMember(memberData) {
  const payload = {
    col_a: memberData.name || '',
    col_b: memberData.role || 'Member',
    col_c: memberData.img || '',
    col_d: memberData.pin || '1234',
    col_e: memberData.attendance || 'Confirmed',
    col_h: memberData.memberRole || '',
    col_i: memberData.verification || 'Verified',
    col_l: memberData.assignedRoleDetail || '',
    col_o: memberData.mobile || '',
    col_p: memberData.email || ''
  };

  if (memberData.id) {
    await supabase.from('members_sheet').update(payload).eq('id', memberData.id);
  } else {
    await supabase.from('members_sheet').insert(payload);
  }
  return dashboard();
}

async function adminDeleteMember(memberId) {
  await supabase.from('members_sheet').delete().eq('id', memberId);
  return dashboard();
}

async function adminSavePlace(placeData) {
  const payload = {
    col_a: placeData.name || '',
    col_b: placeData.note || '',
    col_c: placeData.status || 'Pending',
    col_f: placeData.tripDay || 'Day 1',
    col_g: placeData.targetDate || '',
    col_h: placeData.eta || '',
    col_i: placeData.location || '',
    col_j: placeData.details || '',
    col_k: placeData.ata || '',
    col_l: placeData.cancelStatus || ''
  };

  if (placeData.id) {
    await supabase.from('places_sheet').update(payload).eq('id', placeData.id);
  } else {
    await supabase.from('places_sheet').insert(payload);
  }
  return dashboard();
}

async function adminDeletePlace(placeId) {
  await supabase.from('places_sheet').delete().eq('id', placeId);
  return dashboard();
}

async function adminVerifyTx(txId, status) {
  await supabase.from('transactions_sheet').update({ col_j: status }).eq('id', txId);
  return dashboard();
}

async function adminDeleteTx(txId) {
  await supabase.from('transactions_sheet').delete().eq('id', txId);
  return dashboard();
}

async function adminUploadFile(file) {
  if (!file || !file.base64Data) throw new Error('No asset supplied');
  const raw = String(file.base64Data);
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data format');
  const mime = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  const ext = mime.split('/')[1] || 'jpg';
  const cleanName = text(file.fileName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
  const path = `uploads/${Date.now()}-${cleanName}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data.publicUrl, storagePath: `storage:${path}` };
}

// -------------------------------------------------------------
// MAIN API ROUTER
// -------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const action = text(req.query?.action);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    switch (action) {
      // User Actions
      case 'dashboard': return json(res, 200, await dashboard());
      case 'login': return json(res, 200, await adminLogin(body.name, body.pin));
      
      // Admin Actions
      case 'admin-login': return json(res, 200, await adminLogin(body.username, body.password));
      case 'admin-update-setting': return json(res, 200, await adminUpdateSetting(body.rowNumber, body.col, body.value));
      case 'admin-save-member': return json(res, 200, await adminSaveMember(body));
      case 'admin-delete-member': return json(res, 200, await adminDeleteMember(body.id));
      case 'admin-save-place': return json(res, 200, await adminSavePlace(body));
      case 'admin-delete-place': return json(res, 200, await adminDeletePlace(body.id));
      case 'admin-verify-tx': return json(res, 200, await adminVerifyTx(body.id, body.status));
      case 'admin-delete-tx': return json(res, 200, await adminDeleteTx(body.id));
      case 'admin-upload': return json(res, 200, await adminUploadFile(body));
      default: return json(res, 200, await dashboard());
    }
  } catch (error) {
    console.error('API Error:', error);
    return json(res, 500, { error: error?.message || 'Internal server error' });
  }
}
