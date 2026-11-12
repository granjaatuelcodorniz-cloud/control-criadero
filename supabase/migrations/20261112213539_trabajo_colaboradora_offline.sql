create schema if not exists criadero_privado;
revoke all on schema criadero_privado from public, anon;
grant usage on schema criadero_privado to authenticated;

create table criadero_privado.trabajo_operaciones (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('tarea_nueva', 'tarea_estado', 'baja')),
  datos jsonb not null
);
alter table criadero_privado.trabajo_operaciones enable row level security;
revoke all on criadero_privado.trabajo_operaciones from public, anon, authenticated;
grant select, insert on criadero_privado.trabajo_operaciones to authenticated;
create policy leer_operaciones_propias on criadero_privado.trabajo_operaciones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy insertar_operaciones_propias on criadero_privado.trabajo_operaciones
  for insert to authenticated with check ((select auth.uid()) = user_id);

alter table public.tasks add column if not exists client_uuid uuid;
create unique index if not exists tasks_client_uuid_idx on public.tasks (client_uuid) where client_uuid is not null;

create function criadero_privado.iniciar_operacion(p_id uuid, p_user_id uuid, p_tipo text, p_datos jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or (select auth.uid()) is distinct from p_user_id then
    raise exception 'La carga pertenece a otra sesión' using errcode = '42501';
  end if;

  insert into criadero_privado.trabajo_operaciones (id, user_id, tipo, datos)
  values (p_id, p_user_id, p_tipo, p_datos) on conflict (id) do nothing;
  if found then return true; end if;

  if exists (select 1 from criadero_privado.trabajo_operaciones
    where id = p_id and user_id = p_user_id and tipo = p_tipo and datos = p_datos) then
    return false;
  end if;
  raise exception 'El identificador ya pertenece a otra carga' using errcode = '23505';
end;
$$;

create function public.agregar_tarea_propia(
  p_id uuid, p_user_id uuid, p_description text, p_date date, p_recorded_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if nullif(btrim(p_description), '') is null or p_date is null or p_recorded_at is null then
    raise exception 'La tarea necesita una descripción y una fecha' using errcode = '22023';
  end if;

  if not criadero_privado.iniciar_operacion(p_id, p_user_id, 'tarea_nueva',
    jsonb_build_array(btrim(p_description), p_date, p_recorded_at)) then return; end if;

  insert into public.tasks (client_uuid, description, type, is_active, created_by, assigned_to, created_at, next_execution)
  values (p_id, btrim(p_description), 'custom', true, p_user_id, p_user_id, p_recorded_at, p_date);
end;
$$;

create function public.guardar_estado_tarea(
  p_id uuid, p_user_id uuid, p_task_id bigint, p_task_uuid uuid, p_date date,
  p_completed boolean, p_recorded_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  v_completion public.task_completions%rowtype;
begin
  if (p_task_id is null) = (p_task_uuid is null) or p_date is null
    or p_completed is null or p_recorded_at is null then
    raise exception 'Revisá la tarea y la fecha' using errcode = '22023';
  end if;

  if not criadero_privado.iniciar_operacion(p_id, p_user_id, 'tarea_estado',
    jsonb_build_array(p_task_id, p_task_uuid, p_date, p_completed, p_recorded_at)) then return; end if;

  select * into v_task from public.tasks
    where (id = p_task_id or client_uuid = p_task_uuid)
      and (assigned_to is null or assigned_to = p_user_id)
    for update;
  if not found or (p_completed and v_task.is_active is not true) then
    raise exception 'La tarea ya no está disponible para esta cuenta' using errcode = 'P0001';
  end if;

  select * into v_completion from public.task_completions where task_id = v_task.id and date = p_date;
  if found and v_completion.user_id is distinct from p_user_id then
    raise exception 'Otra cuenta ya marcó esta tarea para esa fecha' using errcode = 'P0001';
  end if;

  if p_completed then
    if v_completion.id is not null and v_completion.completed is not true then
      delete from public.task_completions where id = v_completion.id and user_id = p_user_id;
    end if;

    insert into public.task_completions (task_id, user_id, date, completed, confirmed_at, notes)
    values (v_task.id, p_user_id, p_date, true, p_recorded_at, v_completion.notes)
    on conflict (task_id, date) do nothing;
    if not exists (select 1 from public.task_completions
      where task_id = v_task.id and date = p_date and user_id = p_user_id and completed is true) then
      raise exception 'Otra cuenta ya marcó esta tarea para esa fecha' using errcode = 'P0001';
    end if;

    if v_task.type = 'periodic' and v_task.frequency_days > 0
      and (v_task.next_execution is null or v_task.next_execution <= p_date) then
      update public.tasks set next_execution = p_date + v_task.frequency_days, is_urgent = false
        where id = v_task.id;
    end if;
  else
    delete from public.task_completions where task_id = v_task.id and date = p_date and user_id = p_user_id;
    if found and v_task.type = 'periodic' and v_task.frequency_days > 0
      and v_task.next_execution = p_date + v_task.frequency_days
      and not exists (select 1 from public.task_completions
        where task_id = v_task.id and date > p_date and completed is true) then
      update public.tasks set next_execution = p_date where id = v_task.id;
    end if;
  end if;
end;
$$;

-- El permiso para actualizar lotes sigue limitado. Esta operación permite
-- descontar una baja validada en una boca concreta y guarda las tres filas juntas.
create function criadero_privado.registrar_baja_boca(
  p_id uuid, p_user_id uuid, p_lot_id bigint, p_slot_id bigint, p_slot_code text,
  p_date date, p_quantity integer, p_reason text, p_loss_type text, p_recorded_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_lot public.lots%rowtype;
  v_slot public.cage_slots%rowtype;
begin
  if p_user_id is null or (select auth.uid()) is distinct from p_user_id
    or not exists (select 1 from public.profiles where id = p_user_id and role in ('owner', 'collaborator')) then
    raise exception 'La cuenta no puede registrar bajas' using errcode = '42501';
  end if;

  if p_lot_id is null or p_slot_id is null or nullif(btrim(p_slot_code), '') is null
    or p_date is null or p_recorded_at is null or p_quantity is null or p_quantity < 1
    or p_loss_type is null or p_loss_type not in ('muerte', 'descarte', 'venta') then
    raise exception 'Revisá los datos de la baja' using errcode = '22023';
  end if;

  if not criadero_privado.iniciar_operacion(p_id, p_user_id, 'baja',
    jsonb_build_array(p_lot_id, p_slot_id, p_slot_code, p_date, p_quantity, p_reason, p_loss_type, p_recorded_at)) then return; end if;

  select * into v_lot from public.lots where id = p_lot_id and status <> 'cerrado' for update;
  if not found then raise exception 'El lote ya no está disponible' using errcode = 'P0001'; end if;

  select * into v_slot from public.cage_slots where id = p_slot_id and lot_id = p_lot_id and slot_code = p_slot_code for update;
  if not found then raise exception 'La boca cambió desde la última actualización' using errcode = 'P0001'; end if;
  if p_quantity > v_slot.quantity or p_quantity > v_lot.current_quantity then
    raise exception 'La cantidad supera las aves disponibles en la boca o en el lote' using errcode = 'P0001';
  end if;

  insert into public.lot_losses (lot_id, date, quantity, reason, user_id, created_at, slot_code, loss_type)
  values (p_lot_id, p_date, p_quantity, nullif(btrim(p_reason), ''), p_user_id, p_recorded_at, p_slot_code, p_loss_type);

  update public.lots set current_quantity = current_quantity - p_quantity where id = p_lot_id;
  if p_quantity = v_slot.quantity then
    delete from public.cage_slots where id = p_slot_id;
  else
    update public.cage_slots set quantity = quantity - p_quantity where id = p_slot_id;
  end if;
end;
$$;

create function public.registrar_baja_boca(
  p_id uuid, p_user_id uuid, p_lot_id bigint, p_slot_id bigint, p_slot_code text,
  p_date date, p_quantity integer, p_reason text, p_loss_type text, p_recorded_at timestamptz
) returns void language sql security invoker set search_path = '' as $$
  select criadero_privado.registrar_baja_boca(p_id, p_user_id, p_lot_id, p_slot_id, p_slot_code,
    p_date, p_quantity, p_reason, p_loss_type, p_recorded_at);
$$;

create function public.cargar_trabajo_colaboradora(p_date date, p_pending uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  with cuenta as (select auth.uid() as id),
  tareas as (
    select t.id, t.client_uuid, t.description, t.type, t.frequency_days, t.next_execution, t.is_urgent
    from public.tasks t cross join cuenta c
    where t.is_active and (t.assigned_to is null or t.assigned_to = c.id)
  ),
  lotes as (
    select l.id, l.code, l.start_date, l.initial_quantity, l.current_quantity, l.status
    from public.lots l where l.status = 'activo'
  ),
  bocas as (select s.id, s.lot_id, s.slot_code, s.quantity from public.cage_slots s)
  select jsonb_build_object(
    'userId', c.id,
    'capturedAt', statement_timestamp(),
    'tasks', coalesce((select jsonb_agg(t order by t.type, t.id) from tareas t), '[]'::jsonb),
    'completions', coalesce((select jsonb_agg(jsonb_build_object('task_id', tc.task_id, 'date', tc.date))
      from public.task_completions tc join tareas t on t.id = tc.task_id
      where tc.user_id = c.id and tc.completed is true and (tc.date >= p_date or t.type = 'custom')), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(l order by l.start_date desc, l.id desc) from lotes l), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(s order by s.id) from bocas s), '[]'::jsonb),
    'applied', coalesce((select jsonb_agg(o.id) from criadero_privado.trabajo_operaciones o
      where o.user_id = c.id and o.id = any(p_pending)), '[]'::jsonb)
  ) from cuenta c where c.id is not null and p_date is not null;
$$;

revoke execute on function
  criadero_privado.iniciar_operacion(uuid, uuid, text, jsonb),
  criadero_privado.registrar_baja_boca(uuid, uuid, bigint, bigint, text, date, integer, text, text, timestamptz),
  public.registrar_baja_boca(uuid, uuid, bigint, bigint, text, date, integer, text, text, timestamptz),
  public.agregar_tarea_propia(uuid, uuid, text, date, timestamptz),
  public.guardar_estado_tarea(uuid, uuid, bigint, uuid, date, boolean, timestamptz),
  public.cargar_trabajo_colaboradora(date, uuid[])
  from public, anon;

grant execute on function
  criadero_privado.iniciar_operacion(uuid, uuid, text, jsonb),
  criadero_privado.registrar_baja_boca(uuid, uuid, bigint, bigint, text, date, integer, text, text, timestamptz),
  public.registrar_baja_boca(uuid, uuid, bigint, bigint, text, date, integer, text, text, timestamptz),
  public.agregar_tarea_propia(uuid, uuid, text, date, timestamptz),
  public.guardar_estado_tarea(uuid, uuid, bigint, uuid, date, boolean, timestamptz),
  public.cargar_trabajo_colaboradora(date, uuid[])
  to authenticated;
