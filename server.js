require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { db, admin } = require('./firebase');
const { generateBotScript } = require('./utils/templateEngine');
require('./utils/scheduler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Clur Bot Creator Backend is running',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required' });
    }
    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 5000 });
    if (response.data.ok) {
      res.json({
        ok: true,
        username: response.data.result.username,
        firstName: response.data.result.first_name,
        id: response.data.result.id
      });
    } else {
      res.status(400).json({ ok: false, error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Verify token error:', error.message);
    res.status(400).json({ ok: false, error: 'Failed to verify token' });
  }
});

app.post('/api/create-bot', async (req, res) => {
  try {
    const data = req.body;
    if (!data.token || !data.name || !data.ownerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const verifyRes = await axios.get(`https://api.telegram.org/bot${data.token}/getMe`, { timeout: 5000 });    if (!verifyRes.data.ok) {
      return res.status(400).json({ error: 'Token is invalid or bot was deleted.' });
    }
    const pythonScript = generateBotScript(data);
    const botData = {
      ownerId: data.ownerId,
      type: data.type || 'bot',
      name: data.name,
      username: verifyRes.data.result.username,
      token: data.token,
      currency: data.currency,
      payMethod: data.payMethod,
      apiKey: data.apiKey || '',
      payoutChannel: data.payoutChannel,
      minW: parseFloat(data.minW) || 0.01,
      maxW: parseFloat(data.maxW) || 100,
      refBonus: parseFloat(data.refBonus) || 0.01,
      mustJoin: data.mustJoin || [],
      nonMust: data.nonMust || [],
      tasks: data.tasks || [],
      officialChannel: 'https://t.me/DAILYUUPA',
      script: pythonScript,
      users: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const docRef = await db.collection('bots').add(botData);
    if (process.env.ADMIN_TELEGRAM_BOT_TOKEN) {
      try {
        await axios.post(`https://api.telegram.org/bot${process.env.ADMIN_TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: process.env.ADMIN_CHAT_ID || process.env.ADMIN_TELEGRAM_BOT_TOKEN,
          text: `🎉 New Bot Created: ${data.name} (${data.currency} / ${data.payMethod})`,
          parse_mode: 'HTML'
        });
      } catch (notifyError) {
        console.error('Failed to send admin notification:', notifyError.message);
      }
    }
    res.json({
      success: true,
      botId: docRef.id,
      message: 'Bot created successfully!',
      username: verifyRes.data.result.username
    });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Failed to create bot: ' + error.message });
  }
});
app.get('/api/user/:uid/bots', async (req, res) => {
  try {
    const { uid } = req.params;
    const snapshot = await db.collection('bots')
      .where('ownerId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();
    const bots = [];
    snapshot.forEach(doc => {
      bots.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, bots });
  } catch (error) {
    console.error('Get user bots error:', error);
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

app.put('/api/bot/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    const { minW, maxW, refBonus, mustJoin, nonMust, tasks } = req.body;
    const updateData = { updatedAt: new Date().toISOString() };
    if (minW !== undefined) updateData.minW = parseFloat(minW);
    if (maxW !== undefined) updateData.maxW = parseFloat(maxW);
    if (refBonus !== undefined) updateData.refBonus = parseFloat(refBonus);
    if (mustJoin !== undefined) {
      updateData.mustJoin = typeof mustJoin === 'string'
        ? mustJoin.split(',').map(s => s.trim()).filter(Boolean)
        : mustJoin;
    }
    if (nonMust !== undefined) {
      updateData.nonMust = typeof nonMust === 'string'
        ? nonMust.split(',').map(s => s.trim()).filter(Boolean)
        : nonMust;
    }
    if (tasks !== undefined) updateData.tasks = tasks;
    await db.collection('bots').doc(id).update(updateData);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update bot settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.delete('/api/bot/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('bots').doc(id).delete();    res.json({ success: true, message: 'Bot deleted successfully' });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

app.post('/api/webhook/payment', async (req, res) => {
  try {
    const { userId, amount, currency, txHash, method } = req.body;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.collection('users').doc(userId).set({
      isPremium: true,
      premiumExpiresAt: expiresAt,
      premiumMethod: method,
      premiumAmount: amount,
      premiumCurrency: currency,
      premiumTxHash: txHash,
      premiumActivatedAt: new Date().toISOString()
    }, { merge: true });
    res.json({ success: true, message: 'Premium activated successfully' });
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.get('/api/user/:uid/profile', async (req, res) => {
  try {
    const { uid } = req.params;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) {
      return res.json({
        success: true,
        profile: {
          isPremium: false,
          createdAt: new Date().toISOString()
        }
      });
    }
    res.json({ success: true, profile: doc.data() });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.get('/api/store/templates', async (req, res) => {
  try {
    const snapshot = await db.collection('storeTemplates')      .where('active', '==', true)
      .get();
    const templates = [];
    snapshot.forEach(doc => {
      templates.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, templates });
  } catch (error) {
    console.error('Get store templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

app.post('/api/store/purchase', async (req, res) => {
  try {
    const { userId, templateId, paymentMethod, txHash } = req.body;
    await db.collection('users').doc(userId).set({
      purchasedTemplates: admin.firestore.FieldValue.arrayUnion(templateId)
    }, { merge: true });
    res.json({ success: true, message: 'Template purchased successfully' });
  } catch (error) {
    console.error('Purchase template error:', error);
    res.status(500).json({ error: 'Failed to purchase template' });
  }
});

app.post('/api/check-payment', async (req, res) => {
  try {
    const { memo } = req.body;
    if (!memo) {
      return res.status(400).json({ error: 'Memo is required' });
    }
    const paymentDoc = await db.collection('payments')
      .where('memo', '==', memo)
      .where('status', '==', 'confirmed')
      .get();
    if (!paymentDoc.empty) {
      return res.json({ confirmed: true });
    }
    res.json({ confirmed: false });
  } catch (error) {
    console.error('Check payment error:', error);
    res.status(500).json({ error: 'Failed to check payment' });
  }
});

app.post('/api/process-payment', async (req, res) => {
  try {
    const { txHash, memo, amount, sender, currency } = req.body;
    if (!txHash || !memo || !amount || !currency) {      return res.status(400).json({ error: 'Missing required payment fields' });
    }
    const memoParts = memo.split('_');
    if (memoParts.length < 3 || memoParts[0] !== 'CLUR' || memoParts[1] !== 'PREMIUM') {
      return res.status(400).json({ error: 'Invalid memo format' });
    }
    const userId = memoParts[2];
    const existing = await db.collection('payments')
      .where('txHash', '==', txHash)
      .get();
    if (!existing.empty) {
      return res.json({ success: true, message: 'Already processed' });
    }
    await db.collection('payments').add({
      txHash: txHash,
      memo: memo,
      userId: userId,
      amount: amount,
      currency: currency,
      sender: sender,
      status: 'confirmed',
      confirmedAt: new Date().toISOString()
    });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.collection('users').doc(userId).set({
      isPremium: true,
      premiumExpiresAt: expiresAt,
      premiumMethod: currency,
      premiumAmount: amount,
      premiumTxHash: txHash,
      premiumActivatedAt: new Date().toISOString()
    }, { merge: true });
    res.json({ success: true, message: 'Premium activated successfully' });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});
// ==========================================
// 12. GET SINGLE BOT (for dashboard/admin panel)
// ==========================================
app.get('/api/bot/:id', async (req, res) => {
  try {
    const doc = await db.collection('bots').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Bot not found' });
    
    const data = doc.data();
    delete data.token;    // Security: never send token to frontend
    delete data.apiKey;   // Security: never send API key to frontend
    
    res.json({ success: true, bot: { id: doc.id, ...data } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bot' });
  }
});

// ==========================================
// 13. GET BOT STATS (Total users, uptime, etc.)
// ==========================================
app.get('/api/bot/:id/stats', async (req, res) => {
  try {
    const doc = await db.collection('bots').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Bot not found' });
    
    const b = doc.data();
    const created = new Date(b.createdAt || Date.now()).getTime();
    const last = b.lastActive ? new Date(b.lastActive).getTime() : Date.now();
    const uptimeHours = Math.max(0, Math.floor((last - created) / 3600000));
    
    res.json({
      success: true,
      stats: {
        users: b.users || 0,
        uptimeHours: uptimeHours,
        currency: b.currency || '-',
        payMethod: b.payMethod || 'Manual',
        status: b.status || 'active'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Clur Bot Creator Backend running on port ' + PORT);
  console.log('✅ [Scheduler] loaded');
});
