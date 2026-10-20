# Deploying TFG Workspace to one VPS

Everything runs on a single Linux server (Ubuntu 24.04 assumed): Next.js, the Socket.io service, PostgreSQL and the uploads folder. A 2 vCPU / 4 GB box is plenty for the team.

```
browser ──https──▶ nginx ─┬─▶ :3000  Next.js (npm start)
                          └─▶ :3001  realtime (/socket.io/)
                 Next.js ──▶ PostgreSQL, ./uploads, SMTP
                 Next.js ──▶ :3001/emit (localhost only)
```

## 1. Server packages

```bash
sudo apt update && sudo apt install -y nginx postgresql git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
sudo apt install -y certbot python3-certbot-nginx
```

## 2. Database

```bash
sudo -u postgres psql -c "CREATE USER tfg WITH PASSWORD 'choose-a-strong-password';"
sudo -u postgres createdb -O tfg tfg_workspace
```

## 3. App

```bash
sudo useradd -m -s /bin/bash tfg
sudo -iu tfg
git clone <repo-url> app && cd app
cp .env.example .env   # then edit it, see below
npm ci
npx prisma migrate deploy
npm run db:seed        # creates the workspace, owner account and seed categories (safe to re-run)
npm run build
```

`.env` for production:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://tfg:<password>@localhost:5432/tfg_workspace?schema=public` |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_TRUST_HOST` | `true` (Auth.js sits behind nginx) |
| `APP_URL` | `https://workspace.tfgsolutions.com` |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` | The President's login; change the password after the first sign-in |
| `UPLOAD_DIR` | `/home/tfg/uploads` (outside the repo, so deploys never touch it) |
| `SMTP_URL`, `EMAIL_FROM` | Your mail provider, e.g. `smtps://user:pass@smtp.gmail.com:465` |
| `CRON_SECRET`, `REALTIME_SECRET` | Two different long random strings |
| `REALTIME_URL` | `http://127.0.0.1:3001` |
| `NEXT_PUBLIC_REALTIME_URL` | Same as `APP_URL` (nginx routes `/socket.io/`). **Set before `npm run build`**: it's baked into the client bundle. |

## 4. systemd services

`/etc/systemd/system/tfg-web.service`:

```ini
[Unit]
Description=TFG Workspace web
After=network.target postgresql.service

[Service]
User=tfg
WorkingDirectory=/home/tfg/app
ExecStart=/usr/bin/npm start
Environment=NODE_ENV=production PORT=3000
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/tfg-realtime.service`: same, with `Description=TFG Workspace realtime` and `ExecStart=/usr/bin/npm run realtime`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tfg-web tfg-realtime
```

## 5. nginx + HTTPS

`/etc/nginx/sites-available/tfg`:

```nginx
server {
  server_name workspace.tfgsolutions.com;
  client_max_body_size 26m;          # 25 MB upload cap + form overhead

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`/emit` on the realtime service is never routed by nginx; only Next.js on localhost calls it.

```bash
sudo ln -s /etc/nginx/sites-available/tfg /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d workspace.tfgsolutions.com
```

## 6. Cron: email digest + backups

`sudo -iu tfg crontab -e`:

```cron
# Digest of notifications unread for 15+ minutes
*/5 * * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:3000/api/cron/digest > /dev/null
# Nightly database dump + uploads copy, keep 14 days
0 3 * * * pg_dump -Fc tfg_workspace > ~/backups/db-$(date +\%F).dump && find ~/backups -name 'db-*' -mtime +14 -delete
# Weekly: delete uploaded files nothing references any more
0 4 * * 0 cd ~/app && npm run cleanup:uploads -- --yes > /dev/null
30 3 * * * tar -czf ~/backups/uploads-$(date +\%F).tgz -C ~ uploads && find ~/backups -name 'uploads-*' -mtime +14 -delete
```

(`mkdir ~/backups` first, and copy that folder off the server too, e.g. with `rclone`.)

## Updating

```bash
sudo -iu tfg && cd app
git pull && npm ci && npx prisma migrate deploy && npm run build
exit
sudo systemctl restart tfg-web tfg-realtime
```
