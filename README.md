# RestoPOS

Restaurant billing & management (like Petpooja) for restaurants, cafés and cloud
kitchens in India.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres,
Auth, Realtime, Storage) · Vercel · PWA

| Guide | What's in it |
|---|---|
| `docs/DATABASE.md` | The database explained simply |
| `docs/FOLDER_STRUCTURE.md` | Where everything lives |
| `docs/ROADMAP.md` | The 7 build phases and their status |

---

## Phase 1 setup (one time, about 15 minutes)

### 1. Install Node.js
Download the **LTS** version from https://nodejs.org and install it (keep the default options).
Check it worked: open **PowerShell** and type `node -v`. You should see `v20…` or newer.

### 2. Prepare Supabase
In your Supabase project (https://supabase.com/dashboard):

1. **SQL Editor → New query**: paste and **Run** each file in `supabase/migrations/`,
   **in order**:
   - `20261105000001_initial_schema.sql` (skip this one if you already ran it)
   - `20261105000002_phase1_fixes.sql`
2. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs → Add: `http://localhost:3000/**`
3. *(Optional, makes testing quicker)* **Authentication → Sign In / Providers → Email**:
   turn **off** "Confirm email". New sign-ups are then logged in straight away.
   Turn it back on before going live.
4. **Project Settings → API Keys**: copy the **Project URL** and the **publishable key**
   (or the legacy `anon` key).

### 3. Connect the app to Supabase
In this folder, make a copy of `.env.example` and name it `.env.local`. Open it in
Notepad and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Leave `SUPABASE_SECRET_KEY` empty for now (it's needed in Phase 7). Never share
`.env.local` with anyone. It's already excluded from git.

### 4. Install and run
In PowerShell:

```powershell
cd $HOME\Desktop\pos
npm install
npm run dev
```

Open **http://localhost:3000** in Chrome. Keep the PowerShell window open while
you use the app. Press `Ctrl + C` in it to stop.

---

## Test Phase 1 (checklist)

1. You land on **Log in**. Click **Create an account**, then sign up.
2. Fill in **Set up your restaurant**. Try a wrong GSTIN first: you should get a
   clear error, and what you typed stays in the form.
3. The **Dashboard** shows ₹0.00 sales and a "Getting started" checklist.
4. **Settings → Outlet details**: add an address, upload a logo, tick
   "prices include GST", turn on a 5% service charge, and save. Reload the page:
   everything is kept.
5. **Settings → GST & taxes**: add a slab (e.g. 40%), and make 5% or 18% the default.
6. **Settings → Business & outlets**: add a second outlet. Reusing the same invoice
   code is refused. Switch outlets from the sidebar.
7. Log out, then log in with a wrong password (you see an error), then the right one.
8. Open the app on your phone (same Wi-Fi: `http://<your-PC-IP>:3000`). The menu
   opens with ☰. In Chrome you can also choose **Install app**.
9. **Privacy check:** sign up a second account in a private (incognito) window.
   It must **not** see your first restaurant.

**Testing other roles now** (before Phase 7 adds a staff screen): sign up another
email, then in Supabase **SQL Editor** run the query below. Replace both emails
with real ones; for `role`, use one of `manager`, `cashier`, `waiter` or `kitchen`.

```sql
insert into staff_members (org_id, user_id, full_name, role)
select s.org_id, u.id, 'Test Cashier', 'cashier'
from auth.users u, staff_members s
join auth.users owner on owner.id = s.user_id
where u.email = 'cashier@example.com' and owner.email = 'YOUR-OWNER-EMAIL' and s.role = 'owner';

insert into staff_outlets (staff_id, outlet_id, org_id)
select sm.id, o.id, o.org_id from staff_members sm
join outlets o on o.org_id = sm.org_id
where sm.full_name = 'Test Cashier';
```

Log in as that user. A cashier sees Dashboard, Billing, Tables and Customers;
opening `/settings` shows "Your role doesn't have access". A kitchen user sees only
Dashboard and Kitchen.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run on your computer for development (auto-reloads) |
| `npm run build` | Check that everything compiles for production |
| `npm run start` | Run the production build |
| `npm run lint` | Check code style |

## Common problems

| You see | Fix |
|---|---|
| "Supabase is not configured" | `.env.local` is missing or misnamed. Fill it in and restart `npm run dev` |
| "violates row-level security policy" when adding an outlet | Run `20261105000002_phase1_fixes.sql` |
| Sign-up says "check your email" but no email | Supabase's free email limit is low. Turn off "Confirm email" while testing (step 2.3) |
| Email link opens an error page | Add `http://localhost:3000/**` to Redirect URLs (step 2.2) |
| Logo upload fails | Make sure the first SQL file ran fully (it creates the `media` storage bucket) |
