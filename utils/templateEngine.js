/**
 * CLUR BOT CREATOR - TEMPLATE ENGINE
 * Generates Python bot scripts with user-specific configurations
 */

function generateBotScript(data) {
  // 1. Determine Payment Handler
  let paymentHandler = '';
  if (data.payMethod === 'AutoPay1') {
    paymentHandler = getPtExchangeHandler(data.apiKey, data.payoutChannel, data.currency);
  } else if (data.payMethod === 'AutoPay2') {
    paymentHandler = getXRocketHandler(data.apiKey, data.payoutChannel, data.currency);
  } else {
    paymentHandler = getManualHandler(data.payoutChannel, data.currency);
  }

  // 2. Determine Menu Buttons
  let menuButtons = `
markup.add("🏦 Balance", "👥 Invite")
markup.add("📋 Task", "💸 Withdraw")
`;
  // Add Wallet ONLY for Manual or Pt Exchange (AutoPay1)
  if (data.payMethod === 'Manual' || data.payMethod === 'AutoPay1') {
    menuButtons += `markup.add("👛 Wallet")\n`;
  }

  // 3. Format Channels (Official FIRST, then user's custom channels)
  const customChannels = (data.mustJoin || []).map(c => `"${c}"`).join(', ');
  const channelsList = customChannels 
    ? `["@DAILYUUPA", ${customChannels}]` 
    : `["@DAILYUUPA"]`;

  // 4. Format Tasks String
  let tasksString = `1️⃣ <b>Join Official Channel:</b> @DAILYUUPA\n`;
  if (data.tasks && data.tasks.length > 0) {
    data.tasks.forEach((task, index) => {
      tasksString += `${index + 2}️⃣ <b>${task.n}:</b> <a href="${task.l}">Click Here</a>\n`;
    });
  }

  // 5. Format Non-Must-Join Channels (Optional/Display Only)
  const nonMustChannels = (data.nonMust || []).map(c => `"${c}"`).join(', ');
  const nonMustList = nonMustChannels ? `[${nonMustChannels}]` : `[]`;

  return `# ==========================================
# CLUR BOT CREATOR - GENERATED SCRIPT
# Bot: ${data.name} | Owner: ${data.ownerId}
# Created: ${new Date().toISOString()}
# ==========================================
import telebot
import requests
import json
import time

API_TOKEN = "${data.token}"
bot = telebot.TeleBot(API_TOKEN, parse_mode="HTML")

# --- CONFIGURATION ---
BOT_NAME = "${data.name}"
CURRENCY = "${data.currency}"
MIN_WITHDRAW = ${data.minW || 0.01}
MAX_WITHDRAW = ${data.maxW || 100}
PAYOUT_CHANNEL = "${data.payoutChannel || '@DAILYUUPA'}"
REQUIRED_CHANNELS = ${channelsList}
NON_MUST_CHANNELS = ${nonMustList}
REFERRAL_BONUS = ${data.refBonus || 0.01}

# --- DATABASE (In-memory for now, replace with Firebase/JSON in production) ---
users_db = {}

def get_user(user_id):
    uid = str(user_id)
    if uid not in users_db:
        users_db[uid] = {
            "balance": 0.0, 
            "refer": None, 
            "wallet": "Not Set", 
            "ref_count": 0,
            "joined_at": time.time()
        }
    return users_db[uid]

# --- CHANNEL CHECK ---
def check_channels(user_id):
    # Official channel is ALWAYS checked first
    for channel in REQUIRED_CHANNELS:
        try:
            member = bot.get_chat_member(channel, user_id)
            if member.status in ['left', 'kicked']:
                return False
        except Exception as e:
            print(f"Error checking channel {channel}: {e}")
            pass # Fail safe if bot isn't admin in a specific channel
    return True

# --- START COMMAND ---
@bot.message_handler(commands=['start'])
def send_welcome(message):
    user_id = message.from_user.id    user = get_user(user_id)
    
    # Handle referral
    if len(message.text.split()) > 1:
        ref_id = message.text.split()[1]
        if ref_id != str(user_id) and user['refer'] is None:
            user['refer'] = ref_id
            # Give referral bonus to referrer
            referrer = get_user(ref_id)
            referrer['balance'] += REFERRAL_BONUS
            referrer['ref_count'] += 1
            bot.send_message(ref_id, f"🎉 You received {REFERRAL_BONUS} {CURRENCY} for inviting a new user!")
    
    if not check_channels(user_id):
        markup = telebot.types.InlineKeyboardMarkup(row_width=1)
        markup.add(telebot.types.InlineKeyboardButton("📢 Join @DAILYUUPA", url="https://t.me/DAILYUUPA"))
        # Add other channel buttons dynamically
        for i, channel in enumerate(REQUIRED_CHANNELS[1:], 2):  # Skip @DAILYUUPA (already added)
            markup.add(telebot.types.InlineKeyboardButton(f"📢 Join Channel {i}", url=f"https://t.me/{channel.replace('@', '')}"))
        markup.add(telebot.types.InlineKeyboardButton("✅ I Have Joined", callback_data="check_join"))
        bot.send_message(user_id, "🚫 <b>ACCESS DENIED</b>\\n\\nPlease join the required channels to use this bot.", reply_markup=markup)
        return

    welcome_text = f"💎 <b>WELCOME TO {BOT_NAME}</b>\\n\\n🚀 Earn {CURRENCY} rewards for free!"
    
    # DYNAMIC MENU BASED ON PAYMENT METHOD
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    ${menuButtons}
    
    bot.send_message(user_id, welcome_text, reply_markup=markup)

# --- TASK COMMAND ---
@bot.message_handler(func=lambda message: message.text == "📋 Task")
def handle_task(message):
    user_id = message.from_user.id
    
    task_text = f"""📋 <b>AVAILABLE TASKS</b>

━━━━━━━━━━━━━━━━━━

{tasksString}

━━━━━━━━━━━━━━━━━━

✅ Complete all tasks to earn rewards!
"""
    
    bot.send_message(user_id, task_text)

# --- BALANCE COMMAND ---@bot.message_handler(func=lambda message: message.text == "🏦 Balance")
def handle_balance(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    user_info = bot.get_chat(user_id)
    first_name = user_info.first_name or "Unknown"
    username = user_info.username or "No username"
    
    msg = f"""<b>👤 MY ACCOUNT</b>

━━━━━━━━━━━━━━━━━━

🧑 <b>Name</b>
{first_name}

🔗 <b>Username</b>
@{username}

🆔 <b>Telegram ID</b>
<code>{user_id}</code>

━━━━━━━━━━━━━━━━━━

💰 <b>Available Balance</b>
<b>{user['balance']:.2f} {CURRENCY}</b>

👛 <b>Withdrawal Wallet</b>
<code>{user['wallet']}</code>

━━━━━━━━━━━━━━━━━━
{BOT_NAME} Account
"""
    
    bot.send_message(user_id, msg)

# --- INVITE COMMAND ---
@bot.message_handler(func=lambda message: message.text == "👥 Invite")
def handle_invite(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    bot_username = bot.get_me().username
    link = f"https://t.me/{bot_username}?start={user_id}"
    
    msg = f"""🎁 <b>INVITE & EARN</b>

━━━━━━━━━━━━━━━━━━

💎 <b>Referral Reward</b>{REFERRAL_BONUS} {CURRENCY} per successful invite

👥 <b>Your Referrals</b>
{user['ref_count']} users

━━━━━━━━━━━━━━━━━━

🔗 <b>Your Personal Invite Link</b>

<code>{link}</code>

━━━━━━━━━━━━━━━━━━

📌 <b>How it works</b>

1️⃣ Share your invite link
2️⃣ Your friend joins the bot
3️⃣ They complete the required steps
4️⃣ You receive your referral bonus

⚠️ Fake, duplicate, or automated
accounts are not eligible for rewards.

━━━━━━━━━━━━━━━━━━
👥 Invite more friends • Earn more {CURRENCY}
"""
    
    bot.send_message(user_id, msg)

# --- WALLET COMMAND (Only if Manual or AutoPay1) ---
${data.payMethod === 'Manual' || data.payMethod === 'AutoPay1' ? `
@bot.message_handler(func=lambda message: message.text == "👛 Wallet")
def handle_wallet(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    msg = f"""👛 <b>{CURRENCY} WALLET</b>

━━━━━━━━━━━━━━━━━━

🔗 <b>Connected Address</b>

<code>{user['wallet']}</code>

━━━━━━━━━━━━━━━━━━

💡 This is the wallet that will receive
your {CURRENCY} withdrawals.

You can update it by sending:/setwallet <code>YOUR_WALLET_ADDRESS</code>
"""
    
    bot.send_message(user_id, msg)

@bot.message_handler(commands=['setwallet'])
def set_wallet(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    if len(message.text.split()) < 2:
        bot.send_message(user_id, "❌ Please provide a wallet address:\\n/setwallet YOUR_WALLET_ADDRESS")
        return
    
    wallet = message.text.split()[1]
    user['wallet'] = wallet
    bot.send_message(user_id, f"✅ Wallet updated successfully!\\n\\n<code>{wallet}</code>")
` : ''}

# --- WITHDRAW COMMAND ---
@bot.message_handler(func=lambda message: message.text == "💸 Withdraw")
def handle_withdraw(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    ${data.payMethod === 'Manual' || data.payMethod === 'AutoPay1' ? `
    if user['wallet'] == "Not Set":
        bot.send_message(user_id, "👛 Please set your wallet first using /setwallet <address>")
        return
    ` : ''}
    
    bot.send_message(user_id, f"💸 Enter withdrawal amount ({CURRENCY}):\\n\\nMin: {MIN_WITHDRAW}\\nMax: {MAX_WITHDRAW}")
    bot.register_next_step_handler(message, process_withdrawal)

def process_withdrawal(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    try:
        amount = float(message.text)
    except:
        bot.send_message(user_id, "❌ Please enter a valid number.")
        return
    
    if amount < MIN_WITHDRAW or amount > MAX_WITHDRAW:
        bot.send_message(user_id, f"❌ Withdrawal must be between {MIN_WITHDRAW} and {MAX_WITHDRAW} {CURRENCY}")
        return
    
    if user['balance'] < amount:
        bot.send_message(user_id, "❌ Insufficient balance.")        return
    
    # Injected Payment Logic
    ${paymentHandler}

# --- CALLBACK HANDLER ---
@bot.callback_query_handler(func=lambda call: call.data == "check_join")
def check_join_callback(call):
    user_id = call.from_user.id
    
    if check_channels(user_id):
        bot.answer_callback_query(call.id, "✅ All channels joined!")
        bot.send_message(user_id, "✅ Welcome! You can now use the bot.")
        
        # Show main menu
        markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
        ${menuButtons}
        bot.send_message(user_id, "🏡 Choose an option below:", reply_markup=markup)
    else:
        bot.answer_callback_query(call.id, "❌ You haven't joined all channels yet!", show_alert=True)

# --- RUN ---
print(f"✅ {BOT_NAME} is running...")
print(f"💰 Currency: {CURRENCY}")
print(f"💳 Payment Method: ${data.payMethod}")
print(f"📢 Required Channels: {REQUIRED_CHANNELS}")
bot.polling(none_stop=True)
`;
}

// --- PAYMENT HANDLERS ---
function getPtExchangeHandler(apiKey, channel, currency) {
  return `
    # Pt Exchange API Call
    payload = {
        "api_key": "${apiKey}",
        "to_address": user["wallet"],
        "amount": amount,
        "comment": "Withdrawal from ${channel}"
    }
    
    try:
        res = requests.post(
            "https://ptexchange-api.vercel.app/pay/${currency.toLowerCase()}",
            json=payload,
            timeout=30
        )
        result = res.json()
        
        if result.get("success") or result.get("ok") or res.status_code == 200:            user["balance"] -= amount
            bot.send_message(user_id, f"✅ Withdrawal Successful!\\n\\n💰 Amount: {amount} {CURRENCY}\\n🏦 Wallet: {user['wallet']}")
            bot.send_message("${channel}", f"💸 <b>Auto-Pay Successful</b>\\n\\n👤 User: {user_id}\\n💰 Amount: {amount} {CURRENCY}\\n🏦 Wallet: {user['wallet']}")
        else:
            error_msg = result.get("message") or result.get("error") or "Unknown error"
            bot.send_message(user_id, f"❌ Payment failed: {error_msg}\\n\\nBalance not deducted.")
            bot.send_message("${channel}", f"❌ <b>Auto-Pay Failed</b>\\n\\n👤 User: {user_id}\\n💰 Amount: {amount} {CURRENCY}\\n❗ Error: {error_msg}")
    except Exception as e:
        bot.send_message(user_id, f"❌ API Error: {str(e)[:200]}\\n\\nBalance not deducted.")
        bot.send_message("${channel}", f"❌ <b>API Error</b>\\n\\n👤 User: {user_id}\\n💰 Amount: {amount} {CURRENCY}\\n❗ Error: {str(e)[:200]}")
`;
}

function getXRocketHandler(apiKey, channel, currency) {
  return `
    # xRocket API Call (No wallet needed - sends directly to Telegram user)
    headers = {
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    payload = {
        "clientPayoutId": f"CLUR-{user_id}-{int(time.time())}",
        "target": str(user_id),
        "targetType": "telegram_user_id",
        "asset": "${currency.toUpperCase()}",
        "amount": str(amount),
        "description": "Withdrawal from ${channel}"
    }
    
    try:
        res = requests.post(
            "https://pay.api.xrocket.exchange/api/v1/payouts",
            json=payload,
            headers=headers,
            timeout=30
        )
        result = res.json()
        
        if res.status_code == 200 or result.get("status") == "finished":
            user["balance"] -= amount
            payout_id = result.get("payoutId", "N/A")
            bot.send_message(user_id, f"✅ xRocket Withdrawal Successful!\\n\\n💰 Amount: {amount} {CURRENCY}\\n🆔 Payout ID: {payout_id}")
            bot.send_message("${channel}", f"💸 <b>xRocket Auto-Pay Successful</b>\\n\\n👤 User: {user_id}\\n💰 Amount: {amount} {CURRENCY}\\n🆔 Payout ID: {payout_id}")
        else:
            error_msg = result.get("message") or result.get("error") or res.text
            bot.send_message(user_id, f"❌ xRocket Failed: {error_msg}\\n\\nBalance not deducted.")
            bot.send_message("${channel}", f"❌ <b>xRocket Failed</b>\\n\\n👤 User: {user_id}\\n💰 Amount: {amount} {CURRENCY}\\n❗ Error: {error_msg}")
    except Exception as e:        bot.send_message(user_id, f"❌ API Error: {str(e)[:200]}\\n\\nBalance not deducted.")
        bot.send_message("${channel}", f"❌ <b>API Error</b>\\n\\n👤 User: {user_id}\\n💰 Amount: {amount} {CURRENCY}\\n❗ Error: {str(e)[:200]}")
`;
}

function getManualHandler(channel, currency) {
  return `
    # Manual Payment - Deduct balance and send to payout channel for admin approval
    user["balance"] -= amount
    
    receipt = f"""💸 <b>New Manual Withdrawal</b>

━━━━━━━━━━━━━━━━━━

👤 <b>User ID</b>
<code>{user_id}</code>

💰 <b>Amount</b>
{amount} {CURRENCY}

🏦 <b>Wallet</b>
<code>{user['wallet']}</code>

📦 <b>Status</b>
Pending

━━━━━━━━━━━━━━━━━━
🤖 Bot: @{bot.get_me().username}
"""
    
    bot.send_message(user_id, f"⏳ Withdrawal request submitted.\\n\\n💰 Amount: {amount} {CURRENCY}\\n📦 Status: Pending Review\\n\\nWaiting for admin approval.")
    bot.send_message("${channel}", receipt)
`;
}

module.exports = { generateBotScript };
