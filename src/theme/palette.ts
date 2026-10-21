/**
 * Cores do UniRota — fonte: "UniRota — Manual de identidade visual", v1
 * (setembro de 2026), seção 04.
 *
 * Arquivo sem dependência de React Native de propósito: o teste de contraste
 * (__tests__/themeContrast.test.ts) importa daqui e roda em Node puro.
 *
 * Telas NÃO usam `palette` — usam os papéis de `colors`, que dizem para que a
 * cor serve. Trocar uma cor é trocar uma linha aqui.
 */
export const palette = {
  /** Preto UniRota. Marca, títulos, texto principal, botão primário. */
  black: '#141414',
  /** Fundo padrão das telas; marca sobre fundo escuro. */
  white: '#FFFFFF',
  /**
   * Cinza médio do manual. Só para ícones inativos, bordas e elementos
   * decorativos ou desabilitados — NÃO para texto: sobre branco dá 3,3:1,
   * abaixo dos 4,5:1 que o próprio manual exige (WCAG AA).
   */
  gray: '#8E8E8E',
  /** Cinza claro. Fundos de cartão, divisórias, estados vazios. Nunca texto. */
  grayLight: '#F2F2F2',

  /**
   * DESVIO DO MANUAL — pendente de aval do responsável pela identidade.
   * Cinza de texto de apoio, legendas e rótulos: 5,3:1 sobre branco e 4,8:1
   * sobre o cinza claro. O manual indica o cinza médio para isso, mas ele não
   * atinge o contraste mínimo. É o mesmo cinza dos wireframes.
   */
  graySupport: '#6B6B6B',

  /**
   * EXCEÇÃO INTENCIONAL à paleta monocromática — pendente de aval.
   * Vermelho funcional, só para erro e ação destrutiva, e nunca sozinho:
   * sempre com texto que explique (e ícone quando couber). 7,6:1 sobre
   * branco. É o vermelho que o próprio manual usa em "Usos incorretos".
   */
  red: '#8A3A3A',
} as const;

/**
 * Papéis de cor. É isto que as telas usam. Não existe verde nem âmbar: sucesso
 * e aviso são preto ou cinza, com texto que diga o que houve.
 */
export const colors = {
  background: palette.white,
  /** Fundo de cartão, de estado vazio, de aviso e de item pressionado. */
  surface: palette.grayLight,
  /** Divisórias entre linhas e cartões. */
  divider: palette.grayLight,
  /** Contorno de campo e de botão secundário (3,3:1 — atende 3:1 de componente). */
  border: palette.gray,
  /** Contorno de campo em foco: mais forte, não outra cor. */
  borderFocused: palette.black,

  text: palette.black,
  /** Texto de apoio, legendas, rótulos de campo, placeholders. */
  textSecondary: palette.graySupport,
  /** Texto de controle desabilitado — isento de contraste mínimo (WCAG). */
  textDisabled: palette.gray,
  iconInactive: palette.gray,

  /** Botão primário: um por tela. */
  primary: palette.black,
  onPrimary: palette.white,
  primaryDisabled: palette.gray,

  /** Erro e ação destrutiva. Ver a nota em `palette.red`. */
  danger: palette.red,
  onDanger: palette.white,

  /** Abertura do app: preto, como a splash do manual. */
  splash: palette.black,
  /** Véu atrás de diálogo: o preto da marca a 60%. */
  scrim: `${palette.black}99`,
} as const;
