# Clur Bot Creator Backend

Node.js/Express backend for the Clur Bot Creator platform.

## Features

- 🤖 **Bot Creation**: Generate Python bot scripts with custom configurations
- 💳 **Payment Integration**: Auto-confirm TON/USDT payments via Web App
- 📊 **Admin Panel**: Update bot settings, view users, manage withdrawals
- ⏰ **Scheduled Tasks**: Auto-deactivate bots deleted from BotFather
- 🔥 **Firebase**: Real-time database and authentication

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file (see `.env.example`)
4. Upload `serviceAccountKey.json` to Render
5. Deploy to Render

## API Endpoints

- `POST /api/verify-token` - Verify Telegram bot token
- `POST /api/create-bot` - Create new bot
- `GET /api/user/:uid/bots` - Get user's bots
- `PUT /api/bot/:id/settings` - Update bot settings
- `DELETE /api/bot/:id` - Delete bot
- `POST /api/webhook/payment` - Payment webhook
- `GET /api/user/:uid/profile` - Get user profile
- `GET /api/store/templates` - Get store templates
- `POST /api/store/purchase` - Purchase template

## Environment Variables

```env
PORT=3000
FIREBASE_CREDENTIALS_PATH=./serviceAccountKey.json
ADMIN_TELEGRAM_BOT_TOKEN=YOUR_ADMIN_BOT_TOKEN
TON_WALLET_ADDRESS=UQAXXXXXXXXXXXXXXXXXXXXXXXXXXXX
USDT_TON_WALLET_ADDRESS=UQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
WEBAPP_BASE_URL=https://your-webapp-domain.com
```

## Deployment

### Render

1. Connect GitHub repository
2. Set environment variables in Render dashboard
3. Upload `serviceAccountKey.json` via Render file upload
4. Deploy

## License

MIT
