# CapRover deployment — TrizenDialog

## Important: env vars live in CapRover UI, not in `captain-definition`

`captain-definition` only points CapRover at the Dockerfile. **Do not put secrets or runtime config there** — CapRover reapplies that file on every git deploy and can overwrite values you set in the dashboard.

## First-time setup

1. Create the app in CapRover (HTTP port: backend **4010**, frontend **80**).
2. Open **App Configs → Environment Variables**.
3. Copy variables from `.env.example` and set real values in the CapRover UI.
4. Deploy once from git.

### Backend (required in production)

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | `4010` |
| `POSTGRES_URI` | Neon / Postgres connection string |
| `JWT_SECRET` | min 16 chars |
| `ENCRYPTION_KEY` | 64-char hex (AES-256-GCM) |
| `CORS_ORIGIN` | Exact frontend origin(s), comma-separated, no trailing slash |
| `REDIS_URL` | Optional but needed for queues |

`FRONTEND_URL` is an optional alias merged into the CORS allowlist.

### Frontend

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | `https://wa-dialog-backend.backend.extrahand.in/api/v1` |

Read at **container start** (entrypoint writes `runtime-config.js`). No image rebuild needed.

## Changing config after deploy (CORS, API URL, secrets)

1. CapRover → your app → **App Configs → Environment Variables**
2. Edit the value (e.g. add another origin: `https://a.com,https://b.com`)
3. Click **Save & Restart** (or Save then Restart)

**Do not** redeploy from git just to change env vars.

- **Restart** = new container, reads updated env → enough for CORS, `VITE_API_URL`, DB URLs, etc.
- **Rebuild / git deploy** = only when **code** or Dockerfile changed

## CORS checklist

Production console: [wa-dialog-frontend.backend.extrahand.in](https://wa-dialog-frontend.backend.extrahand.in)  
Use the **origin only** (no `/login` or other paths):

```env
CORS_ORIGIN=https://wa-dialog-frontend.backend.extrahand.in
```

Multiple origins (prod + local dev):

```env
CORS_ORIGIN=https://wa-dialog-frontend.backend.extrahand.in,http://localhost:5173
```

After saving, **restart the backend app**. Check logs for `corsOrigins: [...]` on startup.

## Migrations & seed (one-off)

Run against the target DB (set `POSTGRES_URI` in CapRover terminal / one-off command):

```bash
npx prisma migrate deploy
npm run seed:admin
```
