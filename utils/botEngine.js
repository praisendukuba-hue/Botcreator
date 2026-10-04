const axios = require('axios');
const { db, admin } = require('../firebase');

const OFFICIAL = '@DAILYUUPA';
const configCache = {};

async function tg(token, method, payload) {
  const r = await axios.post('https://api.telegram.org/bot' + token + '/' + method, payload, { timeout: 10000 });
  return r.data;
}

async function getBotConfig(botId) {
  const now = Date.now();
  const c = configCache[botId];
  if (c && (now - c.time) < 60000) return c.data;
  const snap = await db.collection('bots').doc(botId).get();
  const data = snap.exists ? snap.data() : null;
  configCache[botId] = { time: now, data: data };
  return data;
}

function usersCol(botId) { return db.collection('bots').doc(botId).collection('users'); }

async function getUser(botId, uid) {
  const ref = usersCol(botId).doc(String(uid));
  const snap = await ref.get();
  if (!snap.exists) {
    const data = { balance: 0, wallet: 'Not Set', refer: null, ref_count: 0, pending: null };
    await ref.set(data);
    await db.collection('bots').doc(botId).update({ users: admin.firestore.FieldValue.increment(1) }).catch(function(){});
    return data;
  }
  return snap.data();
}

async function setUser(botId, uid, patch) {
  await usersCol(botId).doc(String(uid)).set(patch, { merge: true });
}

async function logWithdrawal(botId, uid, amount, cfg, status, method, wallet) {
  await db.collection('bots').doc(botId).collection('withdrawals').add({
    uid: uid, amount: amount, currency: cfg.currency, wallet: wallet || '', status: status, method: method, createdAt: new Date().toISOString()
  }).catch(function(){});
}

async function isMember(token, channel, uid) {
  try {
    const r = await tg(token, 'getChatMember', { chat_id: channel, user_id: uid });
    return ['creator','administrator','member','restricted'].includes(r.result.status);
  } catch (e) { return true; }}

function menu(payMethod) {
  const rows = [
    [{ text: '🏦 Balance' }, { text: '👥 Invite' }],
    [{ text: '📋 Task' }, { text: '💸 Withdraw' }]
  ];
  if (payMethod !== 'AutoPay2') rows.push([{ text: '👛 Wallet' }]);
  return { keyboard: rows, resize_keyboard: true };
}

async function payPt(cfg, user, amount) {
  const payload = { api_key: cfg.apiKey, to_address: user.wallet, amount: amount, comment: 'Withdrawal' };
  const r = await axios.post('https://ptexchange-api.vercel.app/pay/' + String(cfg.currency).toLowerCase(), payload, { timeout: 30000 });
  return r.status === 200;
}

async function payXrocket(cfg, uid, amount) {
  const payload = {
    clientPayoutId: 'CLUR-' + uid + '-' + Date.now(),
    target: String(uid),
    targetType: 'telegram_user_id',
    asset: String(cfg.currency).toUpperCase(),
    amount: String(amount),
    description: 'Withdrawal'
  };
  const r = await axios.post('https://pay.api.xrocket.exchange/api/v1/payouts', payload, {
    headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return r.status === 200;
}

async function handleUpdate(botId, update) {
  const cfg = await getBotConfig(botId);
  if (!cfg || cfg.status !== 'active') return;
  const token = cfg.token;

  if (update.callback_query) {
    const cq = update.callback_query;
    const uid = cq.from.id;
    if (cq.data === 'check_join') {
      const channels = [OFFICIAL].concat(cfg.mustJoin || []);
      let ok = true;
      for (const ch of channels) { if (!(await isMember(token, ch, uid))) ok = false; }
      if (ok) {
        await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Welcome!' });
        await tg(token, 'sendMessage', { chat_id: uid, text: '✅ Verified! Use the menu below.', reply_markup: menu(cfg.payMethod) });
      } else {
        await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: '❌ Not joined yet', show_alert: true });      }
    }
    return;
  }

  const msg = update.message;
  if (!msg || !msg.text) return;
  const uid = msg.from.id;
  const text = msg.text.trim();
  const user = await getUser(botId, uid);

  if (user.pending === 'withdraw') {
    await setUser(botId, uid, { pending: null });
    const amount = parseFloat(text);
    if (isNaN(amount)) { await tg(token, 'sendMessage', { chat_id: uid, text: '❌ Invalid number.' }); return; }
    if (amount < (cfg.minW || 0) || amount > (cfg.maxW || 1e9)) { await tg(token, 'sendMessage', { chat_id: uid, text: '❌ Min ' + cfg.minW + ' / Max ' + cfg.maxW + ' ' + cfg.currency }); return; }
    if (user.balance < amount) { await tg(token, 'sendMessage', { chat_id: uid, text: '❌ Insufficient balance.' }); return; }
    if (cfg.payMethod !== 'AutoPay2' && user.wallet === 'Not Set') { await tg(token, 'sendMessage', { chat_id: uid, text: '👛 Set wallet first: /setwallet ADDRESS' }); return; }

    if (cfg.payMethod === 'AutoPay1') {
      try {
        const okPay = await payPt(cfg, user, amount);
        if (okPay) {
          await setUser(botId, uid, { balance: user.balance - amount });
          await logWithdrawal(botId, uid, amount, cfg, 'paid', 'AutoPay1', user.wallet);
          await tg(token, 'sendMessage', { chat_id: uid, text: '✅ Paid ' + amount + ' ' + cfg.currency + ' to ' + user.wallet });
          await tg(token, 'sendMessage', { chat_id: cfg.payoutChannel, text: '💸 AutoPay1 paid: ' + amount + ' ' + cfg.currency + ' → user ' + uid }).catch(function(){});
        } else { throw new Error('declined'); }
      } catch (e) { await tg(token, 'sendMessage', { chat_id: uid, text: '❌ Payment failed. Balance not deducted.' }); }
    } else if (cfg.payMethod === 'AutoPay2') {
      try {
        const okPay = await payXrocket(cfg, uid, amount);
        if (okPay) {
          await setUser(botId, uid, { balance: user.balance - amount });
          await logWithdrawal(botId, uid, amount, cfg, 'paid', 'AutoPay2', 'Telegram ID');
          await tg(token, 'sendMessage', { chat_id: uid, text: '✅ xRocket payout sent: ' + amount + ' ' + cfg.currency });
        } else { throw new Error('declined'); }
      } catch (e) { await tg(token, 'sendMessage', { chat_id: uid, text: '❌ xRocket failed. Balance not deducted.' }); }
    } else {
      await setUser(botId, uid, { balance: user.balance - amount });
      await logWithdrawal(botId, uid, amount, cfg, 'pending', 'Manual', user.wallet);
      await tg(token, 'sendMessage', { chat_id: uid, text: '⏳ Request submitted. Pending admin approval.' });
      await tg(token, 'sendMessage', { chat_id: cfg.payoutChannel, text: '💸 Manual withdrawal\nUser: ' + uid + '\nAmount: ' + amount + ' ' + cfg.currency + '\nWallet: ' + user.wallet }).catch(function(){});
    }
    return;
  }

  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    if (parts[1] && parts[1] !== String(uid) && !user.refer) {      await setUser(botId, uid, { refer: parts[1] });
      const refSnap = await usersCol(botId).doc(parts[1]).get();
      if (refSnap.exists) {
        const rd = refSnap.data();
        await setUser(botId, parts[1], { balance: (rd.balance || 0) + (cfg.refBonus || 0), ref_count: (rd.ref_count || 0) + 1 });
        await tg(token, 'sendMessage', { chat_id: parts[1], text: '🎉 You earned ' + (cfg.refBonus || 0) + ' ' + cfg.currency + ' for a new referral!' }).catch(function(){});
      }
    }
    const channels = [OFFICIAL].concat(cfg.mustJoin || []);
    const buttons = [];
    for (const ch of channels) {
      if (!(await isMember(token, ch, uid))) buttons.push([{ text: '📢 Join ' + ch, url: 'https://t.me/' + ch.replace('@', '') }]);
    }
    if (buttons.length) {
      buttons.push([{ text: '✅ I Have Joined', callback_data: 'check_join' }]);
      await tg(token, 'sendMessage', { chat_id: uid, text: '🚫 <b>JOIN REQUIRED CHANNELS FIRST</b>', parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
      return;
    }
    await tg(token, 'sendMessage', { chat_id: uid, text: '💎 <b>WELCOME TO ' + cfg.name + '</b>\n\n🚀 Earn ' + cfg.currency + ' rewards for free!', parse_mode: 'HTML', reply_markup: menu(cfg.payMethod) });
    return;
  }

  if (text === '🏦 Balance') {
    await tg(token, 'sendMessage', { chat_id: uid, text: '🏦 <b>BALANCE</b>\n\n💰 ' + (user.balance || 0) + ' ' + cfg.currency + '\n👛 ' + user.wallet, parse_mode: 'HTML' });
    return;
  }

  if (text === '👥 Invite') {
    const me = await tg(token, 'getMe', {});
    await tg(token, 'sendMessage', { chat_id: uid, text: '👥 <b>INVITE & EARN</b>\n\n💎 ' + (cfg.refBonus || 0) + ' ' + cfg.currency + ' per referral\n\n🔗 https://t.me/' + me.result.username + '?start=' + uid, parse_mode: 'HTML' });
    return;
  }

  if (text === '📋 Task') {
    let t = '📋 <b>TASKS</b>\n\n1️⃣ Join @DAILYUUPA\n';
    (cfg.tasks || []).forEach(function(task, i) { t += (i + 2) + '️⃣ ' + task.n + ': ' + task.l + '\n'; });
    await tg(token, 'sendMessage', { chat_id: uid, text: t, parse_mode: 'HTML' });
    return;
  }

  if (text === '👛 Wallet') {
    await tg(token, 'sendMessage', { chat_id: uid, text: '👛 Wallet: <code>' + user.wallet + '</code>\n\nUpdate: /setwallet ADDRESS', parse_mode: 'HTML' });
    return;
  }

  if (text.startsWith('/setwallet')) {
    const w = text.split(' ')[1];
    if (!w) { await tg(token, 'sendMessage', { chat_id: uid, text: 'Usage: /setwallet ADDRESS' }); return; }
    await setUser(botId, uid, { wallet: w });
    await tg(token, 'sendMessage', { chat_id: uid, text: '✅ Wallet saved: ' + w });    return;
  }

  if (text === '💸 Withdraw') {
    if (cfg.payMethod !== 'AutoPay2' && user.wallet === 'Not Set') {
      await tg(token, 'sendMessage', { chat_id: uid, text: '👛 Set wallet first: /setwallet ADDRESS' });
      return;
    }
    await setUser(botId, uid, { pending: 'withdraw' });
    await tg(token, 'sendMessage', { chat_id: uid, text: '💸 Enter amount (' + cfg.currency + ')\nMin: ' + cfg.minW + ' | Max: ' + cfg.maxW });
    return;
  }
}

async function registerWebhook(botId, token) {
  const base = process.env.BACKEND_PUBLIC_URL || 'https://botcreator-lql5.onrender.com';
  await tg(token, 'setWebhook', { url: base + '/bot/' + botId + '/webhook', drop_pending_updates: true });
}

module.exports = { handleUpdate, registerWebhook };
