import { colors, palette } from '@/theme/palette';

/**
 * Contraste mínimo do manual: 4,5:1 entre texto e fundo (WCAG AA).
 *
 * Se alguém trocar `textSecondary` de volta para o cinza médio (#8E8E8E, 3,3:1),
 * este teste falha — de propósito. A troca só deve acontecer com decisão
 * explícita do responsável pela identidade, e aí o teste muda junto.
 */

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT_ON_BACKGROUND: [string, string, string][] = [
  ['texto sobre fundo', colors.text, colors.background],
  ['texto sobre cartão', colors.text, colors.surface],
  ['texto de apoio sobre fundo', colors.textSecondary, colors.background],
  ['texto de apoio sobre cartão', colors.textSecondary, colors.surface],
  ['erro sobre fundo', colors.danger, colors.background],
  ['erro sobre cartão', colors.danger, colors.surface],
  ['texto do botão primário', colors.onPrimary, colors.primary],
  ['texto do botão destrutivo', colors.onDanger, colors.danger],
];

describe('contraste do tema', () => {
  it.each(TEXT_ON_BACKGROUND)('%s atinge 4,5:1', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('contorno de campo atinge 3:1 (componente de interface, WCAG 1.4.11)', () => {
    expect(contrast(colors.border, colors.background)).toBeGreaterThanOrEqual(3);
  });

  it('o cinza médio do manual não serve para texto — por isso existe o cinza de apoio', () => {
    expect(contrast(palette.gray, palette.white)).toBeLessThan(4.5);
    expect(contrast(palette.graySupport, palette.white)).toBeCloseTo(5.33, 1);
    expect(contrast(palette.graySupport, palette.grayLight)).toBeCloseTo(4.76, 1);
  });

  it('a paleta só tem preto, branco, cinzas e o vermelho funcional', () => {
    expect(Object.keys(palette).sort()).toEqual(
      ['black', 'gray', 'grayLight', 'graySupport', 'red', 'white'].sort(),
    );
  });
});
