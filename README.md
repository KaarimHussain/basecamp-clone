# TFG Workspace

Self-hosted Basecamp-style workspace for TFG Solutions: category boards (list + Kanban), task detail with comments, @mentions, tags and files, leadership auto-follow with an inbox and email digest, and Slack-style chat. No seat or project limits.

- Spec: [documents/TFG Workspace — Spec & Architecture.md](documents/TFG%20Workspace%20—%20Spec%20&%20Architecture.md)
- Production deploy (one VPS): [documents/DEPLOY.md](documents/DEPLOY.md)

Stack: Next.js 16, Prisma 7 + PostgreSQL, Auth.js, Tiptap, dnd-kit, Socket.io, Nodemailer (SMTP). Uploads are stored on local disk.

## Local development

Needs Node 24 and a local PostgreSQL.

```bash
createdb -U postgres tfg_workspace
cp .env.example .env      # fill in DATABASE_URL, AUTH_SECRET, REALTIME_SECRET, CRON_SECRET
npm install
npm run db:migrate
npm run db:seed           # workspace "TFG Solutions", owner from SEED_OWNER_*, 3 categories + channels
```

Run both processes:

```bash
npm run dev
```

```bash
npm run realtime
```

Open http://localhost:3000 and sign in with the seeded owner. Without `SMTP_URL`, emails (invites, digest, sign-in and reset links) are printed to the server console, links included, instead of sent.

Run the tests:

```bash
npm test
```

List (or with `-- --yes`, delete) uploaded files nothing references any more:

```bash
npm run cleanup:uploads
```

Trigger the email digest by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest
```

## Onboarding the team

1. **Owner signs in** with the seeded account (the President) and sets a new password under **Account** (click your name in the top bar).
2. **Categories** (top bar): add any departments beyond E-book / Publishing / Cover Design. Each one gets its own chat channel automatically.
3. **Members → Invite**: invite the two Project Managers, the QA Lead and the four other Leads with role **leadership**, and everyone else as **member**. Each person gets an email with a 7-day link (the link is also shown on the page, to send by hand if mail isn't set up).
4. Leadership members **automatically follow every task**: they get an inbox notification for every new task, comment, status change, due-date change and completion, plus an email digest of anything unread after 15 minutes. They can mute a task but not unfollow it.
5. Optional: on **Categories**, add non-leadership **watchers** to a department (e.g. the cover designer on Cover Design) so they auto-follow those tasks too.
6. Team members can **Follow** any task by hand, and anyone @mentioned in a comment or in a to-do's notes starts following it.
7. **Locked out?** Anyone can use **Forgot password?** or **Email me a sign-in link** on the sign-in page. The owner can also create a one-time reset link from **People → ⋯** (handy if email isn't set up), or remove someone from the workspace there.

### Roles

| Role | Can |
| --- | --- |
| Owner | Everything, plus invites, roles, categories and watchers |
| Leadership | Everything a member can; auto-follows all tasks |
| Member | Create and edit tasks, comment, upload, chat |
