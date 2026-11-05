# Database guide (plain English)

The full SQL is in `supabase/migrations/20261105000001_initial_schema.sql`.
This page explains what is in it and why.

## 1. How to install it

1. Create a free project at https://supabase.com (pick region **Mumbai (ap-south-1)** — closest to India, fastest).
2. Open **SQL Editor → New query**.
3. Open the `.sql` file, copy everything, paste it, click **Run**.
4. You should see `Success. No rows returned`.
5. Check **Table Editor** — you'll see about 40 tables.

> Run it only once on a fresh project. To start over: **Database → Reset** (or create a new project).

## 2. The big picture

```
organizations (the owner's business)
 ├── outlets (each restaurant / café / cloud kitchen)
 │    ├── areas → dining_tables
 │    ├── kitchen_stations
 │    ├── orders → order_items → order_item_addons
 │    │      ├── order_tables (which tables the order sits on)
 │    │      ├── kots → kot_items        (what the kitchen sees)
 │    │      ├── payments
 │    │      └── order_events            (log: void, discount, reprint…)
 │    ├── outlet_item_overrides / outlet_variant_overrides (price & stock per outlet)
 │    ├── outlet_stock, stock_movements, purchases → purchase_items
 │    └── pos_devices, outlet_counters
 ├── staff_members → staff_outlets, staff_pins
 ├── tax_groups (GST 5%, GST 18%, No Tax)
 ├── menu_categories → menu_items → item_variants
 │                         └── item_addon_groups → addon_groups → addons
 ├── recipe_items (item → raw materials)
 ├── raw_materials, vendors
 ├── customers → loyalty_transactions
 └── audit_logs
```

**Menu is shared** across all outlets of one owner. Each outlet can override the
price, hide an item, or mark it out of stock.

## 3. Tables, one line each

| Area | Table | What it stores |
|---|---|---|
| Setup | `organizations` | The business; loyalty settings |
| | `outlets` | Name, address, GSTIN, FSSAI, logo, "prices include GST?", service charge, invoice code, receipt text, paper width (58/80 mm) |
| | `tax_groups` | GST slabs. CGST + SGST stored separately |
| Staff | `staff_members` | Everyone who works there + their role |
| | `staff_outlets` | Which outlets each person works at (owner = all) |
| | `staff_pins` | Hashed cashier PINs — **never** visible to the browser |
| | `pos_devices` | Registered counters/tablets allowed to use PIN login |
| Menu | `menu_categories`, `menu_items`, `item_variants` | Starters → Paneer Tikka → Half / Full |
| | `addon_groups`, `addons`, `item_addon_groups` | "Extra cheese +₹30" with min/max choices |
| | `outlet_item_overrides`, `outlet_variant_overrides` | Per-outlet price, listed, in-stock |
| | `kitchen_stations`, `outlet_category_stations` | Which kitchen printer gets which category |
| Floor | `areas`, `dining_tables` | Layout (x/y position) and live status: free / occupied / bill printed |
| Orders | `orders` | One bill. All money fields (subtotal, discount, service charge, CGST, SGST, round-off, total, paid, due) + GST invoice number |
| | `order_items` | Each line. Name & price **copied** at sale time |
| | `order_item_addons` | Add-ons chosen on a line |
| | `order_tables` | Table(s) for dine-in (2+ rows = merged tables) |
| | `kots`, `kot_items` | Kitchen tickets with status New → Preparing → Ready → Served |
| | `payments` | Cash / UPI / Card / Due / Loyalty; split payments = several rows |
| | `order_events` | Who voided, discounted, reprinted, transferred, and why |
| CRM | `customers`, `loyalty_transactions` | Phone (unique per business), visits, spend, points, credit due |
| Inventory | `raw_materials`, `vendors` | Paneer (kg), Milk (l)…; minimum stock level |
| | `outlet_stock` | Current quantity per outlet (auto-updated) |
| | `stock_movements` | Every in/out ever: opening, purchase, sale, wastage, adjustment |
| | `purchases`, `purchase_items` | Vendor bills |
| | `recipe_items` | 1 Paneer Butter Masala (Full) = 0.2 kg paneer + … |
| Audit | `audit_logs` | Old/new values for price, staff, tax, payment changes (owner only) |

Every main table has `created_at`, `updated_at`, `created_by`, `updated_by`, filled
automatically. The browser cannot fake `created_by`.

## 4. What happens automatically (triggers)

| When… | The database automatically… |
|---|---|
| any row is saved | fills audit fields |
| an order is seated on a table | marks the table **occupied** |
| a bill is printed (status → billed) | marks the table **bill printed** |
| a bill is settled | frees the table, deducts stock using recipes, adds visit/spend to the customer, gives loyalty points, works out the credit due |
| a settled bill is cancelled | puts stock back, reverses points & spend |
| a payment is added/removed | recalculates paid & due on the order and the customer's total due |
| a stock movement is added | updates `outlet_stock` |
| someone tries to demote/remove the owner | blocks it |

## 5. How the GST bill is calculated

`private.recalc_order(order_id)` does this for every active line, then adds them up:

```
discount share  = line total × (bill discount ÷ subtotal)
base            = line total − discount share
                  (if menu prices include GST: ÷ (1 + GST%))
service charge  = base × service-charge %
taxable value   = base + service charge
CGST / SGST     = taxable value × CGST% / SGST%
grand total     = taxable + CGST + SGST, rounded to the nearest rupee (round-off shown)
```

Tested example: 1 Half (₹180) + 2 Full (₹320) = ₹820 → 10% off (₹82) → service
charge 5% (₹36.90) → taxable ₹774.90 → CGST ₹19.37 + SGST ₹19.37 → round-off ₹0.36 →
**₹814.00**.

Invoice numbers look like `BH1/2627/000001` (outlet code / financial year / running
number) — unique, consecutive, ≤ 16 characters, restarting every April as GST rules
require.

## 6. Security (who sees what)

Row Level Security is **on for every table**. If no rule allows it, nothing is returned.

| Role | Can see | Can change directly |
|---|---|---|
| Owner | everything in their business, all outlets, audit log | everything (except other businesses) |
| Manager | their outlets: menu, tables, orders, payments, inventory, customers, order log | menu, tables, inventory, cashier/waiter/kitchen staff — **not** owners/managers |
| Cashier | menu, tables, orders, payments, customers, KOTs | customers' contact details |
| Waiter | menu, tables, orders, KOTs | nothing directly (uses secure functions) |
| Kitchen | menu, KOTs (no prices), raw materials & stock | nothing directly |

Extra protections:
- Orders, KOTs, payments are **read-only** from the browser. Billing actions
  (add item, discount, void, settle) go through secure functions added in Phase 3,
  which check the role first (e.g. only cashier+ can give a discount).
- Customer points/spend/due, table status and stock quantity can't be edited by
  the browser even on rows it can update (column-level permissions).
- PIN hashes and counters have no access at all from the browser.
- Restaurant A can never read or write restaurant B's data — tested.

## 7. Realtime & images

- Realtime is enabled for `orders`, `order_items`, `order_tables`, `kots`, `kot_items`,
  `dining_tables` and the stock-override tables, so the POS, waiter phones and
  kitchen screen update instantly. Realtime also respects the security rules above.
- A `media` storage bucket stores logos and item photos under `<org_id>/…`
  (PNG/JPEG/WebP, max 2 MB). Only owners/managers can upload.
