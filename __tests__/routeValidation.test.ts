import {
  combineDateAndTime,
  formatDeparture,
  isDepartureInPast,
  isDepartureTooFarAhead,
  validateRouteForm,
  type GeoPoint,
  type RouteDraft,
} from '../src/routes/routeValidation';

// Instante fixo: senão o teste de "é passado" passa a depender do relógio.
const AGORA = new Date('2026-09-16T10:00:00');

const ORIGEM: GeoPoint = { label: 'Av. Paulista, 900', latitude: -23.5614, longitude: -46.6558 };
const DESTINO: GeoPoint = { label: 'PUC Perdizes', latitude: -23.53796, longitude: -46.67124 };

const VALIDA: RouteDraft = {
  origin: ORIGEM,
  destination: DESTINO,
  departureAt: new Date('2026-09-18T07:30:00'),
  seatsTotal: 3,
};

describe('combineDateAndTime', () => {
  it('usa o dia da data e a hora do horário', () => {
    const data = new Date('2026-09-18T23:59:00');
    const hora = new Date('2000-01-01T07:30:00');
    const combinado = combineDateAndTime(data, hora);

    expect(combinado.getFullYear()).toBe(2026);
    expect(combinado.getMonth()).toBe(8); // setembro
    expect(combinado.getDate()).toBe(18);
    expect(combinado.getHours()).toBe(7);
    expect(combinado.getMinutes()).toBe(30);
    expect(combinado.getSeconds()).toBe(0);
  });

  it('não altera a data original', () => {
    const data = new Date('2026-09-18T23:59:00');
    combineDateAndTime(data, new Date('2000-01-01T07:30:00'));
    expect(data.getHours()).toBe(23);
  });
});

describe('isDepartureInPast', () => {
  it('reprova horário anterior a agora', () => {
    expect(isDepartureInPast(new Date('2026-09-16T09:59:00'), AGORA)).toBe(true);
  });

  it('reprova exatamente agora', () => {
    expect(isDepartureInPast(new Date('2026-09-16T10:00:00'), AGORA)).toBe(true);
  });

  it('aprova um minuto à frente', () => {
    expect(isDepartureInPast(new Date('2026-09-16T10:01:00'), AGORA)).toBe(false);
  });

  it('reprova ontem no mesmo horário', () => {
    expect(isDepartureInPast(new Date('2026-09-15T10:00:00'), AGORA)).toBe(true);
  });
});

describe('isDepartureTooFarAhead', () => {
  it('aprova dentro do limite', () => {
    expect(isDepartureTooFarAhead(new Date('2026-12-01T08:00:00'), AGORA)).toBe(false);
  });

  it('reprova erro de digitação no ano', () => {
    expect(isDepartureTooFarAhead(new Date('2126-09-18T07:30:00'), AGORA)).toBe(true);
  });
});

describe('formatDeparture', () => {
  it('formata com zero à esquerda', () => {
    expect(formatDeparture(new Date('2026-09-08T07:05:00'))).toBe('08/09/2026 às 07:05');
  });
});

describe('validateRouteForm', () => {
  it('não acusa erro numa rota válida', () => {
    expect(validateRouteForm(VALIDA, 4, AGORA)).toEqual([]);
  });

  // Critério de aceite da História 3.
  it('barra horário no passado', () => {
    const errors = validateRouteForm(
      { ...VALIDA, departureAt: new Date('2026-09-15T07:30:00') },
      4,
      AGORA,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('departureAt');
    expect(errors[0].message).toContain('passado');
  });

  it('barra data inválida', () => {
    const errors = validateRouteForm({ ...VALIDA, departureAt: new Date('data-invalida') }, 4, AGORA);
    expect(errors.map((e) => e.field)).toEqual(['departureAt']);
  });

  // Critério de aceite da História 2: o nº de vagas do veículo é o teto.
  it('barra mais vagas do que o veículo comporta', () => {
    const errors = validateRouteForm({ ...VALIDA, seatsTotal: 5 }, 4, AGORA);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('seatsTotal');
    expect(errors[0].message).toContain('4 vagas');
  });

  it('aceita vagas exatamente iguais à capacidade', () => {
    expect(validateRouteForm({ ...VALIDA, seatsTotal: 4 }, 4, AGORA)).toEqual([]);
  });

  it('usa singular quando o veículo tem 1 vaga', () => {
    const errors = validateRouteForm({ ...VALIDA, seatsTotal: 2 }, 1, AGORA);
    expect(errors[0].message).toContain('1 vaga.');
  });

  it('manda cadastrar veículo quando não há capacidade conhecida', () => {
    const errors = validateRouteForm(VALIDA, null, AGORA);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Cadastre seu veículo');
  });

  it('exige origem e destino selecionados', () => {
    const errors = validateRouteForm(
      { ...VALIDA, origin: null, destination: null },
      4,
      AGORA,
    );
    expect(errors.map((e) => e.field)).toEqual(['origin', 'destination']);
  });

  it('barra destino igual à origem', () => {
    const errors = validateRouteForm({ ...VALIDA, destination: { ...ORIGEM } }, 4, AGORA);
    expect(errors.map((e) => e.field)).toEqual(['destination']);
    expect(errors[0].message).toContain('diferente da origem');
  });

  it('acusa vários erros de uma vez', () => {
    const errors = validateRouteForm(
      { origin: null, destination: null, departureAt: null, seatsTotal: null },
      4,
      AGORA,
    );
    expect(errors.map((e) => e.field)).toEqual([
      'origin',
      'destination',
      'departureAt',
      'seatsTotal',
    ]);
  });

  it('recusa observações acima do limite', () => {
    const errors = validateRouteForm({ ...VALIDA, notes: 'x'.repeat(201) }, 4, AGORA);
    expect(errors.map((e) => e.field)).toEqual(['notes']);
  });
});
