const axios = require('axios');
const { db } = require('../firebase');

const TON_API_URL = 'https://toncenter.com/api/v2';
const TON_WALLET = process.env.TON_WALLET_ADDRESS;
const USDT_WALLET = process.env.USDT_TON_WALLET_ADDRESS;
const PROCESSED_TXS = new Set();

// ==========================================
// CHECK TON TRANSACTIONS
// ==========================================
async function checkTonTransactions() {
  try {
    const response = await axios.get(`${TON_API_URL}/getTransactions`, {
      params: {
        address: TON_WALLET,
        limit: 20
      },
      timeout: 10000
    });
    
    if (!response.data.result) return;
    
    for (const tx of response.data.result) {
      const txHash = tx.transaction_id.hash;
      
      if (PROCESSED_TXS.has(txHash)) continue;
      
      let memo = '';
      try {
        if (tx.in_msg && tx.in_msg.message) {
          memo = Buffer.from(tx.in_msg.message, 'base64').toString('utf-8');
        }
      } catch (e) {
        continue;
      }
      
      if (memo.startsWith('CLUR_PREMIUM_')) {
        const amount = tx.in_msg.value;
        const sender = tx.in_msg.source;
        
        try {
          await axios.post('http://localhost:3000/api/process-payment', {
            txHash,
            memo,
            amount,
            sender,
            currency: 'TON'
          });
                    PROCESSED_TXS.add(txHash);
          console.log(`✅ Processed TON payment: ${txHash}`);
        } catch (err) {
          console.error('Failed to process TON payment:', err.message);
        }
      }
    }
  } catch (error) {
    console.error('TON monitor error:', error.message);
  }
}

// ==========================================
// CHECK USDT (TON) TRANSACTIONS
// ==========================================
async function checkUsdtTransactions() {
  try {
    // Get Jetton transfers to your USDT wallet
    const response = await axios.get(`${TON_API_URL}/getJettonTransfers`, {
      params: {
        address: USDT_WALLET,
        limit: 20
      },
      timeout: 10000
    });
    
    if (!response.data.result) return;
    
    for (const tx of response.data.result) {
      const txHash = tx.transaction_id.hash;
      
      if (PROCESSED_TXS.has(txHash)) continue;
      
      let memo = '';
      try {
        if (tx.comment) {
          memo = tx.comment;
        }
      } catch (e) {
        continue;
      }
      
      if (memo.startsWith('CLUR_PREMIUM_')) {
        const amount = tx.jettons; // Amount in Jetton units
        const sender = tx.source;
        
        try {
          await axios.post('http://localhost:3000/api/process-payment', {
            txHash,
            memo,            amount,
            sender,
            currency: 'USDT'
          });
          
          PROCESSED_TXS.add(txHash);
          console.log(`✅ Processed USDT payment: ${txHash}`);
        } catch (err) {
          console.error('Failed to process USDT payment:', err.message);
        }
      }
    }
  } catch (error) {
    console.error('USDT monitor error:', error.message);
  }
}

// ==========================================
// RUN BOTH MONITORS
// ==========================================
setInterval(checkTonTransactions, 30000);
setInterval(checkUsdtTransactions, 30000);

console.log('✅ Blockchain monitor started');
console.log('   - Checking TON every 30 seconds');
console.log('   - Checking USDT (TON) every 30 seconds');
