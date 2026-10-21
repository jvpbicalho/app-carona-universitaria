import React, { useRef } from 'react';

import {
  DateTimeFieldFrame,
  pad,
  type DateTimeFieldProps,
} from '@/components/DateTimeFieldFrame';
import { sizes } from '@/theme/tokens';

type PickerInput = {
  showPicker?: () => void;
  focus: () => void;
  click: () => void;
};

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Campo de data ou hora na WEB.
 *
 * O `@react-native-community/datetimepicker` não renderiza na web, e era por
 * isso que não dava para publicar carona nem escolher horário de busca pelo
 * navegador. Aqui o campo visível é o mesmo do celular (DateTimeFieldFrame,
 * no estilo do manual), e o toque abre o seletor nativo do navegador por um
 * `<input type="date|time">` invisível, via `showPicker()`.
 *
 * O `<input>` fica sobre a caixa, transparente e fora do foco por teclado: o
 * navegador ancora o calendário nele, então o calendário abre logo abaixo do
 * campo. `min`/`max` bloqueiam o passado no próprio calendário, como no
 * celular.
 */
export function DateTimeField({
  label,
  mode,
  value,
  onChange,
  minimumDate,
  maximumDate,
  error,
  helper,
}: DateTimeFieldProps) {
  const inputRef = useRef<PickerInput | null>(null);

  function open() {
    const input = inputRef.current;
    if (!input) return;
    try {
      if (input.showPicker) {
        input.showPicker();
        return;
      }
    } catch {
      // showPicker recusa fora de um gesto do usuário ou dentro de iframe de
      // outra origem; o foco abaixo é o plano B.
    }
    input.focus();
    input.click();
  }

  function handleChange(raw: string) {
    if (!raw) return;
    const base = value ? new Date(value) : new Date();

    if (mode === 'date') {
      const [year, month, day] = raw.split('-').map(Number);
      if (!year || !month || !day) return;
      base.setFullYear(year, month - 1, day);
    } else {
      const [hours, minutes] = raw.split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
      base.setHours(hours, minutes, 0, 0);
    }
    onChange(base);
  }

  const inputValue = value ? (mode === 'date' ? toDateInput(value) : toTimeInput(value)) : '';

  return (
    <DateTimeFieldFrame
      label={label}
      mode={mode}
      value={value}
      error={error}
      helper={helper}
      onPress={open}
    >
      <input
        ref={(element: unknown) => {
          inputRef.current = element as PickerInput | null;
        }}
        type={mode}
        value={inputValue}
        min={mode === 'date' && minimumDate ? toDateInput(minimumDate) : undefined}
        max={mode === 'date' && maximumDate ? toDateInput(maximumDate) : undefined}
        onChange={(event: { target: { value: string } }) => handleChange(event.target.value)}
        tabIndex={-1}
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // Logo abaixo do rótulo: é onde está a caixa visível.
          top: 20,
          height: sizes.control,
          width: '100%',
          opacity: 0,
          pointerEvents: 'none',
          border: 0,
          padding: 0,
        }}
      />
    </DateTimeFieldFrame>
  );
}
