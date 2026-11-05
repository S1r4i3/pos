# Folder structure

The project is one Next.js app (App Router, TypeScript, Tailwind CSS v4) plus a
`supabase/` folder for database files. Folders marked *(Phase N)* are created in that
phase — you don't need to make them now.

```
pos/
├── README.md
├── .env.example                  # list of settings (copied to .env.local, never committed)
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs            # Tailwind v4 needs only this + globals.css
│
├── docs/                         # these guides
│   ├── DATABASE.md
│   ├── FOLDER_STRUCTURE.md
│   └── ROADMAP.md
│
├── supabase/
│   ├── migrations/               # database changes, run in order (one file per phase)
│   │   ├── 20261105000001_initial_schema.sql   ← done
│   │   ├── 20261105000002_phase1_fixes.sql     ← done
│   │   ├── …_phase2_menu.sql                   (Phase 2)
│   │   ├── …_phase3_billing.sql                (Phase 3: secure billing functions)
│   │   ├── …_phase4_kot.sql                    (Phase 4)
│   │   └── …                                   (later phases)
│   ├── seed.sql                  # demo menu, tables for testing  (Phase 2)
│   └── tests/                    # SQL checks for security & GST maths
│
├── public/
│   ├── icons/                    # PWA icons 192/512 px
│   └── sounds/new-order.mp3      # kitchen alert (Phase 4)
│
└── src/
    ├── proxy.ts                  # runs before every page: refreshes login, blocks
    │                             #   signed-out users (Next.js 16 name for "middleware")
    │
    ├── app/                      # every folder here = a URL
    │   ├── layout.tsx            # root HTML, fonts, PWA meta
    │   ├── globals.css           # Tailwind + theme colours
    │   ├── manifest.ts           # PWA manifest (installable app)
    │   ├── sw.ts                 # service worker (offline shell)          (later)
    │   │
    │   ├── (auth)/               # pages without the sidebar
    │   │   ├── login/page.tsx            # owner/manager email login
    │   │   ├── signup/page.tsx
    │   │   └── pin/page.tsx              # cashier PIN pad            (Phase 7)
    │   ├── onboarding/page.tsx           # first-time restaurant setup
    │   │
    │   ├── (app)/                # pages with sidebar + outlet switcher
    │   │   ├── layout.tsx                # loads user, role, current outlet
    │   │   ├── dashboard/page.tsx        # today's sales + setup checklist ✅
    │   │   ├── pos/                      # billing screen             (Phase 3)
    │   │   │   ├── page.tsx              #   new order (takeaway/delivery)
    │   │   │   └── [orderId]/page.tsx    #   open order (dine-in table)
    │   │   ├── tables/page.tsx           # live floor plan            (Phase 3)
    │   │   ├── captain/page.tsx          # waiter phone ordering      (Phase 4)
    │   │   ├── kds/page.tsx              # kitchen display            (Phase 4)
    │   │   ├── orders/page.tsx           # order history, reprint, cancel
    │   │   ├── menu/                     # categories, items, variants, add-ons (Phase 2)
    │   │   ├── customers/                # CRM, dues, loyalty         (Phase 7)
    │   │   ├── inventory/                # materials, stock, purchases, vendors,
    │   │   │                             #   recipes, wastage         (Phase 5)
    │   │   ├── reports/                  # all reports + export       (Phase 6)
    │   │   ├── staff/                    # staff & roles              (Phase 7)
    │   │   └── settings/                 # outlet ✅, taxes ✅, outlets ✅ (printers, devices later)
    │   │
    │   ├── print/                # bare pages sized for 58/80 mm paper
    │   │   ├── bill/[orderId]/page.tsx   (Phase 3)
    │   │   └── kot/[kotId]/page.tsx      (Phase 4)
    │   │
    │   └── api/                  # server-only endpoints
    │       ├── auth/pin/route.ts         # PIN login               (Phase 7)
    │       └── reports/export/route.ts   # Excel/PDF download     (Phase 6)
    │
    ├── components/
    │   ├── ui/                   # Button, Input, Dialog, Sheet, Badge, Toast… (reused everywhere)
    │   ├── layout/               # Sidebar, TopBar, OutletSwitcher, RoleGate
    │   ├── pos/                  # MenuGrid, ItemSearch, Cart, PaymentDialog, DiscountDialog
    │   ├── tables/               # FloorPlan, TableCard
    │   ├── kds/                  # KotCard, KdsColumn
    │   ├── menu/  inventory/  reports/  customers/  staff/
    │
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts         # browser client (public anon key only)
    │   │   ├── server.ts         # server client that reads the login cookie
    │   │   ├── admin.ts          # SERVICE-ROLE client — server only, never imported in UI
    │   │   └── proxy.ts          # session refresh helper used by src/proxy.ts
    │   ├── auth/
    │   │   ├── roles.ts          # role list + what each role may open
    │   │   └── session.ts        # getCurrentStaff(), requireRole()
    │   ├── money.ts              # ₹1,23,456.00 formatting (Indian grouping)
    │   ├── gst.ts                # instant on-screen bill preview (DB stays the source of truth)
    │   ├── dates.ts              # IST helpers, business day
    │   ├── print/
    │   │   ├── receipt.ts        # builds bill/KOT text layout
    │   │   ├── escpos.ts         # ESC/POS byte commands          (Phase 3)
    │   │   └── printer.ts        # browser print / WebUSB / Web Serial
    │   ├── validations/          # zod schemas for every form
    │   └── utils.ts
    │
    ├── hooks/                    # use-form-action.ts ✅, realtime hooks later
    ├── stores/                   # cart state for the POS (Phase 3)
    │   (Server Actions live next to their page as actions.ts, e.g. app/(app)/settings/outlet/actions.ts)
    └── types/
        └── db.ts                 # row shapes used by the app ✅
```

## Why it is organised this way

- **`app/` = screens, `components/` = pieces, `lib/` = logic.** When something
  breaks on the POS screen you look in `app/(app)/pos` and `components/pos`.
- **Two Supabase clients for users, one for the server.** `client.ts`/`server.ts`
  act *as the logged-in user*, so database security rules apply. `admin.ts` uses
  the secret service-role key and is only for things like creating staff logins.
  It lives in server-only code so it can never reach the browser.
- **Money is calculated in the database.** `lib/gst.ts` only shows an instant
  preview while tapping items; the saved bill always comes from `private.recalc_order`.
- **`print/` pages** are plain pages with no sidebar, sized to the paper width, so
  any thermal printer installed on Windows/Android can print them.
