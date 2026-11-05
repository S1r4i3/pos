-- =====================================================================
--  Phase 1 fix: let the owner read an outlet in the same statement that
--  creates it.
--
--  Why: adding an outlet returns the new row ("insert … returning id").
--  The old read rule looked the outlet up through private.my_outlet_ids(),
--  which can't see a row that is still being inserted, so Supabase
--  rejected the insert with "violates row-level security policy".
--  Owners can see every outlet of their business anyway, so we check the
--  business id directly for them.
--
--  HOW TO RUN: Supabase → SQL Editor → paste → Run (after the first file).
-- =====================================================================

drop policy if exists outlets_select on public.outlets;

create policy outlets_select on public.outlets for select to authenticated
  using (
    id in (select private.my_outlet_ids())
    or org_id in (select private.my_org_ids('{owner}'))
  );
