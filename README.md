## 📊 Maintenance Commands

### Reset Database
To clear all history and sales for a fresh start:
```bash
pm2 stop diego-bot
rm history.db
pm2 start diego-bot
```

### View Logs
To see real-time bot interactions or debug errors:
```bash
pm2 logs diego-bot
```

### Update Code
```bash
git pull
npm install
npm run build
pm2 restart diego-bot
```

---

## 🔒 Security
- **Admin Panel:** Default credentials are hardcoded in `server.ts` (Admin/Password).
- **Bot Whitelist:** Only specific Telegram User IDs are allowed to interact with the bot (configured in `WHITELIST` array in `server.ts`).

## 📄 License
© 2026 La Caravana Rosa.