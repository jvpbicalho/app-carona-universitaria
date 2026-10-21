import { Platform } from 'react-native';

import { colors } from './palette';

/**
 * Tema do UniRota — o ÚNICO lugar com cor, fonte, tamanho e espaçamento.
 *
 * Regras (o teste __tests__/themeUsage.test.ts falha se forem quebradas):
 *  - nenhuma tela ou componente escreve cor em hexadecimal, `fontFamily`,
 *    `fontWeight` ou `fontSize`: tudo sai daqui;
 *  - texto usa um nível de `typography`, que já traz família, tamanho,
 *    entrelinha e cor.
 *
 * Detalhes e justificativas em docs/identidade-visual.md.
 */
export { colors, palette } from './palette';

/**
 * Inter em dois pesos, como manda o manual (seção 05). Carregadas em
 * app/_layout.tsx antes da primeira renderização.
 *
 * Uma família por peso, e nunca `fontWeight`: no Android, `fontWeight` não
 * escolhe o peso de uma fonte carregada — "Medium" precisa ser outra família.
 *
 * Na web, a pilha de substitutas do manual (Helvetica Neue, Arial) entra caso
 * o arquivo da Inter não chegue.
 */
const webFallback = ", 'Helvetica Neue', Arial, sans-serif";

export const fonts = {
  regular: Platform.select({ web: `Inter_400Regular${webFallback}`, default: 'Inter_400Regular' }),
  medium: Platform.select({ web: `Inter_500Medium${webFallback}`, default: 'Inter_500Medium' }),
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** Medidas fixas de interface. */
export const sizes = {
  /** Altura mínima de campo e botão — alvo de toque confortável. */
  control: 52,
  /** Botão compacto (atalhos dentro de formulário). */
  controlCompact: 40,
  /** Linha de menu. */
  row: 54,
  avatarSm: 40,
  avatarLg: 96,
  avatarPicker: 112,
  iconSm: 14,
  icon: 18,
  /** Bolinha que marca item que pede atenção. */
  dot: 8,
  /** Espessura do contorno de campo em foco ou com erro. */
  borderStrong: 2,
  hairline: 1,
  /** Largura máxima do conteúdo: na web, a tela não estica até as bordas. */
  contentMaxWidth: 560,
} as const;

/** Arredonda a entrelinha do manual (multiplicador) para pixels inteiros. */
function lineHeight(fontSize: number, multiplier: number): number {
  return Math.round(fontSize * multiplier);
}

/**
 * Níveis tipográficos do manual (seção 05), com as entrelinhas dele:
 *
 *   Título de tela    Medium 500  28 px  1,2
 *   Título de seção   Medium 500  20 px  1,3
 *   Corpo             Regular 400 16 px  1,6
 *   Apoio e legenda   Regular 400 13 px  1,5
 *   Rótulo de campo   Regular 400 11 px  1,4
 *
 * `*Strong` são o mesmo nível em Medium (os dois pesos permitidos), para
 * destaque dentro de um texto. `button` e `input` não estão na tabela do
 * manual; seguem o tamanho do corpo.
 */
export const typography = {
  screenTitle: { fontFamily: fonts.medium, fontSize: 28, lineHeight: lineHeight(28, 1.2), color: colors.text },
  sectionTitle: { fontFamily: fonts.medium, fontSize: 20, lineHeight: lineHeight(20, 1.3), color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: lineHeight(16, 1.6), color: colors.text },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: lineHeight(16, 1.6), color: colors.text },
  /** Corpo em cinza de apoio: subtítulo de tela, texto de estado vazio. */
  bodySecondary: { fontFamily: fonts.regular, fontSize: 16, lineHeight: lineHeight(16, 1.6), color: colors.textSecondary },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: lineHeight(13, 1.5), color: colors.textSecondary },
  captionStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: lineHeight(13, 1.5), color: colors.text },
  fieldLabel: { fontFamily: fonts.regular, fontSize: 11, lineHeight: lineHeight(11, 1.4), color: colors.textSecondary },
  button: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 20, color: colors.text },
  /** Texto digitado em campo. Sem lineHeight: no iOS ele desalinha o cursor. */
  input: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  /** Número grande do contador de vagas. */
  counter: { fontFamily: fonts.medium, fontSize: 20, lineHeight: lineHeight(20, 1.3), color: colors.text },
} as const;
