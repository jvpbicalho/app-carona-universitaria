-- EP03 — Cancelar ou editar rota.
--
-- Cancelar é soft delete: a linha continua, com status 'cancelada', motivo e
-- instante. Nunca DELETE — a rota é histórico do motorista e dos passageiros,
-- e o aviso de cancelamento (que sobrevive à rota) aponta para ela.

alter table public.routes
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at        timestamptz;

comment on column public.routes.cancellation_reason is
  'Obrigatório ao cancelar: vai no aviso ao passageiro (wireframe 3.5 e 6.1).';
comment on column public.routes.cancelled_at is
  'Preenchido pelo trigger no momento do cancelamento; o valor do client é ignorado.';

-- Duas constraints, e não uma: com `(cancelada) = (motivo e instante)`, gravar
-- só o motivo numa rota publicada passaria (false = false).
alter table public.routes drop constraint if exists routes_cancellation_reason_consistency;
alter table public.routes add constraint routes_cancellation_reason_consistency
  check ((status = 'cancelada') = (cancellation_reason is not null));

alter table public.routes drop constraint if exists routes_cancelled_at_consistency;
alter table public.routes add constraint routes_cancelled_at_consistency
  check ((status = 'cancelada') = (cancelled_at is not null));

alter table public.routes drop constraint if exists routes_cancellation_reason_length;
alter table public.routes add constraint routes_cancellation_reason_length
  check (cancellation_reason is null or length(trim(cancellation_reason)) between 3 and 200);

-- ---------------------------------------------------------------------------
-- validate_route, reescrita.
--
-- A versão do Sprint 2 revalidava capacidade do veículo e perfil completo em
-- TODO update. Com cancelamento, isso vira armadilha: o motorista que reduziu
-- as vagas do carro, ou trocou a foto e ficou com o perfil incompleto, não
-- conseguiria cancelar uma carona — e cancelar precisa ser sempre possível.
-- Agora cada regra roda só quando o que ela protege muda.
--
-- `current_user = 'authenticated'` identifica escrita direta do app via
-- PostgREST. Funções SECURITY DEFINER (as do EP05, por exemplo) rodam como o
-- dono e passam — é assim que o EP05 vai poder mexer em seats_taken sem o
-- motorista poder fazer o mesmo pela API.
-- ---------------------------------------------------------------------------
create or replace function public.validate_route()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_vehicle_seats integer;
  v_vehicle_owner uuid;
  v_is_complete   boolean;
  v_from_app      boolean := current_user = 'authenticated';
  v_editing       boolean := false;
  v_cancelling    boolean := false;
begin
  if tg_op = 'INSERT' then
    if v_from_app and (new.status <> 'publicada' or new.seats_taken <> 0) then
      raise exception 'Uma carona nova começa publicada e sem vagas ocupadas.'
        using errcode = 'check_violation', hint = 'invalid_initial_state';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Cancelada e concluída são estados terminais.
    if old.status <> 'publicada' then
      raise exception 'Esta carona está % e não pode mais ser alterada.', old.status
        using errcode = 'check_violation', hint = 'route_not_editable';
    end if;

    if new.driver_id is distinct from old.driver_id then
      raise exception 'O motorista de uma carona não pode ser trocado.'
        using errcode = 'check_violation', hint = 'driver_immutable';
    end if;

    v_editing :=
         new.origin_label          is distinct from old.origin_label
      or new.origin_latitude       is distinct from old.origin_latitude
      or new.origin_longitude      is distinct from old.origin_longitude
      or new.destination_label     is distinct from old.destination_label
      or new.destination_latitude  is distinct from old.destination_latitude
      or new.destination_longitude is distinct from old.destination_longitude
      or new.departure_at          is distinct from old.departure_at;

    v_cancelling := new.status = 'cancelada';

    if v_from_app then
      -- Pelo app, a única transição de status permitida é cancelar.
      if new.status not in ('publicada', 'cancelada') then
        raise exception 'Transição de status não permitida.'
          using errcode = 'check_violation', hint = 'status_transition_forbidden';
      end if;
      -- Vagas ocupadas são do EP05 (aceite de solicitação), não do motorista.
      if new.seats_taken is distinct from old.seats_taken then
        raise exception 'Vagas ocupadas são atualizadas pela confirmação de vaga.'
          using errcode = 'check_violation', hint = 'seats_taken_managed';
      end if;
    end if;

    -- Cancelar e editar na mesma operação deixaria ambíguo o aviso ao
    -- passageiro ("cancelada" ou "alterada"?).
    if v_cancelling and v_editing then
      raise exception 'Cancele ou edite a carona, não os dois ao mesmo tempo.'
        using errcode = 'check_violation', hint = 'cancel_with_changes';
    end if;

    if (v_editing or v_cancelling) and old.departure_at <= now() then
      raise exception 'Esta carona já partiu e não pode mais ser alterada.'
        using errcode = 'check_violation', hint = 'route_already_departed';
    end if;

    if v_cancelling then
      new.cancelled_at := now();
    end if;
  end if;

  -- Mesma regra do cadastro, reaproveitada na edição: só quando o horário muda.
  if tg_op = 'INSERT' or new.departure_at is distinct from old.departure_at then
    if new.departure_at <= now() - interval '1 minute' then
      raise exception 'A partida não pode ser no passado.'
        using errcode = 'check_violation', hint = 'departure_in_past';
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.vehicle_id  is distinct from old.vehicle_id
     or new.seats_total is distinct from old.seats_total then
    select v.seats, v.owner_id into v_vehicle_seats, v_vehicle_owner
    from public.vehicles v where v.id = new.vehicle_id;

    if v_vehicle_seats is null then
      raise exception 'Veículo não encontrado.'
        using errcode = 'foreign_key_violation', hint = 'vehicle_not_found';
    end if;

    if v_vehicle_owner <> new.driver_id then
      raise exception 'O veículo informado não pertence a este motorista.'
        using errcode = 'check_violation', hint = 'vehicle_not_owned';
    end if;

    if new.seats_total > v_vehicle_seats then
      raise exception 'A carona não pode oferecer % vagas: o veículo tem %.',
        new.seats_total, v_vehicle_seats
        using errcode = 'check_violation', hint = 'seats_exceed_vehicle';
    end if;
  end if;

  -- Perfil completo é condição para PUBLICAR, não para cancelar.
  if tg_op = 'INSERT' then
    select p.is_complete into v_is_complete
    from public.profiles p where p.id = new.driver_id;

    if not coalesce(v_is_complete, false) then
      raise exception 'Complete seu perfil antes de publicar uma carona.'
        using errcode = 'check_violation', hint = 'profile_incomplete';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Critério de aceite: passageiros com vaga confirmada são notificados
-- imediatamente após o cancelamento ou a edição.
--
-- AFTER UPDATE no banco, e não uma chamada feita pelo app depois de salvar:
--   - atomicidade: o aviso é gravado na MESMA transação da mudança. Não existe
--     rota cancelada sem aviso porque o app fechou entre as duas chamadas;
--   - qualquer caminho avisa: app, API REST direta, dashboard, job futuro.
-- ---------------------------------------------------------------------------
create or replace function private.on_route_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := '{}';
  v_summary text;
begin
  -- array_append, e não `v_changed || 'texto'`: com o operador, o literal sem
  -- tipo é lido como array e a edição inteira falha com "malformed array
  -- literal" — e, como o aviso está na mesma transação, a edição é revertida.
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    perform private.notify_affected_passengers(new.id, 'rota_cancelada', new.cancellation_reason);
    return null;
  end if;

  if new.departure_at is distinct from old.departure_at then
    v_changed := array_append(v_changed, 'o horário');
  end if;
  if (new.origin_label, new.origin_latitude, new.origin_longitude)
     is distinct from (old.origin_label, old.origin_latitude, old.origin_longitude) then
    v_changed := array_append(v_changed, 'a origem');
  end if;
  if (new.destination_label, new.destination_latitude, new.destination_longitude)
     is distinct from (old.destination_label, old.destination_latitude, old.destination_longitude) then
    v_changed := array_append(v_changed, 'o destino');
  end if;

  -- Mudança que não afeta o passageiro (ex.: seats_taken pelo EP05) não avisa.
  if cardinality(v_changed) = 0 then
    return null;
  end if;

  -- "o horário", "o horário e o destino", "o horário, a origem e o destino"
  v_summary := case cardinality(v_changed)
    when 1 then v_changed[1]
    else array_to_string(v_changed[1:cardinality(v_changed) - 1], ', ')
         || ' e ' || v_changed[cardinality(v_changed)]
  end;

  perform private.notify_affected_passengers(
    new.id,
    'rota_alterada',
    null,
    jsonb_build_object(
      'changed_summary', v_summary,
      'previous', jsonb_build_object(
        'departure_at',      old.departure_at,
        'origin_label',      old.origin_label,
        'destination_label', old.destination_label
      )
    )
  );

  return null;
end;
$$;

revoke all on function private.on_route_changed() from public, anon, authenticated;

drop trigger if exists routes_notify_passengers on public.routes;
create trigger routes_notify_passengers
  after update on public.routes
  for each row
  when (
       old.status       is distinct from new.status
    or old.departure_at is distinct from new.departure_at
    or old.origin_label is distinct from new.origin_label
    or old.origin_latitude is distinct from new.origin_latitude
    or old.origin_longitude is distinct from new.origin_longitude
    or old.destination_label is distinct from new.destination_label
    or old.destination_latitude is distinct from new.destination_latitude
    or old.destination_longitude is distinct from new.destination_longitude
  )
  execute function private.on_route_changed();

-- ---------------------------------------------------------------------------
-- Leitura: o passageiro que tinha pedido numa rota precisa continuar vendo a
-- rota depois de cancelada — o aviso leva direto a ela (wireframe 6.2), e a
-- tela tem de mostrar o motivo.
-- ---------------------------------------------------------------------------
drop policy if exists "routes_select_published" on public.routes;
drop policy if exists "routes_select_visible" on public.routes;
create policy "routes_select_visible"
  on public.routes for select
  to authenticated
  using (
    status <> 'cancelada'
    or driver_id = (select auth.uid())
    or private.has_request_on_route(id)
  );

-- Continua sem policy de DELETE: cancelar é mudança de status.
