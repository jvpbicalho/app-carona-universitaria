# Identidade visual no app

Como o **UniRota — Manual de identidade visual** (v1, setembro de 2026, do UX
Designer) vira código. O manual é a fonte de verdade; este documento explica
onde cada regra mora e o que ainda depende de decisão.

## Um tema só

| Arquivo | O que tem |
|---|---|
| `src/theme/palette.ts` | As cores do manual (`palette`) e os **papéis** de cor (`colors`): texto, texto de apoio, fundo, cartão, divisória, contorno, ação, erro… |
| `src/theme/tokens.ts` | Fontes, níveis tipográficos, espaçamentos, raios e medidas. Reexporta `colors`. |

Tela e componente importam de `@/theme/tokens` e usam **papéis**, nunca a cor
literal. Trocar uma cor é trocar uma linha em `palette.ts`.

**O teste `__tests__/themeUsage.test.ts` falha** se algum arquivo em `app/` ou
`src/` (fora de `src/theme`) escrever:

- cor em hexadecimal ou `rgb()`;
- `fontFamily`, `fontWeight` ou `fontSize`;
- itálico;
- `Alert.alert` (não funciona na web — use `ConfirmDialog`).

É isso que faz tela nova já nascer dentro do manual.

## Cores

| Papel | Cor | Uso |
|---|---|---|
| `text`, `primary` | Preto UniRota `#141414` | Títulos, texto principal, botão primário |
| `background` | Branco `#FFFFFF` | Fundo das telas |
| `surface`, `divider` | Cinza claro `#F2F2F2` | Cartões, estados vazios, avisos, divisórias. Nunca texto |
| `border`, `iconInactive`, `textDisabled` | Cinza médio `#8E8E8E` | Contornos, ícones inativos, desabilitados. **Nunca texto comum** |
| `textSecondary` | `#6B6B6B` ⚠️ | Texto de apoio, legendas, rótulos, placeholders |
| `danger` | `#8A3A3A` ⚠️ | Só erro e ação destrutiva |

Não há verde nem âmbar: sucesso e aviso usam preto/cinza, com ícone e texto
que dizem o que houve. O vermelho **nunca carrega o significado sozinho**:
todo erro tem texto explicando, e ícone quando cabe.

### ⚠️ Pendentes de aval do responsável pela identidade

1. **Cinza de apoio `#6B6B6B`.** O manual indica o cinza médio `#8E8E8E` para
   texto de apoio e diz que ele atende o WCAG AA "a partir de 14 px". A conta
   não fecha: `#8E8E8E` sobre branco dá **3,3:1**, e o mínimo do próprio
   manual para texto é 4,5:1 (3:1 só vale para texto a partir de 24 px).
   `#6B6B6B` dá 5,3:1 sobre branco e 4,8:1 sobre o cinza claro, e é o cinza
   dos wireframes. O teste `themeContrast` trava essa decisão: voltar ao
   `#8E8E8E` faz o teste falhar até alguém mudá-lo de propósito.
2. **Vermelho funcional `#8A3A3A`.** Exceção intencional à paleta
   monocromática, só para erro e ação destrutiva (7,6:1 sobre branco). É o
   vermelho que o próprio manual usa na página de usos incorretos.

## Tipografia

Inter em dois pesos, como o manual. Pacote `@expo-google-fonts/inter`, só os
arquivos de 400 e 500; carregados em `app/_layout.tsx` por `useFonts`
**antes da primeira tela** — enquanto isso, a abertura preta (`SplashGate`).
Se o arquivo não chegar, o app segue com as substitutas do manual (Helvetica
Neue, Arial) em vez de travar.

| Nível (`typography.*`) | Peso | Tamanho / entrelinha |
|---|---|---|
| `screenTitle` | Medium | 28 / 34 |
| `sectionTitle` | Medium | 20 / 26 |
| `body` (+ `bodyStrong`, `bodySecondary`) | Regular (Medium) | 16 / 26 |
| `caption` (+ `captionStrong`) | Regular (Medium) | 13 / 20 |
| `fieldLabel` | Regular | 11 / 15 |
| `button` | Medium | 16 / 20 — não está na tabela do manual |

Cada peso é uma **família** (`Inter_400Regular`, `Inter_500Medium`), e
ninguém escreve `fontWeight`: no Android, `fontWeight` não escolhe o peso de
fonte carregada.

## Componentes

- **Botão** (`PrimaryButton`): `primary` preto cheio, **no máximo um por
  tela**; `outline` para os demais; `danger` (vermelho cheio) só na tela que
  confirma ação irreversível; `dangerOutline` para a ação que ainda vai pedir
  confirmação; `compact` para atalhos.
- **Campos** (`FieldParts`): foco = contorno preto de 2 px; erro = contorno
  vermelho de 2 px + ícone + mensagem.
- **Ícones** (`Icon`): desenhados com `View` — ângulo reto e traço único,
  como o símbolo. Os caracteres antigos (⌖ ▤ ◷ ⌄) não existem na Inter.
- **Diálogo** (`ConfirmDialog`): substitui `Alert.alert` no celular e na web.
- **Data e hora**: `DateTimeField.tsx` (seletor nativo) e
  `DateTimeField.web.tsx` (seletor do navegador, via `showPicker()`).
- **Navegação**: toda tela interna tem "Voltar" (`ScreenHeader`); sem tela
  anterior (link direto, página recarregada), volta para um destino fixo.
- **Carregamento**: esqueleto dentro da tela (`FormSkeleton`, `SkeletonList`).
  A abertura preta é só para o início do app.
- Na web o conteúdo para em 560 px de largura e fica centralizado.

## Regras de escrita

Do manual, seção 05 — valem para todo texto novo:

- frase em caixa baixa com inicial maiúscula, inclusive placeholder e
  etiqueta ("No horário", "Ex.: Honda Fit"); nunca CAIXA ALTA;
- botão começa com verbo e diz o que acontece ("Publicar nova carona", não
  "+ Nova carona");
- a marca se escreve **UniRota**;
- erro explica o que houve e oferece saída, sem jargão ("Tente de novo",
  padronizado).

## Marca (logo, ícone, favicon, splash)

**Bloqueado.** O manual diz que os SVGs ficam na pasta `logo` do repositório,
e ela não existe. Enquanto isso:

- o app não mostra o logo em lugar nenhum (não foi redesenhado a partir da
  descrição);
- `icon` e favicon continuam os padrões do Expo;
- a abertura (`SplashGate`) é preta e vazia, como a splash do manual, mas sem
  o lockup vertical.

Quando os arquivos chegarem: gerar PNG 1×/2×/3× dos lockups, favicon 16/32 a
partir de `unirota-favicon.svg` e ícone 1024×1024 sem cantos a partir de
`unirota-app-icon.svg`; rasterizar o nome com a Inter Medium (o texto dos
lockups ainda não está em curvas); exibir por `Image`, sem dependência de SVG.
