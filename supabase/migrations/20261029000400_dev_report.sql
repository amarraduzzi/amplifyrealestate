-- Amplify Vastgoed, etappe 10d: rapportage voor de promoteur
--
-- De rapportage zelf rekent in de desk met wat er al is (lots, verkopen, termijnen, leads). Deze stap voegt alleen
-- de verkoper aan een verkoop toe, zodat de directie de resultaten per medewerker ziet:
--  * dev_sales.seller_user_id: standaard wie de verkoop maakt; eigenaar of manager kan het wijzigen.
--  * De verkoper moet lid van het kantoor zijn.

alter table public.dev_sales add column seller_user_id uuid references auth.users(id) on delete set null default auth.uid();
update public.dev_sales set seller_user_id = created_by where seller_user_id is null;
create index dev_sales_seller_idx on public.dev_sales (org_id, seller_user_id);

create function public.dev_sales_seller()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_user_id is not null and not exists (select 1 from public.memberships where org_id = new.org_id and user_id = new.seller_user_id) then
    raise exception 'seller_not_member' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.seller_user_id is distinct from old.seller_user_id and not public.can_manage(new.org_id) then
    raise exception 'seller_manager_only' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger dev_sales_seller before insert or update of seller_user_id on public.dev_sales for each row execute function public.dev_sales_seller();
grant update (seller_user_id) on public.dev_sales to authenticated;
revoke all on function public.dev_sales_seller() from public, anon, authenticated;
