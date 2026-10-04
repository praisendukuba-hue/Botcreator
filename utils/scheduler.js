const cron = require('node-cron');
const axios = require('axios');
const { db } = require('../firebase');

/**
 * BOT DEACTIVATION CHECKER
 * Runs every 6 hours to check if bots were deleted from BotFather
 */
cron.schedule('0 */6 * * *', async () => {
  console.log('🔄 [Scheduler] Running bot deactivation check...');
  
  try {
    const snapshot = await db.collection('bots').where('status', '==', 'active').get();
    
    if (snapshot.empty) {
      console.log('✅ [Scheduler] No active bots to check.');
      return;
    }
    
    let deactivatedCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      try {
        // Check if bot token is still valid
        const response = await axios.get(`https://api.telegram.org/bot${data.token}/getMe`, { 
          timeout: 5000 
        });
        
        if (!response.data.ok) {
          // Bot was deleted or token revoked
          await doc.ref.update({ 
            status: 'deactivated', 
            deactivatedAt: new Date().toISOString(),
            deactivationReason: 'Token invalid or bot deleted'
          });
          console.log(`❌ [Scheduler] Deactivated bot: ${data.name} (${doc.id})`);
          deactivatedCount++;
        }
      } catch (error) {
        // If API call fails (401/404), mark as deactivated
        if (error.response && (error.response.status === 401 || error.response.status === 404)) {
          await doc.ref.update({ 
            status: 'deactivated', 
            deactivatedAt: new Date().toISOString(),
            deactivationReason: 'Token unauthorized or bot not found'
          });
          console.log(`❌ [Scheduler] Deactivated bot (Auth Error): ${data.name} (${doc.id})`);
          deactivatedCount++;
        } else {
          console.error(`⚠️ [Scheduler] Error checking bot ${doc.id}:`, error.message);
        }
      }
    }
    
    console.log(`✅ [Scheduler] Deactivation check complete. Deactivated: ${deactivatedCount} bots.`);
  } catch (error) {
    console.error('❌ [Scheduler] Fatal error in deactivation check:', error);
  }
});

/**
 * PREMIUM EXPIRATION CHECKER
 * Runs daily to deactivate expired premium accounts
 */
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 [Scheduler] Running premium expiration check...');
  
  try {
    const now = new Date().toISOString();
    const snapshot = await db.collection('users')
      .where('isPremium', '==', true)
      .where('premiumExpiresAt', '<', now)
      .get();
    
    if (snapshot.empty) {
      console.log('✅ [Scheduler] No expired premium accounts.');
      return;
    }
    
    let expiredCount = 0;
    
    for (const doc of snapshot.docs) {
      await doc.ref.update({ 
        isPremium: false,
        premiumExpiredAt: now
      });
      console.log(`⏰ [Scheduler] Premium expired for user: ${doc.id}`);
      expiredCount++;
    }
    
    console.log(`✅ [Scheduler] Premium expiration check complete. Expired: ${expiredCount} accounts.`);
  } catch (error) {
    console.error('❌ [Scheduler] Fatal error in premium expiration check:', error);
  }
});

console.log('✅ [Scheduler] Cron jobs initialized.');
