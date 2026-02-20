# Savera Deployment Guide

## Architecture
- **Frontend**: Next.js → Vercel
- **Backend**: Flask → Railway (free tier)

---

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 1.2 Deploy Backend
```bash
# Option A: Via Railway CLI
npm install -g @railway/cli
cd backend
railway login
railway init
railway up

# Option B: Via GitHub (recommended)
# 1. Go to railway.app/new
# 2. Click "Deploy from GitHub repo"
# 3. Select your Savera repo
# 4. Set Root Directory: backend
```

### 1.3 Set Environment Variables in Railway
Go to your Railway project → Variables → Add:

| Variable | Value |
|----------|-------|
| `GOOGLE_SOLAR_API_KEY` | Your Google API key |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` (update after Vercel deploy) |

### 1.4 Data Files (Automatic)
The app automatically downloads CA DG Stats data on first startup from:
`https://www.californiadgstats.ca.gov/download/interconnection_rule21_applications/`

If download fails, the app uses default pricing estimates.

### 1.5 Get Your Backend URL
After deployment, Railway gives you a URL like:
`https://savera-backend-production.up.railway.app`

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub

### 2.2 Deploy Frontend
```bash
# Option A: Via Vercel CLI
npm install -g vercel
cd frontend
vercel

# Option B: Via GitHub (recommended)
# 1. Go to vercel.com/new
# 2. Import your Savera repo
# 3. Set Root Directory: frontend
# 4. Click Deploy
```

### 2.3 Set Environment Variables in Vercel
Go to your Vercel project → Settings → Environment Variables → Add:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_BACKEND_URL` | `https://your-backend.railway.app` |

### 2.4 Redeploy
After adding env vars, redeploy:
```bash
vercel --prod
```

---

## Step 3: Update CORS

After getting your Vercel URL (e.g., `https://savera.vercel.app`):

1. Go to Railway → Your project → Variables
2. Update `ALLOWED_ORIGINS`:
   ```
   https://savera.vercel.app,https://your-custom-domain.com
   ```
3. Redeploy backend

---

## Security Checklist

- [x] `.env` is in `.gitignore`
- [x] No hardcoded API keys in code
- [x] CORS restricted to specific origins
- [x] Data files excluded from git
- [ ] Set environment variables in Railway (GOOGLE_SOLAR_API_KEY)
- [ ] Set environment variables in Vercel (NEXT_PUBLIC_BACKEND_URL)
- [ ] Update ALLOWED_ORIGINS after Vercel deploy

---

## Custom Domain (Optional)

### Vercel
1. Go to Project → Settings → Domains
2. Add your domain
3. Update DNS records as instructed

### Railway
1. Go to Project → Settings → Domains
2. Add custom domain
3. Update DNS records

---

## Costs

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel | 100GB bandwidth/mo | $20/mo |
| Railway | $5 free credit/mo | $5+/mo |
| Google Solar API | Limited free | Pay per request |

---

## Troubleshooting

### "API key not working"
- Verify `GOOGLE_SOLAR_API_KEY` is set in Railway
- Check Google Cloud Console that Solar API is enabled

### "CORS error"
- Update `ALLOWED_ORIGINS` in Railway to include your Vercel URL
- Redeploy backend after changing

### "Data not loading"
- Ensure CSV files are uploaded to Railway
- Check Railway logs for file path errors

### "502 Bad Gateway"
- Check Railway logs for Python errors
- Verify gunicorn is starting correctly
