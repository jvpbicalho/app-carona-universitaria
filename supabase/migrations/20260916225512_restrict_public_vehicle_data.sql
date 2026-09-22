-- Correção de exposição apontada pelo linter de segurança.
--
-- A placa saía em public_vehicles para qualquer usuário autenticado, o que
-- permitia enumerar as placas de todos os motoristas do app. Placa identifica
-- pessoa.
--
-- Divulgação progressiva, mesma lógica que o wireframe 3.4 já aplica ao
-- contato ("só aparece após confirmação"):
--   - buscando caronas (EP04): modelo e cor bastam para reconhecer o carro;
--   - com vaga confirmada (EP05): aí sim a placa, para achar o carro no ponto.
--
-- A segunda etapa entra junto com EP05, que é quem sabe dizer se existe
-- reserva confirmada entre duas pessoas.
drop view if exists public.public_vehicles;

create view public.public_vehicles
with (security_invoker = false, security_barrier = true) as
  select v.id, v.owner_id, v.make_model, v.color, v.seats
  from public.vehicles v;

comment on view public.public_vehicles is
  'Dados do veículo visíveis a outros usuários: modelo, cor e capacidade. '
  'SEM placa, SEM CNH e SEM consumo. A placa só deve ser revelada a passageiro '
  'com vaga confirmada (EP05).';

revoke all on public.public_vehicles from anon;
grant select on public.public_vehicles to authenticated;

-- can_drive é SECURITY DEFINER e estava chamável via /rest/v1/rpc, deixando
-- descobrir se um uuid qualquer tem veículo. O app não a usa: deriva de ter
-- carregado o próprio veículo.
revoke all on function public.can_drive(uuid) from public, anon, authenticated;
grant execute on function public.can_drive(uuid) to service_role;

-- --------------------------------------------------------------------------
-- Lints aceitos conscientemente, para quem for rodar o linter depois:
--
-- `security_definer_view` (ERROR) em public_profiles e public_vehicles:
--   é o desenho pretendido. A RLS das tabelas base restringe cada usuário à
--   própria linha; estas views são a exceção controlada que expõe um
--   subconjunto seguro de colunas de todos. A alternativa (policy `using
--   (true)` + grants por coluna) não funciona aqui, porque grant de coluna não
--   depende da linha: o usuário perderia acesso ao próprio e-mail.
--
-- `rls_enabled_no_policy` (INFO) em geocode_cache e login_attempts:
--   RLS ligado + zero policies = deny-all. É o objetivo; só service_role
--   (Edge Functions) acessa essas tabelas.
-- --------------------------------------------------------------------------
