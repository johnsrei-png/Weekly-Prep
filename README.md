# The Weekly Table 🍽️

A weekly meal planner: AI-generated recipes, adjustable serving sizes, a pantry
tracker with low-stock alerts, and a grocery list that subtracts what you already
have. React + Vite front end, one Netlify serverless function proxying the
Anthropic API, and Supabase for cross-device sync.

## What each piece does
- **Meal Plan** — generate a fresh week of AI recipes, or shuffle saved ones. Adjust servings per day; ingredient amounts scale automatically.
- **Grocery List** — every ingredient across the week, combined, minus your pantry (with oz/lb/cup unit conversion), grouped by store aisle, checkable, exportable.
- **Pantry** — track amounts by unit (oz, lb, cup, etc.), set a "low at" threshold, and get a running-low banner.

---

## Setup (one time)

### 1. Supabase
1. In your existing Supabase project (or a new one), open **SQL Editor** and run the contents of `supabase-setup.sql`.
2. Go to **Project Settings > API** and copy the **Project URL** and the **anon public** key.

### 2. Get an Anthropic API key
From console.anthropic.com > API Keys. This stays server-side — it never ships to the browser.

### 3. Local dev (optional)
```bash
cp .env.example .env      # fill in the three values
npm install
npm run dev               # front end only
# For the function locally, use: npx netlify dev
```

---

## Deploy to Netlify

**Option A — drag & drop won't work here** (the serverless function needs a build), so use Git:

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site > Import an existing project** > pick the repo.
3. Build settings are auto-detected from `netlify.toml` (build `npm run build`, publish `dist`, functions `netlify/functions`).
4. Before the first deploy, add **Environment variables** (Site settings > Environment variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
5. Deploy. Done.

**Option B — Netlify CLI:**
```bash
npm install -g netlify-cli
netlify init          # link to a new/existing site
netlify env:set VITE_SUPABASE_URL "https://xxx.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"
netlify env:set ANTHROPIC_API_KEY "sk-ant-..."
netlify deploy --build --prod
```

---

## Notes
- If Supabase env vars are absent, the app silently falls back to `localStorage` so it still runs.
- Data is keyed by a random device id in the browser — no login. To sync a phone and laptop to the same data, or to lock it down, add Supabase Auth and key rows by `user_id` instead (happy to wire that up).
- The AI function uses `claude-sonnet-4-6`. Each "Generate" call costs a small amount of API usage.
