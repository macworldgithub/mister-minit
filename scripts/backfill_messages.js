const mongoose = require('mongoose');
require('dotenv').config({ path: 'd:/Mister_Minit/.env' });

function buildOpeningSms(storeName) {
  return [
    `Hi, sorry we missed your call to Mister Minit ${storeName || 'Store'}! How can we help you today?`,
    ``,
    `Website: https://misterminit.co`,
    `Reply STOP to opt out.`,
  ].join('\n');
}

function buildFollowUpSms(store) {
  if (!store) return 'Hi, just checking in from Mister Minit — did you make it into the store?';
  const name = store.storeName || 'Store';
  const hours = store.tradingHours || 'Mon-Fri 9am-5pm';
  const maps = store.googleMapsLink || '';
  return `Hi, just checking in from Mister Minit ${name} — did you make it into the store, or is there anything else we can help with?\nHours: ${hours}. Find us: ${maps}\nReply STOP to opt out.`;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const stores = await db.collection('Store_Config').find({}).toArray();
  const storeMap = {};
  stores.forEach(s => {
    storeMap[String(s._id)] = s;
    if (s.did) storeMap[s.did.trim()] = s;
  });

  const threads = await db.collection('sms-threads').find({}).toArray();
  let updatedCount = 0;

  for (const thread of threads) {
    const store = storeMap[String(thread.storeId)] || storeMap[thread.did] || null;
    const storeName = store ? store.storeName : (thread.storeName || 'Store');
    let history = thread.conversationHistory || [];
    let modified = false;

    // Check if opening message is missing
    if (thread.openingSentAt && history.length === 0) {
      history.push({
        role: 'assistant',
        content: buildOpeningSms(storeName),
        sentAt: new Date(thread.openingSentAt)
      });
      modified = true;
    }

    // Check if follow-up message is missing
    if (thread.followUpSentAt) {
      const hasFollowUp = history.some(m => m.role === 'assistant' && m.content.includes('checking in'));
      if (!hasFollowUp) {
        history.push({
          role: 'assistant',
          content: buildFollowUpSms(store),
          sentAt: new Date(thread.followUpSentAt)
        });
        modified = true;
      }
    }

    if (modified) {
      await db.collection('sms-threads').updateOne(
        { _id: thread._id },
        { 
          $set: { 
            conversationHistory: history,
            messageCount: history.length
          } 
        }
      );
      updatedCount++;
    }
  }

  console.log(`Backfill complete: updated ${updatedCount} threads.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
