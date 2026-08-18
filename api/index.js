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

function formatMonthDay(v, timeZone = 'Asia/Kolkata') {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return text(v);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone }).format(d);
}

function formatHHMM(v, timeZone = 'Asia/Kolkata') {
  if (!v) return '';
  const raw = String(v).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const parts = raw.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d);
  }
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
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

async function verifyMemberPIN(name, pin) {
  const { data, error } = await supabase.from('members_sheet').select('col_a,col_d').order('id', { ascending: true });
  if (error) throw error;

  const targetName = text(name).toLowerCase();
  const targetPin = text(pin).replace(/\D/g, '');

  for (const row of data || []) {
    const rawName = text(row.col_a).toLowerCase();
    const maskedName = applySecurityMask(text(row.col_a)).toLowerCase();
    const dbPin = text(row.col_d).replace(/\D/g, '');

    if (rawName === targetName || maskedName === targetName) {
      if (dbPin === targetPin && targetPin.length > 0) {
        return { success: true, name: text(row.col_a) };
      }
    }
  }
  return { success: false, error: 'Invalid PIN' };
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
    supabase.from('archives_sheet').select('*').order('id', { ascending: false }),
    supabase.from('app_meta').select('*').limit(1).maybeSingle()
  ]);

  const settingsRows = settingsResult.data || [];
  const setting = (rowNumber, column) => {
    const row = settingsRows.find(r => Number(r.row_number) === rowNumber);
    return row ? row[`col_${column}`] : '';
  };
  const meta = appMetaResult?.data || {};
  const memberMeta = memberMetaResult?.data || {};

  // Primary layout strings
  const tripName = text(setting(2, 'b')) || 'App by Anmol';
  const secondaryTitle = text(setting(2, 'c')) || 'Zantar Mantar, Dilli';
  
  // Custom Typography & Position Design Controls
  const titleColor = text(setting(2, 'd')) || '#064e3b';         // Default: Emerald 950 hex
  const subtitleColor = text(setting(2, 'e')) || '#047857';      // Default: Emerald 700 hex
  const titleFontSize = text(setting(3, 'b')) || 'xl';            // options: xl, 2xl, 3xl, 4xl
  const titlePosition = text(setting(3, 'c')) || 'justify-center'; // options: justify-center, justify-start, justify-end
  const rotationLines = text(setting(3, 'd')) || 'dual';          // options: dual (flippable), single (static)
  const titleVisibility = text(setting(3, 'e')) || 'VISIBLE';     // options: VISIBLE, HIDDEN

  
  // 4 Dual Crossfade Header Images (Mobile & Desktop)
  const headerImgMob1 = text(setting(25, 'b')) || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80';
  const headerImgDesk1 = text(setting(25, 'c')) || headerImgMob1;
  const headerImgMob2 = text(setting(26, 'b')) || '';
  const headerImgDesk2 = text(setting(26, 'c')) || '';

  const tripNotice = text(setting(7, 'b'));
  const warningNotice = text(setting(8, 'b'));
  const startDate = setting(4, 'b') ? new Date(setting(4, 'b')).getTime() : null;
  const endDate = setting(5, 'b') ? new Date(setting(5, 'b')).getTime() : null;
  const eidStampImage = await resolveAsset(setting(12, 'b'));
  const rawEidStamp = setting(12, 'b') || '';
  const guidelinesUrl = await resolveAsset(setting(11, 'b'));
  const rawGuidelines = setting(11, 'b') || '';
  const tripReportUrl = await resolveAsset(setting(13, 'b'));
  const rawTripReport = setting(13, 'b') || '';
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
  const budgetRawList = [];

  for (const row of budgetResult.data || []) {
    const catName = text(row.col_a);
    const catAmount = number(row.col_b);
    budgetRawList.push({ id: row.id, category: catName, amount: catAmount });
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
      paidVia: text(row.col_h) || 'UPI',
      notes: row.col_f ?? '',
      claimant: claimant,
      isVerified
    };
  }).reverse();

  const isEncrypted = text(meta.security_status).toLowerCase() === 'encrypted';
  const defaultSecureAvatar = text(meta.default_secure_avatar) || 'https://ui-avatars.com/api/?name=U&background=cbd5e1&color=ffffff';
  
  const rawCoordinatorBg = memberMeta.coordinator_bg || '';
  const rawMemberBg = memberMeta.member_bg || '';
  const coordinatorBg = await resolveAsset(rawCoordinatorBg);
  const memberBg = await resolveAsset(rawMemberBg);
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
      verification: text(r.col_i) || 'Verified',
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
    id: r.id,
    rowId: index + 1,
    name: r.col_a,
    note: r.col_b,
    status: text(r.col_c) || 'Pending',
    timeString: r.col_d ? asIso(r.col_d) : '',
    tripDay: text(r.col_f),
    targetDate: text(r.col_g),
    eta: formatHHMM(r.col_h, timeZone),
    location: text(r.col_i),
    details: text(r.col_j),
    ata: formatHHMM(r.col_k, timeZone),
    cancelStatus: text(r.col_l)
  }));

  const squadMessages = (messagesResult.data || []).map(r => ({
    id: r.id,
    timestamp: asIso(r.col_a),
    sender: text(r.col_b),
    text: text(r.col_c)
  })).reverse();

  const pastTrips = [];
  for (const r of archivesResult.data || []) {
    pastTrips.push({
      id: r.id,
      name: text(r.col_a),
      dates: text(r.col_b),
      totalSpent: number(text(r.col_c).replace(/[^0-9.]/g, '')),
      reportUrl: await resolveAsset(r.col_d),
      rawReport: r.col_d || '',
      galleryUrl: await resolveAsset(r.col_e),
      rawGallery: r.col_e || ''
    });
  }

  const totalExpenses = Object.values(categorySpent).reduce((a, b) => a + b, 0);
  return {
    appStatus, routeStatus, expenseStatus, contributionToggle, signOffStatus,
    securityStatus: meta.security_status || 'normal',
    chiefCoordinatorSignature, eidStampImage, rawEidStamp, tripName, secondaryTitle,
    // Add Design Configuration Pack
    styles: { titleColor, subtitleColor, titleFontSize, titlePosition, rotationLines, titleVisibility, headerImgMob1, headerImgDesk1, headerImgMob2, headerImgDesk2 },
    guidelinesUrl, rawGuidelines, tripReportUrl, rawTripReport, tripReportSubheading, eidSubheading, eidHeading,
    rawCoordinatorBg, rawMemberBg, coordinatorBg, memberBg,
    tripNotice, warningNotice,
    timeData: { start: Number.isFinite(startDate) ? startDate : null, end: Number.isFinite(endDate) ? endDate : null },
    stats: {
      budget: totalBudget,
      expenses: totalExpenses,
      balance: totalBudget - totalExpenses,
      percentLeft: totalBudget > 0 ? ((totalBudget - totalExpenses) / totalBudget) * 100 : 0
    },
    allocations: { limits: categoryBudgets, spent: categorySpent },
    budgetRawList,
    transactions, members, places, messages: squadMessages, pastTrips,
    settingsRaw: settingsRows
  };
}

async function saveExpense(formData) {
  const amount = number(formData.amount);
  if (!(amount >= 0)) throw new Error('Invalid amount');

  let newUTR = `VOF${crypto.randomInt(100000, 1000000)}`;
  const expenseTimestamp = formData.date ? new Date(formData.date).toISOString() : new Date().toISOString();

  const { error } = await supabase.from('transactions_sheet').insert({
    col_a: newUTR,
    col_b: expenseTimestamp,
    col_c: amount,
    col_d: formData.category || 'Other',
    col_e: 'App',
    col_f: formData.notes || '',
    col_g: new Date().toISOString(),
    col_h: formData.paidVia || 'UPI',
    col_i: formData.claimant || '',
    col_j: 'Verified'
  });
  if (error) throw error;
  return dashboard();
}

async function updatePlaceStatus(rowId, nextStatus) {
  const rows = await supabase.from('places_sheet').select('id').order('id', { ascending: true });
  if (rows.error) throw rows.error;
  const row = rows.data?.[Number(rowId) - 1];
  if (row) {
    const patch = { col_c: nextStatus };
    patch.col_d = nextStatus === 'Visited' ? new Date().toISOString() : null;
    await supabase.from('places_sheet').update(patch).eq('id', row.id);
  }
  return dashboard();
}

async function stampATA(rowId) {
  const rows = await supabase.from('places_sheet').select('id').order('id', { ascending: true });
  if (rows.error) throw rows.error;
  const row = rows.data?.[Number(rowId) - 1];
  if (row) {
    await supabase.from('places_sheet').update({ col_k: new Date().toISOString() }).eq('id', row.id);
  }
  return dashboard();
}

async function saveFinalSignature(memberPin, base64Data) {
  const cleanPin = text(memberPin).replace(/\D/g, '');
  const { data: members } = await supabase.from('members_sheet').select('id,col_d');
  const matchedMembers = (members || []).filter(m => text(m.col_d).replace(/\D/g, '') === cleanPin);
  if (!matchedMembers.length) return dashboard();

  const match = String(base64Data || '').match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid signature image');
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  const path = `signatures/${crypto.randomUUID()}.${ext}`;

  await supabase.storage.from(bucket).upload(path, bytes, { contentType: `image/${ext}`, upsert: false });
  for (const member of matchedMembers) {
    await supabase.from('members_sheet').update({ col_n: `storage:${path}` }).eq('id', member.id);
  }
  return dashboard();
}

async function saveSquadMessage(sender, message) {
  await supabase.from('messages_sheet').insert({
    col_a: new Date().toISOString(),
    col_b: sender || '',
    col_c: message || ''
  });
  return dashboard();
}

async function changeMemberPIN(name, oldPin, newPin) {
  const { data } = await supabase.from('members_sheet').select('*').order('id', { ascending: true });
  const target = (data || []).find(r => text(r.col_a).toLowerCase() === text(name).toLowerCase());
  if (!target) return { success: false, error: 'User not found' };
  if (text(target.col_d).replace(/\D/g, '') !== text(oldPin).replace(/\D/g, '')) {
    return { success: false, error: 'Incorrect Current PIN' };
  }
  await supabase.from('members_sheet').update({ col_d: text(newPin) }).eq('id', target.id);
  return { success: true };
}

// -------------------------------------------------------------
// ADMIN ACTIONS
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

async function adminUpdateMeta(securityStatus) {
  const { data: metaRows } = await supabase.from('app_meta').select('*').limit(1);
  if (metaRows?.length) {
    await supabase.from('app_meta').update({ security_status: securityStatus }).eq('id', metaRows[0].id);
  } else {
    await supabase.from('app_meta').insert({ security_status: securityStatus });
  }
  return dashboard();
}

async function adminUpdateMemberMeta(field, value) {
  const { data: metaRows } = await supabase.from('member_sheet_meta').select('*').limit(1);
  const patch = { [field]: value };
  if (metaRows?.length) {
    await supabase.from('member_sheet_meta').update(patch).eq('id', metaRows[0].id);
  } else {
    await supabase.from('member_sheet_meta').insert(patch);
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
  const loc = text(placeData.location || placeData.placeLocation || placeData.name || '');
  const payload = {
    col_a: loc,
    col_b: text(placeData.note || ''),
    col_c: text(placeData.status || 'Pending'),
    col_f: text(placeData.tripDay || placeData.placeDay || 'Day 1'),
    col_g: text(placeData.targetDate || placeData.placeDate || '') || null,
    col_h: text(placeData.eta || placeData.placeEta || '') || null,
    col_i: loc,
    col_j: text(placeData.details || placeData.placeDetails || ''),
    col_k: text(placeData.ata || placeData.placeAta || '') || null,
    col_l: text(placeData.cancelStatus || placeData.placeCancel || '') || null
  };

  if (placeData.id) {
    const { error } = await supabase.from('places_sheet').update(payload).eq('id', Number(placeData.id));
    if (error) throw error;
  } else {
    const { error } = await supabase.from('places_sheet').insert(payload);
    if (error) throw error;
  }
  return dashboard();
}

async function adminReorderPlaces(placesList) {
  for (let i = 0; i < placesList.length; i++) {
    const item = placesList[i];
    await supabase.from('places_sheet').update({
      col_f: text(item.tripDay || 'Day 1'),
      col_g: text(item.targetDate || '') || null,
      col_h: text(item.eta || '') || null,
      col_i: text(item.location || item.name || ''),
      col_j: text(item.details || ''),
      col_k: text(item.ata || '') || null,
      col_l: text(item.cancelStatus || '') || null
    }).eq('id', Number(item.id));
  }
  return dashboard();
}

async function adminDeletePlace(placeId) {
  await supabase.from('places_sheet').delete().eq('id', placeId);
  return dashboard();
}

async function adminSaveTx(txData) {
  const payload = {
    col_c: number(txData.amount),
    col_d: txData.category || 'Other',
    col_f: txData.notes || '',
    col_h: txData.paidVia || 'UPI',
    col_i: txData.claimant || '',
    col_j: txData.verification || 'Verified'
  };

  if (txData.date) {
    payload.col_b = txData.date;
  }

  if (txData.id) {
    await supabase.from('transactions_sheet').update(payload).eq('id', txData.id);
  }
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

async function adminSaveArchive(archiveData) {
  const payload = {
    col_a: archiveData.name || '',
    col_b: archiveData.dates || '',
    col_c: archiveData.totalSpent ? `₹${archiveData.totalSpent}` : '₹0',
    col_d: archiveData.reportUrl || '',
    col_e: archiveData.galleryUrl || ''
  };

  if (archiveData.id) {
    await supabase.from('archives_sheet').update(payload).eq('id', archiveData.id);
  } else {
    await supabase.from('archives_sheet').insert(payload);
  }
  return dashboard();
}

async function adminDeleteArchive(archiveId) {
  await supabase.from('archives_sheet').delete().eq('id', archiveId);
  return dashboard();
}

async function adminSaveBudget(budgetData) {
  const payload = {
    col_a: budgetData.category,
    col_b: number(budgetData.amount)
  };

  if (budgetData.id) {
    await supabase.from('budget_sheet').update(payload).eq('id', budgetData.id);
  } else {
    await supabase.from('budget_sheet').insert(payload);
  }
  return dashboard();
}

async function adminDeleteBudget(budgetId) {
  await supabase.from('budget_sheet').delete().eq('id', budgetId);
  return dashboard();
}

async function adminUploadFile(file) {
  if (!file || !file.base64Data) throw new Error('No file provided');
  const raw = String(file.base64Data);
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid file format');
  const mime = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  let ext = 'jpg';
  if (mime.includes('pdf')) ext = 'pdf';
  else if (mime.includes('png')) ext = 'png';
  else if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('jpeg')) ext = 'jpg';

  const cleanName = text(file.fileName).replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
  const path = `uploads/${Date.now()}-${cleanName}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: publicData?.publicUrl || '', storagePath: `storage:${path}` };
}

async function adminEditMessage(id, messageText) {
  await supabase.from('messages_sheet').update({ col_c: messageText }).eq('id', Number(id));
  return dashboard();
}

async function adminDeleteMessage(id) {
  await supabase.from('messages_sheet').delete().eq('id', Number(id));
  return dashboard();
}


async function updatePollVote(msgId, pollText) {
  await supabase.from('messages_sheet').update({ col_c: pollText }).eq('id', Number(msgId));
  return dashboard();
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
      // Member Actions
      case 'dashboard': return json(res, 200, await dashboard());
      case 'login': return json(res, 200, await verifyMemberPIN(body.name, body.pin));
      case 'expense': return json(res, 200, await saveExpense(body));
      case 'place-status': return json(res, 200, await updatePlaceStatus(body.rowId, body.nextStatus));
      case 'ata': return json(res, 200, await stampATA(body.rowId));
      case 'signature': return json(res, 200, await saveFinalSignature(body.memberPin, body.base64Data));
      case 'message': return json(res, 200, await saveSquadMessage(body.sender, body.text));
      case 'change-pin': return json(res, 200, await changeMemberPIN(body.name, body.oldPin, body.newPin));

      // Admin Actions
      case 'admin-login': return json(res, 200, await adminLogin(body.username, body.password));
      case 'admin-update-setting': return json(res, 200, await adminUpdateSetting(body.rowNumber, body.col, body.value));
      case 'admin-update-meta': return json(res, 200, await adminUpdateMeta(body.securityStatus));
      case 'admin-update-member-meta': return json(res, 200, await adminUpdateMemberMeta(body.field, body.value));
      case 'admin-save-member': return json(res, 200, await adminSaveMember(body));
      case 'admin-delete-member': return json(res, 200, await adminDeleteMember(body.id));
      case 'admin-save-place': return json(res, 200, await adminSavePlace(body));
      case 'admin-reorder-places': return json(res, 200, await adminReorderPlaces(body.places));
      case 'admin-delete-place': return json(res, 200, await adminDeletePlace(body.id));
      case 'admin-save-tx': return json(res, 200, await adminSaveTx(body));
      case 'admin-verify-tx': return json(res, 200, await adminVerifyTx(body.id, body.status));
      case 'admin-delete-tx': return json(res, 200, await adminDeleteTx(body.id));
      case 'admin-save-archive': return json(res, 200, await adminSaveArchive(body));
      case 'admin-delete-archive': return json(res, 200, await adminDeleteArchive(body.id));
      case 'admin-save-budget': return json(res, 200, await adminSaveBudget(body));
      case 'admin-delete-budget': return json(res, 200, await adminDeleteBudget(body.id));
      case 'admin-upload': return json(res, 200, await adminUploadFile(body));

      // Admin Chat Extensions
      case 'admin-send-message': return json(res, 200, await saveSquadMessage(body.sender || 'Admin', body.text));
      case 'admin-edit-message': return json(res, 200, await adminEditMessage(body.id, body.text));
      case 'admin-delete-message': return json(res, 200, await adminDeleteMessage(body.id));
      case 'poll-vote': return json(res, 200, await updatePollVote(body.id, body.text));

      default: return json(res, 200, await dashboard());
    }
  } catch (error) {
    console.error('API Error:', error);
    return json(res, 500, { error: error?.message || 'Internal server error' });
  }
}
