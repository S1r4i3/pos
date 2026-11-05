# Roadmap — phase by phase

Each phase ends with something you can **open and use**. We finish and test a phase,
and only then start the next. Every phase gives you complete code, any new SQL
migration, setup steps and a test checklist.

| # | Phase | Status |
|---|---|---|
| 0 | Database schema | ✅ Done |
| 1 | Project setup, Supabase connection, login, roles, outlet setup | ✅ Done |
| 2 | Menu management — categories, items, variants, add-ons, images, out-of-stock | ⏳ Next |
| 3 | POS billing — tables, order types, cart, discounts, GST, payments, bill printing | |
| 4 | KOT generation, kitchen printing, realtime Kitchen Display Screen | |
| 5 | Inventory — raw materials, purchases, vendors, recipes, auto stock deduction, low-stock alerts | |
| 6 | Reports dashboard — charts, filters, Excel/PDF export | |
| 7 | Customer CRM, loyalty points, staff management, PIN login | |

---

## Phase 1 — Foundation ✅
- Next.js 16 + TypeScript + Tailwind v4 project, installable as an app (PWA manifest + icons)
- Supabase connection: browser client, server client, admin client (server-only)
- `src/proxy.ts`: keeps users logged in and sends signed-out visitors to `/login`
- Sign up, log in, forgot/reset password, email-link callback, log out
- Onboarding: creates the business, first outlet, GST slabs and a "Main Hall" area
- Roles: sidebar and pages show only what each role may use; every page and
  action re-checks the role on the server; the database enforces it again (RLS)
- Outlet switcher (for owners/managers with several outlets)
- Settings → Outlet details (address, GSTIN with checksum and state check, FSSAI,
  logo upload, invoice code, GST-inclusive prices, optional service charge,
  business-day start, receipt header/footer, 58/80 mm paper)
- Settings → GST & taxes (owner): add/edit slabs, default slab, turn on/off
- Settings → Business & outlets (owner): business name, add outlets (with copied
  settings), turn outlets on/off
- Dashboard: today's sales cards (real queries) + setup checklist

## Phase 2 — Menu management
- Categories (reorder, colour), items (short code, veg/non-veg/egg, GST slab, photo,
  description), variants (Half/Full…), add-on groups with min/max rules
- Per-outlet price override, hide per outlet, **out-of-stock toggle** (cashier and
  kitchen too, through a secure database function)
- Import the menu from a CSV/Excel sheet
- Demo menu (`seed.sql`) for testing

## Phase 3 — POS billing
- Areas & tables with a floor layout, live colours (free / occupied / bill printed),
  merge & transfer tables
- Secure database functions for every billing action (open order, add items,
  quantity, notes, void with reason, discount flat/%, service charge on/off, split
  bill, settle, cancel, reprint) — each checks the role
- Touch POS screen: categories, big item buttons, search by name/short code, cart,
  Dine-in / Takeaway / Delivery; target **under 10 seconds** for a takeaway bill
- Payments: Cash (change due), UPI, Card, Due/Credit, split across modes
- GST invoice printing on 58/80 mm thermal printers (browser print, plus direct
  ESC/POS over USB/Serial in Chrome where available)

## Phase 4 — KOT & Kitchen Display
- KOT created automatically when items are sent; only new items on the next KOT;
  cancellation KOT for voided items; one KOT per kitchen station if configured
- KOT printing (large text, no prices)
- Dark-theme Kitchen Display Screen with realtime updates:
  New → Preparing → Ready → Served, late timers, new-order sound
- Waiter/captain phone screen to take orders at the table

## Phase 5 — Inventory
- Raw materials with units & minimum levels, vendors, opening stock
- Purchase entry → "Receive" adds stock and updates average cost
- Recipe mapping per item/variant; automatic deduction on settle (already in the
  database), reversal on cancel
- Wastage and stock-count adjustments; low-stock alerts on the dashboard

## Phase 6 — Reports
- Dashboard charts; reports by date range & outlet: sales by day/week/month,
  item-wise, category-wise, payment-mode, **GST report**, cancelled/void,
  staff-wise, discounts, day-end summary
- Export to Excel and PDF

## Phase 7 — Customers, loyalty, staff & PIN login
- Phone lookup on the bill, customer history, loyalty earn/redeem, credit (due) book
- Staff management: add staff, roles, outlets; logins created safely on the server
- Registered POS devices + 4-digit PIN login for cashiers/waiters/kitchen, lock after
  5 wrong tries, quick "switch user"

## Later (only if you want them)
Offline billing during internet drops · Swiggy/Zomato integration · QR table
ordering · WhatsApp bills · Tally export · Vercel production deploy checklist
(we can do this any time after Phase 3).

## Indian rules we follow
- **GST**: CGST + SGST split, SAC 996331 on bills, invoice number ≤ 16 characters,
  consecutive and unique per financial year (restarts every April).
- **Service charge**: optional and removable per bill (CCPA guidelines). GST applies
  to it when charged.
- **FSSAI** licence number printed on every bill.
