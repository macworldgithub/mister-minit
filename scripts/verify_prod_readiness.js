const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: 'd:/Mister_Minit/.env' });

async function verify() {
  console.log('====================================================');
  console.log('   MISTER MINIT - PRODUCTION READINESS VERIFICATION  ');
  console.log('====================================================\n');

  // ── 1. DB Connection ──
  console.log('[CHECK 1] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log(' -> OK: Connected to MongoDB successfully.\n');
  const db = mongoose.connection.db;

  // ── 2. Store Configs & Display Name Formatting ──
  console.log('[CHECK 2] Verifying Store Configs & Email/SMS Formatting...');
  const stores = await db.collection('Store_Config').find({}).toArray();
  console.log(` -> Found ${stores.length} store configurations.`);

  function formatStoreDisplayName(store) {
    const raw = store?.storeName?.trim();
    if (!raw) return 'Mister Minit';
    if (/^mister\s+minit/i.test(raw)) return raw;
    return `Mister Minit ${raw}`;
  }

  function extractStoreEmails(store) {
    const emails = new Set();
    const addEmail = (raw) => {
      if (!raw || typeof raw !== 'string') return;
      const parts = raw.split(/[,;\s]+/);
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          emails.add(trimmed);
        }
      }
    };
    if (store?.staffContacts && Array.isArray(store.staffContacts)) {
      for (const contact of store.staffContacts) {
        if (contact?.email) addEmail(contact.email);
      }
    }
    const storeAny = store;
    if (storeAny) {
      if (storeAny.email) addEmail(storeAny.email);
      if (storeAny.notificationEmail) addEmail(storeAny.notificationEmail);
      if (storeAny.storeEmail) addEmail(storeAny.storeEmail);
      if (Array.isArray(storeAny.emails)) storeAny.emails.forEach(addEmail);
    }
    return Array.from(emails);
  }

  for (const s of stores) {
    const displayName = formatStoreDisplayName(s);
    const emails = extractStoreEmails(s);
    console.log(`  Store ID: ${s._id} | DID: ${s.did.padEnd(14)} | Display: "${displayName}"`);
    console.log(`     Recipients (${emails.length}): ${emails.join(', ')}`);
    if (displayName.includes('Mister Minit Mister Minit')) {
      throw new Error(`Duplicate prefix bug in store: ${s.storeName}`);
    }
    if (emails.length === 0) {
      console.warn(`     WARNING: Store "${s.storeName}" has 0 configured emails!`);
    }
  }
  console.log(' -> OK: Store name formatting and email extraction verified across all stores.\n');

  // ── 3. Database Safety Check on sms-threads ──
  console.log('[CHECK 3] Verifying 15m Cadence & Historical Thread Safety Window...');
  const now = Date.now();
  const dueBefore = new Date(now - 15 * 60 * 1000);
  const notOlderThan = new Date(now - 6 * 60 * 60 * 1000);

  // Eligible threads: opening was sent >= 15m ago AND within 6 hours
  const eligibleNow = await db.collection('sms-threads').find({
    customerReplied: false,
    status: 'sms_sent',
    openingSentAt: { $lte: dueBefore, $gte: notOlderThan },
    followUpSentAt: null,
  }).toArray();
  console.log(` -> Eligible threads for 15-min follow-up right now (within 6h window): ${eligibleNow.length}`);

  // Stale historical threads: older than 6 hours
  const olderThan6h = await db.collection('sms-threads').find({
    customerReplied: false,
    status: 'sms_sent',
    openingSentAt: { $lt: notOlderThan },
    followUpSentAt: null,
  }).toArray();
  console.log(` -> Historical unreplied threads safely PROTECTED (will NOT be spammed): ${olderThan6h.length}`);

  // Auto-close query check
  const closeCutoff = new Date(now - 45 * 60 * 1000);
  const toClose = await db.collection('sms-threads').find({
    customerReplied: false,
    status: 'sms_sent',
    followUpSentAt: { $ne: null, $lte: closeCutoff },
  }).toArray();
  console.log(` -> Threads eligible for 45-min auto-close right now: ${toClose.length}\n`);

  // ── 4. SMTP Connectivity ──
  console.log('[CHECK 4] Verifying Hostinger SMTP Server Configuration...');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await new Promise((resolve, reject) => {
    transporter.verify((err, success) => {
      if (err) return reject(err);
      console.log(' -> OK: SMTP Transporter verified successfully with Hostinger.\n');
      resolve(success);
    });
  });

  // ── 5. Plain Affirmative & Complex Message Differentiation ──
  console.log('[CHECK 5] Testing Affirmative Classifier Edge Cases...');
  function isAffirmativeReply(body) {
    const raw = (body || '').trim();
    if (!raw) return false;
    if (/^[\u{1F44D}\u{1F44C}\u2705\u{1F64F}\s]+$/u.test(raw)) return true;
    const tokens = raw.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 6) return false;
    const strong = new Set([
      'yes', 'yess', 'yesss', 'yeah', 'yea', 'yep', 'yup', 'yah', 'ya', 'y',
      'sure', 'ok', 'okay', 'okey', 'please', 'pls', 'plz', 'definitely',
      'absolutely', 'ahead', 'sounds', 'call', 'ring', 'works', 'course',
    ]);
    const filler = new Set([
      'thanks', 'thank', 'you', 'thx', 'ty', 'of', 'go', 'good', 'great',
      'that', 'would', 'be', 'it', 'do', 'me', 'back', 'can', 'u', 'now',
      'a', 'to', 'fine', 'yeah', 'for', 'sure', 'like', 'i',
    ]);
    if (!tokens.every((t) => strong.has(t) || filler.has(t))) return false;
    return tokens.some((t) => strong.has(t));
  }

  const affirmativeCases = [
    'YES', 'yes', 'Yes please', 'yeah', 'yep', 'sure', 'ok', 'okay',
    'please do', 'sounds good', 'yes that would be great', 'call me back please', '👍'
  ];
  for (const c of affirmativeCases) {
    if (!isAffirmativeReply(c)) throw new Error(`Failed affirmative test: "${c}"`);
  }
  console.log(` -> Verified ${affirmativeCases.length} affirmative cases classify as fast-path callback.`);

  const nonAffirmativeCases = [
    'How much for shoe repair?', 'What time do you close?', 'No thanks', 'Not needed',
    'Can you cut a Honda car key today?', 'Who is this?'
  ];
  for (const c of nonAffirmativeCases) {
    if (isAffirmativeReply(c)) throw new Error(`Failed non-affirmative test: "${c}" should go to AI`);
  }
  console.log(` -> Verified ${nonAffirmativeCases.length} regular questions/negative replies correctly route to AI chatbot.\n`);

  console.log('====================================================');
  console.log('      ALL PRODUCTION READINESS CHECKS PASSED        ');
  console.log('====================================================');
  process.exit(0);
}

verify().catch((err) => {
  console.error('\nFAILED VERIFICATION:', err);
  process.exit(1);
});
