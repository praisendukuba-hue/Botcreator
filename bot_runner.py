import os, time, json, threading
import requests
import telebot
from telebot import types
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate(os.environ.get("FIREBASE_CREDENTIALS_PATH", "./serviceAccountKey.json"))
firebase_admin.initialize_app(cred)
db = firestore.client()

OFFICIAL_CHANNEL = "@DAILYUUPA"
OFFICIAL_URL = "https://t.me/DAILYUUPA"
ACTIVE = {}

def sig_of(cfg):
    return json.dumps(cfg, sort_keys=True, default=str)

def mark_deactivated(bot_id, reason):
    try:
        db.collection("bots").document(bot_id).update({
            "status": "deactivated",
            "deactivationReason": reason
        })
        print(f"[runner] deactivated {bot_id}: {reason}")
    except Exception as e:
        print("[runner] deactivate error:", e)

def touch_stats(bot_id, user_id):
    try:
        ref = db.collection("bots").document(bot_id)
        ref.update({"lastActive": firestore.SERVER_TIMESTAMP})
        uref = ref.collection("users").document(str(user_id))
        if not uref.get().exists:
            uref.set({"joinedAt": firestore.SERVER_TIMESTAMP})
            cur = ref.get().to_dict().get("users", 0) or 0
            ref.update({"users": cur + 1})
    except Exception as e:
        print("[runner] stats error:", e)

def build_bot(bot_id, cfg):
    currency = cfg.get("currency", "TON")
    pay = cfg.get("payMethod", "Manual")
    minW = float(cfg.get("minW", 0.01))
    maxW = float(cfg.get("maxW", 100))
    refB = float(cfg.get("refBonus", 0.01))
    payout = cfg.get("payoutChannel") or OFFICIAL_CHANNEL
    api_key = cfg.get("apiKey", "")
    must = [OFFICIAL_CHANNEL] + (cfg.get("mustJoin") or [])
    tasks = cfg.get("tasks") or []    name = cfg.get("name", "Rewards Bot")

    bot = telebot.TeleBot(cfg["token"], parse_mode="HTML", threaded=True)
    users = {}

    def U(uid):
        uid = str(uid)
        if uid not in users:
            users[uid] = {"balance": 0.0, "wallet": "Not Set", "refer": None, "refs": 0}
        return users[uid]

    def joined(uid):
        for ch in must:
            try:
                m = bot.get_chat_member(ch, int(uid))
                if m.status in ("left", "kicked"):
                    return False
            except Exception:
                continue
        return True

    def menu():
        m = types.ReplyKeyboardMarkup(resize_keyboard=True)
        m.add("🏦 Balance", "👥 Invite")
        m.add("📋 Task", "💸 Withdraw")
        if pay in ("Manual", "AutoPay1"):
            m.add("👛 Wallet")
        return m

    def notify(text):
        try:
            bot.send_message(payout, text)
        except Exception as e:
            print("[runner] notify error:", e)

    @bot.message_handler(commands=["start"])
    def start(m):
        uid = m.from_user.id
        touch_stats(bot_id, uid)
        u = U(uid)
        parts = m.text.split()
        if len(parts) > 1 and parts[1].isdigit() and int(parts[1]) != uid and u["refer"] is None:
            u["refer"] = parts[1]
            r = U(parts[1])
            r["balance"] += refB
            r["refs"] += 1
            try:
                bot.send_message(int(parts[1]), f"🎉 You earned <b>{refB} {currency}</b> for a new referral!")
            except Exception:
                pass        if not joined(uid):
            mk = types.InlineKeyboardMarkup()
            mk.add(types.InlineKeyboardButton("📢 Join Official Channel", url=OFFICIAL_URL))
            i = 2
            for ch in must[1:]:
                mk.add(types.InlineKeyboardButton(f"📢 Join Channel {i}", url=f"https://t.me/{ch.replace('@','')}"))
                i += 1
            mk.add(types.InlineKeyboardButton("✅ I Joined", callback_data="recheck"))
            bot.send_message(uid, "🚫 <b>Join the required channels first</b>", reply_markup=mk)
            return
        bot.send_message(uid, f"💎 <b>WELCOME TO {name}</b>\n\n🚀 Earn {currency} for free!", reply_markup=menu())

    @bot.callback_query_handler(func=lambda c: c.data == "recheck")
    def recheck(c):
        if joined(c.from_user.id):
            bot.answer_callback_query(c.id, "✅ Verified!")
            bot.send_message(c.from_user.id, "🏡 Menu:", reply_markup=menu())
        else:
            bot.answer_callback_query(c.id, "❌ Not joined yet", show_alert=True)

    @bot.message_handler(func=lambda m: m.text == "🏦 Balance")
    def balance(m):
        u = U(m.from_user.id)
        bot.reply_to(m, f"💰 <b>Balance</b>\n\n<b>{u['balance']:.2f} {currency}</b>\n\n👛 Wallet: <code>{u['wallet']}</code>")

    @bot.message_handler(func=lambda m: m.text == "📋 Task")
    def task(m):
        lines = ["📋 <b>TASKS</b>", "━━━━━━━━━━", f"1️⃣ <b>Join Official Channel:</b> {OFFICIAL_CHANNEL}"]
        for i, t in enumerate(tasks, 2):
            lines.append(f"{i}️⃣ <b>{t.get('n','Task')}:</b> {t.get('l','')}")
        lines.append("━━━━━━━━━━\n✅ Complete tasks to earn!")
        bot.reply_to(m, "\n".join(lines))

    @bot.message_handler(func=lambda m: m.text == "👥 Invite")
    def invite(m):
        me = bot.get_me()
        u = U(m.from_user.id)
        bot.reply_to(m, f"🎁 <b>INVITE & EARN</b>\n\n💎 {refB} {currency} per invite\n👥 Referrals: {u['refs']}\n\n🔗 <code>https://t.me/{me.username}?start={m.from_user.id}</code>")

    if pay in ("Manual", "AutoPay1"):
        @bot.message_handler(func=lambda m: m.text == "👛 Wallet")
        def wallet(m):
            u = U(m.from_user.id)
            msg = bot.reply_to(m, f"👛 Current wallet:\n<code>{u['wallet']}</code>\n\nSend your new wallet address now:")
            bot.register_next_step_handler(msg, set_wallet)

        def set_wallet(m):
            U(m.from_user.id)["wallet"] = m.text.strip()
            bot.reply_to(m, "✅ Wallet saved!")
    @bot.message_handler(func=lambda m: m.text == "💸 Withdraw")
    def withdraw(m):
        u = U(m.from_user.id)
        if pay in ("Manual", "AutoPay1") and u["wallet"] == "Not Set":
            bot.reply_to(m, "👛 Set your wallet first: tap 👛 Wallet")
            return
        msg = bot.reply_to(m, f"💸 Enter amount ({currency})\nMin {minW} • Max {maxW}")
        bot.register_next_step_handler(msg, do_withdraw)

    def do_withdraw(m):
        uid = m.from_user.id
        u = U(uid)
        try:
            amt = float(m.text)
        except Exception:
            bot.reply_to(m, "❌ Numbers only")
            return
        if amt < minW or amt > maxW:
            bot.reply_to(m, f"❌ Must be between {minW} and {maxW}")
            return
        if u["balance"] < amt:
            bot.reply_to(m, "❌ Insufficient balance")
            return

        if pay == "AutoPay1":
            payload = {"api_key": api_key, "to_address": u["wallet"], "amount": amt, "comment": "Withdrawal"}
            ok = False
            try:
                r = requests.post(f"https://ptexchange-api.vercel.app/pay/{currency.lower()}", json=payload, timeout=30)
                ok = r.status_code == 200 and (r.json().get("success") or r.json().get("ok"))
            except Exception:
                ok = False
            if ok:
                u["balance"] -= amt
                bot.reply_to(m, "✅ Paid automatically via Pt Exchange!")
                notify(f"💸 AutoPay1 paid {amt} {currency} to {uid}")
            else:
                bot.reply_to(m, "❌ Payment failed. Balance NOT deducted.")

        elif pay == "AutoPay2":
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {"clientPayoutId": f"CLUR-{uid}-{int(time.time())}", "target": str(uid),
                       "targetType": "telegram_user_id", "asset": currency.upper(), "amount": str(amt)}
            ok = False
            try:
                r = requests.post("https://pay.api.xrocket.exchange/api/v1/payouts", json=payload, headers=headers, timeout=30)
                ok = r.status_code == 200
            except Exception:
                ok = False
            if ok:                u["balance"] -= amt
                bot.reply_to(m, "✅ Paid automatically via xRocket!")
                notify(f"💸 AutoPay2 paid {amt} {currency} to {uid}")
            else:
                bot.reply_to(m, "❌ Payment failed. Balance NOT deducted.")

        else:
            u["balance"] -= amt
            bot.reply_to(m, "⏳ Request sent to admin for manual payment.")
            notify(f"💸 MANUAL withdrawal\n👤 {uid}\n💰 {amt} {currency}\n👛 {u['wallet']}")

    return bot

def start_bot(cfg):
    bot_id = cfg["id"]
    try:
        chk = requests.get(f"https://api.telegram.org/bot{cfg['token']}/getMe", timeout=8)
        if not chk.json().get("ok"):
            mark_deactivated(bot_id, "Token invalid")
            return
    except Exception:
        print(f"[runner] getMe network error for {bot_id}")
        return
    bot = build_bot(bot_id, cfg)
    stop_flag = threading.Event()
    def run():
        while not stop_flag.is_set():
            try:
                bot.infinity_polling(timeout=20, long_polling_timeout=20)
            except Exception as e:
                print(f"[runner] {bot_id} polling error:", e)
                time.sleep(5)
    t = threading.Thread(target=run, daemon=True)
    t.start()
    ACTIVE[bot_id] = {"thread": t, "bot": bot, "sig": sig_of(cfg), "stop": stop_flag}
    print(f"[runner] ✅ STARTED bot {bot_id} ({cfg.get('name')})")

def stop_bot(bot_id):
    info = ACTIVE.pop(bot_id, None)
    if not info:
        return
    info["stop"].set()
    try:
        info["bot"].stop_polling()
    except Exception:
        pass
    print(f"[runner]  STOPPED bot {bot_id}")

def sync():
    while True:        try:
            docs = list(db.collection("bots").where("status", "==", "active").stream())
            live = {}
            for d in docs:
                c = d.to_dict()
                c["id"] = d.id
                live[d.id] = c
            for bid in list(ACTIVE):
                if bid not in live:
                    stop_bot(bid)
            for bid, cfg in live.items():
                s = sig_of(cfg)
                if bid not in ACTIVE:
                    start_bot(cfg)
                elif ACTIVE[bid]["sig"] != s:
                    stop_bot(bid)
                    start_bot(cfg)
        except Exception as e:
            print("[runner] sync error:", e)
        time.sleep(60)

if __name__ == "__main__":
    print("🤖 Clur Bot Runner starting...")
    threading.Thread(target=sync, daemon=True).start()
    while True:
        time.sleep(3600)
