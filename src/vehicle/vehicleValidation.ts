/**
 * Regras do cadastro de veículo (EP02 / História 2).
 *
 * Funções puras. As mesmas regras existem como CHECK constraints em
 * public.vehicles — aqui elas servem para o usuário ver o erro no campo, e não
 * um 400 genérico depois da requisição.
 */

import type { FieldError } from '@/profile/profileValidation';

/** Capacidade de passageiros. O motorista não ocupa vaga. */
export const MIN_SEATS = 1;
export const MAX_SEATS = 7;

/**
 * Cores oferecidas no select. Lista fechada (e não texto livre) porque a cor
 * serve para o passageiro reconhecer o carro na rua: "grafite escuro metálico"
 * digitado por extenso não ajuda ninguém.
 */
export const VEHICLE_COLORS = [
  'Branco',
  'Prata',
  'Cinza',
  'Preto',
  'Vermelho',
  'Azul',
  'Verde',
  'Amarelo',
  'Marrom',
  'Bege',
  'Outra',
] as const;

export type VehicleColor = (typeof VEHICLE_COLORS)[number];

export type VehicleDraft = {
  makeModel?: string | null;
  color?: string | null;
  plate?: string | null;
  seats?: number | null;
};

/** Remove tudo que não é letra ou dígito e sobe para maiúscula. */
export function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const PLATE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const PLATE_LEGACY = /^[A-Z]{3}[0-9]{4}$/;

/**
 * Aceita os dois padrões que circulam no Brasil:
 *   Mercosul  ABC1D23
 *   antigo    ABC1234
 */
export function isValidPlate(plate: string): boolean {
  const normalized = normalizePlate(plate);
  return PLATE_MERCOSUL.test(normalized) || PLATE_LEGACY.test(normalized);
}

/** Exibição: ABC-1D23 / ABC-1234. */
export function formatPlate(plate: string): string {
  const n = normalizePlate(plate).slice(0, 7);
  if (n.length <= 3) return n;
  return `${n.slice(0, 3)}-${n.slice(3)}`;
}

export function validateVehicleForm(vehicle: VehicleDraft): FieldError[] {
  const errors: FieldError[] = [];

  const makeModel = (vehicle.makeModel ?? '').trim();
  if (makeModel.length === 0) {
    errors.push({ field: 'makeModel', message: 'Informe a marca e o modelo.' });
  } else if (makeModel.length < 2) {
    errors.push({ field: 'makeModel', message: 'Marca e modelo muito curtos.' });
  }

  if (!vehicle.color || vehicle.color.trim().length === 0) {
    errors.push({ field: 'color', message: 'Selecione a cor do veículo.' });
  }

  const plate = (vehicle.plate ?? '').trim();
  if (plate.length === 0) {
    errors.push({ field: 'plate', message: 'Informe a placa.' });
  } else if (!isValidPlate(plate)) {
    errors.push({ field: 'plate', message: 'Placa inválida. Use ABC-1D23 ou ABC-1234.' });
  }

  const seats = vehicle.seats;
  if (seats === null || seats === undefined || Number.isNaN(seats)) {
    errors.push({ field: 'seats', message: 'Informe o número de vagas.' });
  } else if (!Number.isInteger(seats)) {
    errors.push({ field: 'seats', message: 'O número de vagas precisa ser inteiro.' });
  } else if (seats < MIN_SEATS || seats > MAX_SEATS) {
    errors.push({
      field: 'seats',
      message: `O número de vagas precisa estar entre ${MIN_SEATS} e ${MAX_SEATS}.`,
    });
  }

  return errors;
}
