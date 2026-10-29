# Cenário de demonstração (vídeo e ensaio)

Dados de teste reproduzíveis para gravar o vídeo do UniRota, automático
(`video/record.py`) ou manual no celular (`docs/demo/roteiro-video.md`).

## Contas

Todas com a senha **`DemoUniRota2026!`**. São contas descartáveis; a senha
não é de ninguém e fica documentada de propósito.

| Conta | E-mail | Papel no roteiro |
|---|---|---|
| Davi Motorista Demo | `teste.motorista@exemplo.test` | motorista, Fiat Argo prata, **2 vagas**, campus Consolação |
| Ana Passageira Demo | `teste.passageira@exemplo.test` | 1ª passageira, campus Perdizes |
| Bruno Passageiro Demo | `teste.passageiro@exemplo.test` | 2º passageiro (ocupa a última vaga) |
| Carla Admin Demo | `teste.admin@exemplo.test` | admin (muda o raio) e passageira (pedido encerrado, erro, recusa) |

Perfis completos: nome, foto, curso e campus. As fotos (`avatars/*.png`) são
iniciais sobre fundo liso, geradas por `make_avatars.py`, sem pessoa real.

## Caronas (datas sempre a partir de "hoje", calculadas pelo seed)

| | Origem → destino | Saída | Para quê |
|---|---|---|---|
| A | MASP (Av. Paulista, 1578) → PUC Perdizes | hoje + 2 dias, 07:30 | aparece na busca (a 653 m da origem buscada) |
| B | Praça da Sé → PUC Perdizes | hoje + 2 dias, 07:40 | **não** aparece com raio de 2 km (está a 2,46 km); aparece com 5 km |
| C | Rua Augusta, 1500 → PUC Consolação | hoje + 3 dias, 18:30 | para cancelar |
| D | Estação Santana → PUC Perdizes | hoje + 4 dias, 07:00 | para recusar |

Busca do passageiro: **Saindo de** `avenida paulista 900` → sugestão "Faculdade
Cásper Líbero"; **Indo para** o atalho "Ir para o meu campus: Perdizes"; data da
carona A, horário 07:30. `python scripts/demo/demo.py datas` mostra as datas.

## Comandos

```bash
python scripts/demo/demo.py reset            # antes de cada gravação: limpa e recria
python scripts/demo/demo.py seed             # cria/restaura (idempotente)
python scripts/demo/demo.py cleanup          # apaga só os dados de teste
python scripts/demo/demo.py datas            # data/hora de cada carona
python scripts/demo/demo.py pedir admin A D  # Carla pede vaga em A e D "por outro aparelho"
python scripts/demo/video/record.py          # grava docs/demo/unirota-demo.webm
```

O SQL (`seed.sql`, `cleanup.sql`) roda por um destes caminhos:

1. **Supabase local**: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` e `psql` no PATH;
2. **Remoto**: `SUPABASE_ACCESS_TOKEN` (token pessoal: dashboard → Account → Access Tokens), só na sessão do terminal;
3. **À mão**: sem nenhum dos dois, o script diz qual arquivo colar no SQL Editor; depois rode `demo.py avatars`.

**Nenhuma chave service_role é usada.** As fotos e os pedidos de vaga usam o
login da própria conta de teste com a publishable key do `.env` (pública por
desenho). Nada disso vai para arquivo versionado.

## Marcador e o que a limpeza apaga

- Contas: e-mail `@exemplo.test` **e** id `de0de000-0000-4000-8000-0000000000xx`. Os dois precisam bater.
- A cascata leva perfis, veículo, caronas, solicitações, avisos e o papel de admin.
- Também saem a linha DEMO de domínio e as tentativas de login, e as tolerâncias voltam a 2 km / ± 30 min.
- Não sai a entrada `avenida paulista 900` do `geocode_cache`, que é cache legítimo com coordenadas reais.

## Como as contas @exemplo.test passam pela regra institucional

O trigger de `auth.users` e a Edge Function `auth-login` só aceitam domínios
de `public.allowed_email_domains`. O seed insere `exemplo.test` com o rótulo
"DEMO …", e a limpeza remove. **Nenhum código muda.** O cadastro pelo app continua
só `@pucsp.edu.br`, porque o app valida pelo `.env` antes da rede. E `.test` é
um domínio reservado (RFC 2606), sem caixa de correio: enquanto a linha
existir, ninguém consegue confirmar uma conta nova nele. Rode `cleanup` ao
terminar as gravações.

## Geocodificação (atenção)

Em 28/10/2026 o Nominatim passou a responder **403** à Edge Function `geocode`.
Toda busca de endereço fora do cache falha com "A busca de endereços está
indisponível". O seed renova no cache a única busca do roteiro
(`avenida paulista 900`). Digite exatamente esse texto, de uma vez: pausas no
meio disparam buscas parciais, que vão ao Nominatim e falham.
