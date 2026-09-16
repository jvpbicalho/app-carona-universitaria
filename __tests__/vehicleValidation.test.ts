import {
  formatPlate,
  isValidPlate,
  normalizePlate,
  validateVehicleForm,
  type VehicleDraft,
} from '../src/vehicle/vehicleValidation';

const VALIDO: VehicleDraft = {
  makeModel: 'Honda Fit',
  color: 'Prata',
  plate: 'ABC1D23',
  seats: 4,
};

describe('normalizePlate', () => {
  it.each([
    ['abc-1d23', 'ABC1D23'],
    ['ABC 1D23', 'ABC1D23'],
    ['abc1234', 'ABC1234'],
    ['  ABC-1234  ', 'ABC1234'],
  ])('normaliza %s para %s', (entrada, esperado) => {
    expect(normalizePlate(entrada)).toBe(esperado);
  });
});

describe('isValidPlate', () => {
  it.each([
    ['Mercosul', 'ABC1D23'],
    ['Mercosul com hífen', 'ABC-1D23'],
    ['Mercosul minúsculo', 'abc1d23'],
    ['antigo', 'ABC1234'],
    ['antigo com hífen', 'ABC-1234'],
  ])('aceita placa %s', (_label, plate) => {
    expect(isValidPlate(plate)).toBe(true);
  });

  it.each([
    ['curta', 'ABC123'],
    ['longa', 'ABC1D234'],
    ['letras a mais', 'ABCD123'],
    ['letra na posição errada do Mercosul', 'AB1CD23'],
    ['vazia', ''],
    ['só letras', 'ABCDEFG'],
    ['só números', '1234567'],
  ])('recusa placa %s', (_label, plate) => {
    expect(isValidPlate(plate)).toBe(false);
  });

  // ABC1123 não é Mercosul (a 5ª posição deveria ser letra), mas é 3 letras +
  // 4 dígitos, ou seja, placa antiga válida. Os dois padrões convivem, então a
  // função precisa aceitar.
  it('aceita ABC1123 pelo padrão antigo, ainda que não seja Mercosul', () => {
    expect(isValidPlate('ABC1123')).toBe(true);
  });
});

describe('formatPlate', () => {
  it.each([
    ['abc1d23', 'ABC-1D23'],
    ['abc1234', 'ABC-1234'],
    ['AB', 'AB'],
    ['', ''],
  ])('formata %s como %s', (entrada, esperado) => {
    expect(formatPlate(entrada)).toBe(esperado);
  });

  it('corta o que passa de 7 caracteres', () => {
    expect(formatPlate('ABC1D23XYZ')).toBe('ABC-1D23');
  });
});

describe('validateVehicleForm', () => {
  it('não acusa erro num veículo válido', () => {
    expect(validateVehicleForm(VALIDO)).toEqual([]);
  });

  it('acusa todos os campos num formulário vazio', () => {
    const errors = validateVehicleForm({});
    expect(errors.map((e) => e.field)).toEqual(['makeModel', 'color', 'plate', 'seats']);
  });

  it('recusa placa em formato inválido', () => {
    const errors = validateVehicleForm({ ...VALIDO, plate: 'XX999' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('ABC-1D23');
  });

  it('aceita placa digitada com hífen e minúscula', () => {
    expect(validateVehicleForm({ ...VALIDO, plate: 'abc-1d23' })).toEqual([]);
  });

  it.each([0, -1, 8, 99])('recusa %i vagas', (seats) => {
    const errors = validateVehicleForm({ ...VALIDO, seats });
    expect(errors.map((e) => e.field)).toEqual(['seats']);
  });

  it.each([1, 4, 7])('aceita %i vagas', (seats) => {
    expect(validateVehicleForm({ ...VALIDO, seats })).toEqual([]);
  });

  it('recusa vagas fracionárias', () => {
    const errors = validateVehicleForm({ ...VALIDO, seats: 2.5 });
    expect(errors.map((e) => e.field)).toEqual(['seats']);
  });

  it('recusa marca/modelo só com espaços', () => {
    const errors = validateVehicleForm({ ...VALIDO, makeModel: '   ' });
    expect(errors.map((e) => e.field)).toEqual(['makeModel']);
  });
});
