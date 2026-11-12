alter table public.fertile_batches
  add column if not exists daily_record_id bigint references public.daily_records(id) on delete set null;

create index if not exists fertile_batches_daily_record_idx
  on public.fertile_batches (daily_record_id) where daily_record_id is not null;

create or replace function public.registrar_recoleccion(
  p_client_uuid uuid,
  p_user_id uuid,
  p_date date,
  p_bandejas_consumo integer,
  p_bandejas_fertiles integer,
  p_notas text,
  p_registered_at time with time zone
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record_id bigint;
  v_existing public.daily_records%rowtype;
begin
  if p_user_id is null or (select auth.uid()) is distinct from p_user_id then
    raise exception 'La recolección pertenece a otra sesión' using errcode = '42501';
  end if;

  if p_client_uuid is null or p_date is null
    or p_bandejas_consumo is null or p_bandejas_fertiles is null
    or p_bandejas_consumo < 0 or p_bandejas_fertiles < 0
    or (p_bandejas_consumo = 0 and p_bandejas_fertiles = 0) then
    raise exception 'La recolección debe tener al menos una bandeja y una fecha' using errcode = '22023';
  end if;

  insert into public.daily_records (
    client_uuid, user_id, date, bandejas_consumo, bandejas_fertiles,
    docenas_armadas, huevos_rotos, notas, registered_at
  ) values (
    p_client_uuid, p_user_id, p_date, p_bandejas_consumo, p_bandejas_fertiles,
    0, 0, p_notas, p_registered_at
  ) on conflict (client_uuid) do nothing returning id into v_record_id;

  if v_record_id is null then
    select * into v_existing from public.daily_records
      where client_uuid = p_client_uuid and user_id = p_user_id;

    if not found or v_existing.date is distinct from p_date
      or v_existing.bandejas_consumo is distinct from p_bandejas_consumo
      or v_existing.bandejas_fertiles is distinct from p_bandejas_fertiles
      or v_existing.notas is distinct from p_notas then
      raise exception 'La recolección guardada difiere del registro pendiente' using errcode = '23505';
    end if;

    if p_bandejas_fertiles > 0 and (
      select count(*) from public.fertile_batches where daily_record_id = v_existing.id
    ) <> p_bandejas_fertiles then
      raise exception 'Revisá las bandejas fértiles de esta recolección anterior' using errcode = 'P0001';
    end if;
    return;
  end if;

  insert into public.fertile_batches (date, user_id, status, daily_record_id)
  select p_date, p_user_id, 'pendiente', v_record_id
  from pg_catalog.generate_series(1, p_bandejas_fertiles);
end;
$$;

revoke execute on function public.registrar_recoleccion(uuid, uuid, date, integer, integer, text, time with time zone)
  from public, anon;
grant execute on function public.registrar_recoleccion(uuid, uuid, date, integer, integer, text, time with time zone)
  to authenticated;

alter table public.fertile_records
  add column if not exists fertile_batch_id bigint references public.fertile_batches(id) on delete set null;

create unique index if not exists fertile_records_batch_idx
  on public.fertile_records (fertile_batch_id) where fertile_batch_id is not null;

create or replace function public.procesar_bandeja_fertil(
  p_batch_id bigint,
  p_user_id uuid,
  p_docenas integer,
  p_descarte integer,
  p_processed_at date,
  p_registered_at time without time zone
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_date date;
begin
  if p_user_id is null or (select auth.uid()) is distinct from p_user_id
    or (select role from public.profiles where id = p_user_id) is distinct from 'owner' then
    raise exception 'Se necesita una sesión de administración' using errcode = '42501';
  end if;
  if p_docenas is null or p_descarte is null or p_docenas < 0 or p_descarte < 0
    or p_processed_at is null then
    raise exception 'Revisá los valores del procesamiento' using errcode = '22023';
  end if;

  update public.fertile_batches
    set status = 'procesada', docenas_seleccionadas = p_docenas, descarte = p_descarte,
        processed_at = p_processed_at, processed_by = p_user_id
    where id = p_batch_id and status = 'pendiente'
    returning date into v_date;

  if not found then
    if exists (select 1 from public.fertile_records where fertile_batch_id = p_batch_id
      and user_id = p_user_id and docenas_seleccionadas = p_docenas and descarte = p_descarte) then
      return;
    end if;
    raise exception 'La bandeja ya fue procesada o no está disponible' using errcode = 'P0001';
  end if;

  insert into public.fertile_records (
    date, user_id, bandejas_procesadas, docenas_seleccionadas, descarte, registered_at, fertile_batch_id
  ) values (v_date, p_user_id, 1, p_docenas, p_descarte, p_registered_at, p_batch_id);
end;
$$;

revoke execute on function public.procesar_bandeja_fertil(bigint, uuid, integer, integer, date, time without time zone)
  from public, anon;
grant execute on function public.procesar_bandeja_fertil(bigint, uuid, integer, integer, date, time without time zone)
  to authenticated;
