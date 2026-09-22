-- Correção aplicada como migration própria no banco.
--
-- private.on_route_changed usava `v_changed || 'o horário'`, que o Postgres lê
-- como array || array ("malformed array literal"). Como o aviso roda na mesma
-- transação do UPDATE, TODA edição de rota falhava. A versão corrigida
-- (array_append) já está incorporada a 20260922224557_route_edit_cancel.sql.
--
-- Arquivo vazio de propósito, para o histórico local bater 1:1 com o do banco.
select 1;
