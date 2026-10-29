# Roteiro do vídeo de demonstração — UniRota

Para gravar **manualmente, da tela do celular**, o mesmo percurso do vídeo
automático (`docs/demo/unirota-demo.webm`, versão web, que serve de ensaio e de
plano B). Contas, caronas e comandos: [`scripts/demo/README.md`](../../scripts/demo/README.md).

Duração prevista: **cerca de 6 min 30 s** já editado (de 9 a 10 min brutos,
com as trocas de conta). Se passar de 7 min, veja "Cortes sugeridos" no fim.

---

## Antes de gravar (checklist)

- [ ] **Reiniciar o cenário**: `python scripts/demo/demo.py reset`. No fim ele imprime as datas: anote a data da carona **A** (hoje + 2 dias, 07:30).
- [ ] Subir o app: `npx expo start`. Abra no celular pelo Expo Go (QR) e, no notebook, aperte `w` para a versão web (`http://localhost:8081`).
- [ ] No notebook: uma **janela normal** e uma **janela anônima**. Cada uma guarda a própria sessão, então dá para ter duas contas ao mesmo tempo.
- [ ] Internet estável nos dois aparelhos (Wi-Fi bom; o Realtime usa WebSocket).
- [ ] Celular: **Não perturbe** ligado e notificações de outros apps desligadas. Bateria acima de 60% ou na tomada. Brilho alto e fixo (sem ajuste automático). Orientação travada em retrato.
- [ ] O app aberto na **tela de login** (cena 1) antes de iniciar a gravação.
- [ ] **Ensaiar uma vez** o roteiro inteiro. Depois, `demo.py reset` de novo antes da gravação valendo.
- [ ] Ter o vídeo automático aberto no notebook, para conferir a ordem.

## Contas e aparelhos

Senha de todas: `DemoUniRota2026!`

| Quem | E-mail |
|---|---|
| Davi (motorista) | `teste.motorista@exemplo.test` |
| Ana (passageira) | `teste.passageira@exemplo.test` |
| Bruno (passageiro) | `teste.passageiro@exemplo.test` |
| Carla (admin e passageira) | `teste.admin@exemplo.test` |

**Arranjo A, com 2 celulares (o mais simples, se alguém da equipe emprestar
um):** o celular 1 fica com Davi e o celular 2 com os passageiros. Os dois
gravam a própria tela, e na edição você põe lado a lado ou alterna. Não há troca de conta no celular 1.

**Arranjo B, com 1 celular + notebook (o padrão deste roteiro):** o celular
gravado fica sempre com **quem recebe** a novidade em tempo real naquela cena.
Quem age fica no notebook. Para trocar de conta no celular: **Meu perfil →
Sair da conta** → entrar com a outra. Corte esse trecho na edição: pare a
fala, troque, retome com uma frase de transição ("Agora, do lado da
passageira…").

| Cena | Celular (gravado) | Notebook, janela normal | Notebook, janela anônima |
|---|---|---|---|
| 1–3 | sem login → Davi | — | — |
| 4 | Ana | Davi | — |
| 5 | Davi | — | Ana |
| 6 | Ana | Davi | — |
| 7 | Carla | Davi | Bruno |
| 8 | Carla | — | — |

Opcional: grave também a tela do notebook (Windows: **Win + Alt + R**, Xbox
Game Bar) para mostrar "quem agiu" em tela dividida na edição.

---

## Cenas

### Cena 1 — Cadastro e login (≈ 55 s)

**Objetivo:** cadastro só com e-mail institucional, tela de confirmação e login.

1. Na tela **Entrar**, toque em **Criar conta**.
2. **Nome completo:** `Conta Nova Demo`. **E-mail institucional:** `conta.nova@gmail.com`. **Senha:** `DemoUniRota2026!`. Toque em **Criar conta**.
   - **Deve aparecer**, sob o e-mail: "Cadastro permitido apenas com e-mail @pucsp.edu.br…". *Este é o erro proposital do cadastro.*
3. Para chegar a **"Confirme seu e-mail"**, o cadastro precisa ser real e envia um e-mail de verdade. Escolha uma opção:
   - use o e-mail institucional de alguém da equipe que concorde e apague a conta depois (`delete from auth.users where email = '…';` no SQL Editor); **ou**
   - pare antes de enviar e mostre essa tela no vídeo automático (plano B).
   - O SMTP padrão do Supabase aceita poucos envios por hora. Não repita o cadastro nos ensaios.
4. Toque em **Ir para o login**. Diga que **recuperar senha não existe** (Fase 2): não há link nessa tela.
5. Entre com **Davi**. **Deve aparecer:** "Olá, Davi", "Modo motorista", **Publicar carona**.

> Fala: "O UniRota só aceita a comunidade da PUC: e-mail de fora é barrado antes de qualquer envio."

### Cena 2 — Perfil e veículo (≈ 35 s)

1. **Meu perfil**. **Deve aparecer:** foto "DM", "Davi Motorista Demo", "E-mail institucional verificado", **Dados pessoais · Completo**, **Meu veículo · Fiat Argo · 2 vagas**.
2. **Dados pessoais**: curso (Ciência da Computação) e campus (Consolação). **Voltar**.
3. **Meu veículo**: Fiat Argo, Prata, placa, **Vagas disponíveis 2**. **Voltar** duas vezes.

> Fala: "Foto, curso e campus são obrigatórios. Sem veículo, ninguém entra no modo motorista."

### Cena 3 — Publicar, editar e cancelar (≈ 70 s)

1. **Publicar carona**.
2. **Origem:** digite `avenida paulista 900`, de uma vez, e escolha **Faculdade Cásper Líbero · Morro dos Ingleses**.
3. Toque em **Usar meu campus como destino: Consolação (Marquês de Paranaguá)**.
4. **Data:** hoje + 5 dias. **Horário de saída:** 19:00. Deixe as vagas em 2. Toque em **Publicar carona**.
   - **Deve aparecer:** a lista **Minhas caronas** com a nova carona.
5. Toque na carona nova → **Editar carona** → mude o **Horário de saída** para 19:30 → **Salvar alteração**.
   - **Deve aparecer:** "… às 19:30" no detalhe.
6. **Voltar** → toque na carona **Rua Augusta, 1500** → **Cancelar carona** → **Motivo**: "Mudança de compromisso ou horário" → **Cancelar carona**.
   - **Deve aparecer:** o detalhe com a carona cancelada.

> Fala: "Editar muda só trajeto, data e hora. Cancelar exige motivo, e quem tinha vaga é avisado."

### Cena 4 — Busca com tolerância (≈ 40 s)

*Celular: troque para **Ana** (corte). Notebook, janela normal: entre como Davi e deixe na tela inicial.*

1. **Buscar carona**.
2. **Saindo de:** `avenida paulista 900` → **Faculdade Cásper Líbero**.
3. **Ir para o meu campus: Perdizes (Monte Alegre)**.
4. **Data:** a da carona A. **Horário:** 07:30. **Buscar caronas**.
   - **Deve aparecer:** **1 carona**, saindo do **MASP**, "Sai a 650 m de onde você sai", "até 2 km".
   - **Não deve aparecer:** a da **Praça da Sé**, mesmo horário e destino, mas a 2,5 km.

> Fala: "A busca só mostra caronas a até 2 km da minha origem e 30 minutos do meu horário. A da Sé ficou de fora."

### Cena 5 — Pedido de vaga e badge em tempo real (≈ 30 s)

*Celular: troque para **Davi** (corte) e deixe na tela inicial, sem pendências. Notebook, janela anônima: entre como Ana e faça a mesma busca da cena 4.*

1. No notebook (Ana): **Solicitar vaga** → no diálogo, **Solicitar vaga**.
2. No celular (Davi), **sem tocar em nada**: **deve aparecer** o aviso **"Nova solicitação de vaga"** no topo e o cartão **"1 solicitação pendente"** na tela inicial, em cerca de 1 s.

> Fala: "Não recarreguei nada: o pedido chega na hora, e o badge conta as pendências."

### Cena 6 — Aceite e aviso à passageira (≈ 35 s)

*Celular: troque para **Ana** (corte) e deixe em **Minhas solicitações** ("Pendente"). Notebook, janela normal (Davi): toque no cartão **1 solicitação pendente** → **Aceitar**.*

1. No celular (Ana): **deve aparecer**, em cerca de 1 s, o aviso **"Vaga aceita"**, "… Sua vaga está garantida".
2. Toque em **Ver**. **Deve aparecer:** **Minhas solicitações** com o selo **Aceita**.
3. Opcional: na tela inicial, **Avisos** mostra o aviso guardado; toque em **Marcar como lidas**.

> Fala: "A passageira fica sabendo na hora, e o aviso fica guardado mesmo se ela estava offline."

### Cena 7 — Vagas esgotadas, erro proposital e recusa (≈ 100 s)

*Celular: troque para **Carla** (corte). Notebook: janela normal = Davi; janela anônima = troque para **Bruno**.*

1. Notebook (Bruno): mesma busca → **Solicitar vaga** → **Solicitar vaga**.
2. Celular (Carla): mesma busca. **Deve aparecer:** a carona do MASP com **1 vaga**. **Pare aqui e não toque em Solicitar vaga.**
3. No terminal do notebook, "Carla pede por outro aparelho":
   ```bash
   python scripts/demo/demo.py pedir admin A D
   ```
   (Carla pede vaga em A, MASP, e em D, Santana.)
4. Notebook (Davi): **Minhas caronas** → carona do **MASP** → em pendentes há Bruno e Carla → **Aceitar** em **Bruno**.
   - **No notebook:** "Vagas esgotadas · não aparece mais na busca".
5. Celular (Carla), na tela que ficou aberta: **Solicitar vaga** → **Solicitar vaga**. *Este é o erro proposital.*
   - **Deve aparecer:** **"As vagas desta carona se esgotaram. Busque outra carona."**
6. Celular: **Voltar** até a tela inicial → **Minhas solicitações**.
   - **Deve aparecer:** a do MASP com **Vagas esgotadas**, "A carona lotou antes de o motorista responder". A de Santana aparece como **Pendente**.
7. Celular: refaça a busca. **Deve aparecer:** **0 caronas**. A lotada sumiu, e a da Sé continua fora do raio.
8. Notebook (Davi): **Minhas caronas** → **Estação Santana** → **Recusar** → **Recusar solicitação**.
9. Celular (Carla): **deve aparecer**, em cerca de 1 s, o aviso **"Solicitação recusada"**.

> Fala: "Quando a última vaga é aceita, a carona sai da busca, os pedidos pendentes são encerrados (não recusados), e quem tenta pedir recebe uma mensagem clara."

### Cena 8 — Admin muda o raio (≈ 45 s)

*Celular: Carla, que é admin.*

1. **Meu perfil** → **Regras da busca · Admin**.
   - **Deve aparecer:** "Raio máximo (km)" = 2 e "Janela de horário (minutos)" = 30.
2. Troque o raio por `5` → **Salvar alterações**.
3. Tela inicial → refaça a mesma busca da cena 4.
   - **Deve aparecer:** a carona da **Praça da Sé**, 07:40, "Sai a 2,5 km de onde você sai".

> Fala: "As regras de tolerância são configuráveis pelo admin e valem na próxima busca, sem publicar app novo."

**Depois de gravar:** `python scripts/demo/demo.py reset` (para outra tomada) ou
`python scripts/demo/demo.py cleanup` (para encerrar). A limpeza devolve o raio
a 2 km e remove a linha DEMO de domínio.

---

## Plano B para os pontos frágeis

| Ponto frágil | Sintoma | Contingência |
|---|---|---|
| **Geocodificação** (o Nominatim responde 403 desde 28/10) | "A busca de endereços está indisponível" | Digite **exatamente** `avenida paulista 900`, de uma vez: está no cache, renovado pelo seed. Se ainda falhar, rode `demo.py reset`, que renova o cache, e tente de novo. Último caso: use o trecho do vídeo automático. |
| Endereço digitado devagar | Mensagem de erro piscando enquanto digita | Cole o texto ou digite sem pausa; o erro some quando a busca completa responde. |
| **Aviso em tempo real não chegou** em 5 s | Badge ou aviso não aparece | Volte à tela inicial: a contagem e a lista são relidas do banco ao ganhar foco. Ou abra **Avisos**. Confira o Wi-Fi do celular. Na edição, corte a espera. |
| **E-mail de confirmação demorando** ou limite do SMTP | "Confirme seu e-mail" não aparece ou dá erro de envio | Não dependa disso: mostre o bloqueio do @gmail.com e use o trecho da cena 1 do vídeo automático. |
| Login recusado com "Use seu e-mail institucional" | A linha DEMO de domínio não está no banco | Rode `demo.py seed` (recoloca a linha). |
| Conta bloqueada (3 senhas erradas) | "Aguarde 15:00" | `demo.py seed` limpa as tentativas das contas de teste. |
| Data da carona passou | A busca não acha nada | As datas são relativas ao dia do seed: rode `demo.py reset` no dia da gravação. |
| Estado bagunçado no meio | Pedidos ou caronas sobrando | `demo.py reset` e recomece a cena 1. |

## Dicas de gravação de tela

- **iPhone:** Ajustes → Central de Controle → adicione **Gravação de Tela**. Para gravar com voz, **toque e segure** o botão de gravação na Central de Controle e ligue o **Microfone**. Pare tocando na barra vermelha do topo.
- **Android:** puxe os Ajustes rápidos → **Gravador de tela** (ou "Gravação de tela"). Escolha **Mídia e microfone** e ative "Mostrar toques".
- Fale perto do celular, num lugar silencioso. Se preferir, grave a narração depois, por cima, no editor.
- **Cortar as esperas:** no iPhone, abra o vídeo em Fotos → Editar (só corta início e fim). Para cortes no meio, use CapCut, iMovie ou o Editor de Vídeo do Windows (Fotos → Novo vídeo): divida o clipe nas trocas de conta e apague os trechos.

## Duração e cortes sugeridos

| Cena | Tempo |
|---|---|
| 1 Cadastro e login | 0:55 |
| 2 Perfil e veículo | 0:35 |
| 3 Publicar, editar, cancelar | 1:10 |
| 4 Busca com tolerância | 0:40 |
| 5 Pedido e badge | 0:30 |
| 6 Aceite e aviso | 0:35 |
| 7 Vagas esgotadas, erro, recusa | 1:40 |
| 8 Admin | 0:45 |
| **Total** | **≈ 6:50** |

Se passar de 7 min, corte nesta ordem:
1. Cena 2: mostre só **Meu perfil** e a linha "Fiat Argo · 2 vagas", sem abrir as telas internas (−20 s).
2. Cena 3: publique e cancele, e mencione a edição só na fala (−25 s).
3. Cena 7: pule o passo 7, refazer a busca (−15 s). A cena 8 mostra a busca de novo.
4. Cena 1: pule a tela "Confirme seu e-mail" (−15 s).
