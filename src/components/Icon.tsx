import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, sizes } from '@/theme/tokens';

export type IconName =
  | 'check'
  | 'alert'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'calendar'
  | 'clock';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

/**
 * Ícones desenhados com View, sem fonte e sem dependência de SVG.
 *
 * Os caracteres usados antes (⌖ ▤ ◷ ⌄) não existem na Inter e apareciam em
 * outra fonte, diferente em cada plataforma. Aqui o traço é sempre o mesmo, e
 * a construção — ângulos retos, um peso de traço — conversa com o símbolo da
 * marca (manual, seção 01).
 *
 * São decorativos: quem usa um ícone põe o significado em texto ao lado.
 */
export function Icon({ name, size = sizes.icon, color = colors.text }: Props) {
  const stroke = Math.max(1.5, Math.round(size / 9));

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {renderGlyph(name, size, stroke, color)}
    </View>
  );
}

function renderGlyph(name: IconName, size: number, stroke: number, color: string) {
  switch (name) {
    case 'check':
      return (
        <View
          style={{
            width: size * 0.3,
            height: size * 0.6,
            borderRightWidth: stroke,
            borderBottomWidth: stroke,
            borderColor: color,
            transform: [{ translateY: -size * 0.08 }, { rotate: '45deg' }],
          }}
        />
      );

    case 'chevron-left':
    case 'chevron-right':
    case 'chevron-down': {
      const rotation = { 'chevron-left': '-135deg', 'chevron-right': '45deg', 'chevron-down': '135deg' }[name];
      const offset =
        name === 'chevron-down'
          ? { translateY: -size * 0.12 }
          : { translateX: name === 'chevron-right' ? -size * 0.1 : size * 0.1 };
      return (
        <View
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderTopWidth: stroke,
            borderRightWidth: stroke,
            borderColor: color,
            transform: [offset, { rotate: rotation }],
          }}
        />
      );
    }

    case 'alert':
      return (
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color }]}>
          <View style={{ width: stroke, height: size * 0.32, backgroundColor: color, marginTop: size * 0.04 }} />
          <View style={{ width: stroke, height: stroke, backgroundColor: color, marginTop: size * 0.1 }} />
        </View>
      );

    case 'calendar':
      return (
        <View
          style={{
            width: size * 0.86,
            height: size * 0.8,
            borderWidth: stroke,
            borderTopWidth: stroke * 2.5,
            borderColor: color,
            borderRadius: stroke,
          }}
        />
      );

    case 'clock': {
      const outer = size * 0.9;
      const center = (outer - 2 * stroke) / 2;
      return (
        <View style={{ width: outer, height: outer, borderRadius: outer / 2, borderWidth: stroke, borderColor: color }}>
          {/* Ponteiros: um para cima, outro para a direita, saindo do centro. */}
          <View
            style={{
              position: 'absolute',
              width: stroke,
              height: center * 0.75,
              backgroundColor: color,
              top: center - center * 0.75,
              left: center - stroke / 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: center * 0.6,
              height: stroke,
              backgroundColor: color,
              top: center - stroke / 2,
              left: center - stroke / 2,
            }}
          />
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
});
