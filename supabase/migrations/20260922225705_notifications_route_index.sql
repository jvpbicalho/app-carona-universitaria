-- Apontado pelo linter de desempenho: FK notifications.route_id sem índice.
-- Sem ele, o `on delete set null` e a busca "avisos desta rota" varrem a
-- tabela inteira.
create index if not exists notifications_route_idx on public.notifications (route_id);
