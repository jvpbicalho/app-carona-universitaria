-- Ponto de extensão para o EP06 (notificações em tempo real).
--
-- Esta história precisa avisar passageiros confirmados quando a rota é
-- cancelada ou editada, mas push e tempo real são do EP06. O desenho aqui é
-- uma FILA (outbox): esta história decide QUEM é avisado e COM QUE TEXTO, e
-- grava uma linha por destinatário com delivery_status = 'pendente'. O EP06
-- decide COMO entregar, lendo essa fila — sem mexer em nada desta história.
--
-- Formas previstas de o EP06 plugar (nenhuma exige alterar este arquivo):
--   - Realtime: o app assina INSERTs em `notifications` filtrados pelo próprio
--     recipient_id (a RLS abaixo já garante que cada um só recebe os seus);
--   - Push: Database Webhook em INSERT -> Edge Function que envia via Expo
--     Push e atualiza delivery_status para 'enviada' ou 'falhou'.

create table if not exists public.notifications (
  id              uuid        primary key default gen_random_uuid(),
  recipient_id    uuid        not null references public.profiles (id) on delete cascade,
  kind            text        not null,
  -- set null, não cascade: o aviso é histórico do passageiro e sobrevive à rota.
  route_id        uuid        references public.routes (id) on delete set null,
  title           text        not null,
  body            text        not null,
  -- Dados estruturados para a tela de destino ("toque abre a tela da ação",
  -- wireframe 6.2): route_id, motivo, o que mudou.
  payload         jsonb       not null default '{}'::jsonb,
  delivery_status text        not null default 'pendente',
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  -- O EP06 acrescenta os tipos dele (solicitação recebida, aceite, recusa).
  constraint notifications_kind_check
    check (kind in ('rota_cancelada', 'rota_alterada')),
  constraint notifications_delivery_status_check
    check (delivery_status in ('pendente', 'enviada', 'falhou'))
);

comment on table public.notifications is
  'Fila de avisos (outbox). Esta história grava; o EP06 entrega. Uma linha por '
  'destinatário. Aviso de cancelamento é crítico e não pode ser desligado '
  '(wireframe 6.4) — por isso não há checagem de preferência aqui.';
comment on column public.notifications.delivery_status is
  'pendente = gravado, ainda não entregue. O EP06 muda para enviada/falhou.';

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
-- O que o entregador do EP06 vai varrer.
create index if not exists notifications_pending_idx
  on public.notifications (created_at)
  where delivery_status = 'pendente';

alter table public.notifications enable row level security;

-- Cada um lê só os próprios avisos. É também o que faz uma assinatura
-- Realtime do EP06 ser segura sem código extra.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

-- Sem insert/update/delete para o app: quem grava é a função abaixo, e quem
-- marca lida/entregue é o EP06.

-- ---------------------------------------------------------------------------
-- O ponto de extensão.
--
-- Único lugar que decide quem é avisado sobre uma mudança de rota e com que
-- texto. Hoje grava na fila; quando o EP06 existir, a entrega acontece a
-- partir da fila, e esta função não muda.
--
-- Destinatários: somente solicitações `confirmada` — é o que o critério de
-- aceite pede. Quem está `aguardando` não tem vaga; o que acontece com esses
-- pedidos quando a rota é cancelada é decisão do EP05.
--
-- Retorna quantos passageiros foram avisados.
-- ---------------------------------------------------------------------------
create or replace function private.notify_affected_passengers(
  p_route_id uuid,
  p_kind     text,
  p_reason   text  default null,
  p_details  jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route   public.routes;
  v_when    text;
  v_title   text;
  v_body    text;
  v_count   integer;
begin
  select * into v_route from public.routes where id = p_route_id;
  if not found then
    return 0;
  end if;

  -- Horário de Brasília: é o que o passageiro tem na cabeça. timestamptz sem
  -- fuso formataria em UTC, três horas adiantado.
  v_when := to_char(v_route.departure_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');

  -- Textos curtos: o push precisa caber em 2 linhas (wireframe 6.2).
  if p_kind = 'rota_cancelada' then
    v_title := 'Carona cancelada';
    v_body  := format('A carona de %s para %s foi cancelada. Motivo: %s',
                      v_when, v_route.destination_label, coalesce(p_reason, 'não informado'));
  elsif p_kind = 'rota_alterada' then
    v_title := 'Carona alterada';
    v_body  := format('O motorista alterou %s da sua carona. Agora: saída %s, de %s para %s.',
                      coalesce(p_details ->> 'changed_summary', 'os dados'),
                      v_when, v_route.origin_label, v_route.destination_label);
  else
    raise exception 'Tipo de aviso desconhecido: %', p_kind
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.notifications (recipient_id, kind, route_id, title, body, payload)
  select
    rr.passenger_id,
    p_kind,
    p_route_id,
    v_title,
    v_body,
    jsonb_build_object('route_id', p_route_id, 'reason', p_reason) || coalesce(p_details, '{}'::jsonb)
  from public.ride_requests rr
  where rr.route_id = p_route_id
    and rr.status = 'confirmada';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.notify_affected_passengers(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.notify_affected_passengers(uuid, text, text, jsonb)
  to service_role;
