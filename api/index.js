import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'trip-assets';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const gasUrl = process.env.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwWAOUP4c2_G8FgWFF1zCbI1sg9lLMOhPAUQF5XH9a5R0gyRp5rX42UKpjr3-B41XJk0w/exec';
const noticeGasUrl = process.env.NOTICE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyRwqWA9ELDnkBfnGW6kr6oEGwE_6cIq6htGEfDB8B6Fd18yyMJeNodc8hZLkXciPb-/exec';

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
    appMetaResult,
    checklistResult
  ] = await Promise.all([
    supabase.from('settings_sheet').select('*').order('row_number', { ascending: true }),
    supabase.from('transactions_sheet').select('*').order('id', { ascending: true }),
    supabase.from('members_sheet').select('*').order('id', { ascending: true }),
    supabase.from('member_sheet_meta').select('*').limit(1).maybeSingle(),
    supabase.from('places_sheet').select('*').order('id', { ascending: true }),
    supabase.from('budget_sheet').select('*').order('id', { ascending: true }),
    supabase.from('messages_sheet').select('*').order('id', { ascending: false }).limit(50),
    supabase.from('archives_sheet').select('*').order('id', { ascending: false }),
    supabase.from('app_meta').select('*').limit(1).maybeSingle(),
    supabase.from('itinerary_checklist').select('*').order('id', { ascending: true })
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
  
  const titleColor = text(setting(2, 'd')) || '#064e3b';
  const subtitleColor = text(setting(2, 'e')) || '#047857';
  const titleFontSize = text(setting(3, 'b')) || 'xl';
  const titlePosition = text(setting(3, 'c')) || 'justify-center';
  const rotationLines = text(setting(3, 'd')) || 'dual';
  const titleVisibility = text(setting(3, 'e')) || 'VISIBLE';
  
  const headerImgMob1 = text(setting(25, 'b')) || 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhEqmG8J5YSs5q-OPIiWD6Ths2iNc9yvnjReNjEDAeP1BFB_zXxwplZakAiXPA-RVUxcvAWDhQQIuREiM8KsaUWKbzKmQ_UFZXbZ14Jg3Fpo8MMbZHHrN3OwQgNCfZ3Mby0wz2gnCVQ3Etduep3yfwmpFlshJWASHVRHDyJBnqU5uzgQe1Jsle8R9ityME2/s0/@bharatway.png';
  const headerImgDesk1 = text(setting(25, 'c')) || headerImgMob1;
  const headerImgMob2 = text(setting(26, 'b')) || '';
  const headerImgDesk2 = text(setting(26, 'c')) || '';

  const tripNotice = text(setting(7, 'b'));
  const warningNotice = text(setting(8, 'b'));
  const liveTripCode = text(setting(6, 'b')) || 'BHW0007';
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
  const checklistVisibility = text(setting(24, 'b')).toUpperCase() || 'VISIBLE';
  const checklistRevokeVisibility = text(setting(24, 'c')).toUpperCase() || 'VISIBLE';
  const announcementMode = text(setting(29, 'b')).toUpperCase() || 'DISABLED';
  const maintenanceMode = text(setting(30, 'b')).toUpperCase() || 'DISABLED';
  const termsUrl = await resolveAsset(setting(31, 'b'));
  const rawTerms = setting(31, 'b') || '';

  const popupType = text(setting(28, 'b')).toUpperCase() || 'NOTIFICATION';
  const popupTitle = text(setting(28, 'c'));
  const popupMessage = text(setting(28, 'd'));
  const popupStatus = text(setting(28, 'e')).toUpperCase() || 'DISABLED';
  const popupPushedAt = text(setting(28, 'f'));

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
  const defaultSecureAvatar = 'https://blogger.googleusercontent.com/img/a/AVvXsEjMM5kJ6bdUIS9uMB7njQxBtn9O0VoPAp1RCvLFAkheTxSubxscFUStS1wV00BdrUR0AClFHOZlsJdCqCnQOau0MO8RuKobfzKAy1ixV7fo-6yqab8Ztd0t0A_V0XS4SqDsZMKnewl0GwdomQcXUve58wGv_2W1z6zhm4MKYCApsPoBtY-arhMfKVsJ1gPQ';
  
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
    let finalImg = isEncrypted ? defaultSecureAvatar : await resolveAsset(r.col_c);
    if (isEncrypted) {
      finalName = applySecurityMask(finalName);
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
      verificationToken: text(r.verification_token) || '',
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
      rawGallery: r.col_e || '',
      tripCode: text(r.col_f) || ''
    });
  }

  const checklist = (checklistResult.data || []).map(item => ({
    id: item.id,
    title: text(item.title),
    section: text(item.section) || 'Important',
    isDone: Boolean(item.is_done),
    claimedBy: text(item.claimed_by),
    claimedAt: asIso(item.claimed_at)
  }));

  const totalExpenses = Object.values(categorySpent).reduce((a, b) => a + b, 0);
  return {
    appStatus, routeStatus, expenseStatus, contributionToggle, signOffStatus, checklistVisibility, checklistRevokeVisibility, announcementMode, maintenanceMode,
    termsUrl, rawTerms,
    liveTripCode,
    tripCode: liveTripCode,
    popupConfig: { type: popupType, title: popupTitle, message: popupMessage, status: popupStatus, pushedAt: popupPushedAt },
    securityStatus: meta.security_status || 'normal',
    chiefCoordinatorSignature, eidStampImage, rawEidStamp, tripName, secondaryTitle,
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
    transactions, members, places, messages: squadMessages, pastTrips, checklist,
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
    const istTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata'
    }).format(new Date());

    await supabase.from('places_sheet').update({ col_k: istTime }).eq('id', row.id);
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

async function claimChecklistItem(id, userName) {
  if (!id || !userName) throw new Error('Item ID and user name required');
  const { error } = await supabase.from('itinerary_checklist').update({
    is_done: true,
    claimed_by: userName,
    claimed_at: new Date().toISOString()
  }).eq('id', Number(id));

  if (error) throw error;
  return dashboard();
}

async function revokeChecklistItem(id, userName) {
  if (!id || !userName) throw new Error('Item ID and user name required');
  
  const { data: item } = await supabase.from('itinerary_checklist').select('*').eq('id', Number(id)).maybeSingle();
  if (!item) throw new Error('Item not found');
  
  if (text(item.claimed_by).toLowerCase() !== text(userName).toLowerCase()) {
    throw new Error('Only the claimant can revoke this item');
  }

  const { error } = await supabase.from('itinerary_checklist').update({
    is_done: false,
    claimed_by: '',
    claimed_at: null
  }).eq('id', Number(id));

  if (error) throw error;
  return dashboard();
}

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

async function adminPushBroadcast(payload) {
  const { status, type, title, message } = payload;
  
  const patch = {
    col_b: type || 'NOTIFICATION',
    col_c: title || '',
    col_d: message || '',
    col_e: status || 'ENABLED',
    col_f: String(Date.now())
  };

  const { data: rows } = await supabase.from('settings_sheet').select('*').eq('row_number', 28);
  if (rows?.length) {
    await supabase.from('settings_sheet').update(patch).eq('row_number', 28);
  } else {
    await supabase.from('settings_sheet').insert({ row_number: 28, ...patch });
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
  const cleanSpent = text(archiveData.totalSpent).replace(/[^0-9.]/g, '');
  const payload = {
    col_a: text(archiveData.name),
    col_b: text(archiveData.dates),
    col_c: cleanSpent ? `₹${cleanSpent}` : '₹0',
    col_d: text(archiveData.reportUrl),
    col_e: text(archiveData.galleryUrl),
    col_f: text(archiveData.tripCode).toUpperCase()
  };

  if (archiveData.id) {
    const { error } = await supabase
      .from('archives_sheet')
      .update(payload)
      .eq('id', Number(archiveData.id));
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('archives_sheet')
      .insert(payload);
    if (error) throw error;
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

async function adminSaveChecklist(itemData) {
  const payload = {
    title: text(itemData.title),
    section: text(itemData.section) || 'Important'
  };

  if (itemData.id) {
    const { error } = await supabase.from('itinerary_checklist').update(payload).eq('id', Number(itemData.id));
    if (error) throw error;
  } else {
    const { error } = await supabase.from('itinerary_checklist').insert(payload);
    if (error) throw error;
  }
  return dashboard();
}

async function adminDeleteChecklist(id) {
  await supabase.from('itinerary_checklist').delete().eq('id', Number(id));
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

async function fetchPastTripFromGoogleSheet(tripName) {
  if (!gasUrl || gasUrl.startsWith('YOUR_')) {
    throw new Error('Google Apps Script URL not configured');
  }

  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'past-trip-ledger',
      tripName: text(tripName)
    })
  });

  if (!response.ok) {
    throw new Error(`Google Sheets fetch failed with status: ${response.status}`);
  }

  return await response.json();
}

async function recordPosInvoice(billData) {
  if (!billData || !billData.invoiceNo) throw new Error('Invoice data required');

  const invoiceNo = text(billData.invoiceNo);
  
  const { data: existing } = await supabase
    .from('pos_invoices')
    .select('*')
    .eq('invoice_no', invoiceNo)
    .maybeSingle();

  if (existing) {
    return { success: true, token: existing.token, invoiceNo: existing.invoice_no };
  }

  const generatedToken = `BILL_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

  const { data: inserted, error } = await supabase.from('pos_invoices').insert({
    token: generatedToken,
    invoice_no: invoiceNo,
    trip_code: text(billData.tripCode) || 'EXP',
    store_title: billData.storeTitle || 'BHARAT WAY EXPEDITION',
    filter_tag: text(billData.filterTag) || 'ALL EXPENSES',
    date_string: text(billData.dateString) || '',
    time_string: text(billData.timeString) || '',
    items: Array.isArray(billData.items) ? billData.items : [],
    net_total: number(billData.netTotal),
    is_verified: true
  }).select('*').single();

  if (error) throw error;
  return { success: true, token: inserted.token, invoiceNo: inserted.invoice_no };
}

async function fetchNoticeFromGoogleSheet(refNo) {
  if (!noticeGasUrl) {
    throw new Error('Notice Google Apps Script URL not configured');
  }

  const response = await fetch(noticeGasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get-notice',
      refNo: text(refNo)
    })
  });

  if (!response.ok) {
    throw new Error(`Notice fetch failed with status: ${response.status}`);
  }

  return await response.json();
}

async function verifyToken(type, token, queryParam) {
  const queryType = text(type).toLowerCase();
  const searchVal = text(queryParam || token);

  if (!searchVal) {
    return { valid: false, error: 'Missing search value or verification token' };
  }

  // 1. MEMBER PASS VERIFICATION
  if (queryType === 'member') {
    let query = supabase.from('members_sheet').select('*');

    if (token && !queryParam) {
      query = query.eq('verification_token', token);
    } else {
      query = query.ilike('col_a', searchVal.trim());
    }

    const { data: memberRows, error } = await query.limit(1);
    const member = memberRows?.[0];

    if (error || !member) {
      return { valid: false, error: 'Member record not found in ledger' };
    }

    const [settingsResult, memberMetaResult] = await Promise.all([
      supabase.from('settings_sheet').select('*').in('row_number', [2, 10]),
      supabase.from('member_sheet_meta').select('chief_coordinator_signature').limit(1).maybeSingle()
    ]);

    const settings = settingsResult.data || [];
    const getSetting = (row, col) => settings.find(r => r.row_number === row)?.[`col_${col}`] || '';
    
    const tripName = text(getSetting(10, 'c')) || text(getSetting(2, 'b')) || 'BHARAT WAY';
    const eidSubheading = text(getSetting(10, 'b'));
    const chiefSignature = await resolveAsset(memberMetaResult?.data?.chief_coordinator_signature);
    const photoUrl = await resolveAsset(member.col_c);
    const isVerified = text(member.col_i).toLowerCase() !== 'unverified';

    return {
      valid: true,
      type: 'member',
      isVerified,
      member: {
        name: text(member.col_a),
        designation: text(member.col_b) || 'Member',
        memberRole: text(member.col_h) || '-',
        mobile: text(member.col_o) || '-',
        email: text(member.col_p) || '-',
        img: photoUrl,
        chiefCoordinatorSignature: chiefSignature,
        tripName,
        eidSubheading,
        token: member.verification_token || ''
      }
    };
  }

  // 2. POS VOUCHER / BILL VERIFICATION
  if (queryType === 'bill' || queryType === 'invoice') {
    let query = supabase.from('pos_invoices').select('*');

    if (token && !queryParam) {
      query = query.eq('token', token);
    } else {
      query = query.ilike('invoice_no', searchVal.trim().replace(/^#/, ''));
    }

    const { data: invoiceRows, error } = await query.limit(1);
    const invoice = invoiceRows?.[0];

    if (error || !invoice) {
      return { valid: false, error: 'POS voucher not found in ledger records' };
    }

    return {
      valid: true,
      type: 'bill',
      isVerified: Boolean(invoice.is_verified),
      bill: {
        storeTitle: invoice.store_title,
        dateString: invoice.date_string,
        timeString: invoice.time_string,
        invoiceNo: invoice.invoice_no,
        filterTag: invoice.filter_tag,
        tripCode: invoice.trip_code,
        netTotal: number(invoice.net_total),
        items: invoice.items || [],
        token: invoice.token
      }
    };
  }

  // 3. OFFICIAL NOTICE / GUIDELINE VERIFICATION
 
  if (queryType === 'notice') {
    try {
      const noticeRes = await fetchNoticeFromGoogleSheet(searchVal);
      if (!noticeRes || !noticeRes.valid) {
        return { valid: false, error: 'Notice record not found in official ledger' };
      }
      return {
        valid: true,
        type: 'notice',
        isVerified: noticeRes.isVerified !== false,
        pages: noticeRes.pages || [noticeRes.notice],
        notice: noticeRes.notice || noticeRes.pages?.[0]
      };
    } catch (err) {
      return { valid: false, error: 'Failed to verify notice record' };
    }
  }

  return { valid: false, error: 'Invalid verification type parameter' };
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
      case 'login': return json(res, 200, await verifyMemberPIN(body.name, body.pin));
      case 'expense': return json(res, 200, await saveExpense(body));
      case 'place-status': return json(res, 200, await updatePlaceStatus(body.rowId, body.nextStatus));
      case 'ata': return json(res, 200, await stampATA(body.rowId));
      case 'signature': return json(res, 200, await saveFinalSignature(body.memberPin, body.base64Data));
      case 'message': return json(res, 200, await saveSquadMessage(body.sender, body.text));
      case 'change-pin': return json(res, 200, await changeMemberPIN(body.name, body.oldPin, body.newPin));
      case 'checklist-claim': return json(res, 200, await claimChecklistItem(body.id, body.userName));
      case 'checklist-revoke': return json(res, 200, await revokeChecklistItem(body.id, body.userName));
      case 'past-trip-ledger': return json(res, 200, await fetchPastTripFromGoogleSheet(body.tripName));

      case 'admin-login': return json(res, 200, await adminLogin(body.username, body.password));
      case 'admin-update-setting': return json(res, 200, await adminUpdateSetting(body.rowNumber, body.col, body.value));
      case 'admin-push-broadcast': return json(res, 200, await adminPushBroadcast(body));
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
      case 'admin-save-checklist': return json(res, 200, await adminSaveChecklist(body));
      case 'admin-delete-checklist': return json(res, 200, await adminDeleteChecklist(body.id));
      case 'admin-upload': return json(res, 200, await adminUploadFile(body));

      case 'verify': return json(res, 200, await verifyToken(req.query?.type || body?.type, req.query?.token || body?.token, req.query?.query || body?.query));
      case 'record-pos-invoice': return json(res, 200, await recordPosInvoice(body));
      case 'verify-notice': return json(res, 200, await fetchNoticeFromGoogleSheet(body.refNo || req.query?.refNo));

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
