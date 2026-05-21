# kasdanshowtime.com on Vercel

Canonical production URL: **https://kasdanshowtime.com**

This repo includes `vercel.json` redirects:

- `www.kasdanshowtime.com` → `https://kasdanshowtime.com` (301)
- `showtime-7s49.vercel.app` → `https://kasdanshowtime.com` (301)

## One-time Vercel dashboard setup

1. [Vercel](https://vercel.com) → **Showtime** project → **Settings → Domains**
2. Add **`kasdanshowtime.com`** and **`www.kasdanshowtime.com`**
3. At your domain registrar, set DNS exactly as Vercel shows (typically):
   - **A** `@` → `76.76.21.21`
   - **CNAME** `www` → `cname.vercel-dns.com`
4. Wait until Vercel shows **Valid** + **SSL issued** (fixes `NET::ERR_CERT_COMMON_NAME_INVALID`)

## Required environment variable (Production)

In **Settings → Environment Variables**, set for **Production** (and Preview if you use it):

```env
NEXT_PUBLIC_JOIN_ORIGIN=https://kasdanshowtime.com
```

No trailing slash. **Redeploy** after saving.

Also ensure (if not already set):

```env
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
```

## Verify

- https://kasdanshowtime.com/show — show night hub
- https://www.kasdanshowtime.com/show — should redirect to apex
- `/host` join link / QR should use `kasdanshowtime.com` after redeploy

## CLI (optional)

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_JOIN_ORIGIN production
# paste: https://kasdanshowtime.com
npx vercel --prod
```
