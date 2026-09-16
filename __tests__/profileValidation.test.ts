import {
  formatPhone,
  isProfileComplete,
  isValidPhone,
  missingProfileFields,
  profileIncompleteWarning,
  validateProfileForm,
  type ProfileDraft,
} from '../src/profile/profileValidation';

const COMPLETO: ProfileDraft = {
  fullName: 'Maria Silva',
  avatarUrl: 'avatars/abc/foto.jpg',
  courseId: 'curso-1',
  campusId: 'campus-1',
};

describe('missingProfileFields', () => {
  it('não acusa nada num perfil completo', () => {
    expect(missingProfileFields(COMPLETO)).toEqual([]);
  });

  it('lista os quatro obrigatórios num perfil vazio', () => {
    expect(missingProfileFields({})).toEqual(['fullName', 'avatar', 'course', 'campus']);
  });

  it.each([
    ['fullName', { ...COMPLETO, fullName: null }],
    ['avatar', { ...COMPLETO, avatarUrl: null }],
    ['course', { ...COMPLETO, courseId: null }],
    ['campus', { ...COMPLETO, campusId: null }],
  ])('detecta a falta de %s', (esperado, perfil) => {
    expect(missingProfileFields(perfil as ProfileDraft)).toEqual([esperado]);
  });

  it('trata string só com espaços como não preenchida', () => {
    expect(missingProfileFields({ ...COMPLETO, fullName: '   ' })).toEqual(['fullName']);
  });

  it('não exige telefone nem bio', () => {
    expect(isProfileComplete({ ...COMPLETO, phone: null, bio: null })).toBe(true);
  });
});

describe('profileIncompleteWarning', () => {
  it('não avisa quando o perfil está completo', () => {
    expect(profileIncompleteWarning(COMPLETO)).toBeNull();
  });

  it('nomeia o único campo que falta', () => {
    const aviso = profileIncompleteWarning({ ...COMPLETO, avatarUrl: null });
    expect(aviso).toContain('falta foto');
  });

  it('usa "e" antes do último quando faltam vários', () => {
    const aviso = profileIncompleteWarning({ ...COMPLETO, courseId: null, campusId: null });
    expect(aviso).toContain('curso e campus');
  });

  it('lista os quatro num perfil recém-criado', () => {
    const aviso = profileIncompleteWarning({});
    expect(aviso).toContain('nome, foto, curso e campus');
  });
});

describe('isValidPhone', () => {
  it.each(['11987654321', '(11) 98765-4321', '11 3256-7890', '1132567890'])(
    'aceita %s',
    (phone) => {
      expect(isValidPhone(phone)).toBe(true);
    },
  );

  it.each([
    ['curto demais', '119876543'],
    ['longo demais', '119876543210'],
    ['DDD inválido', '09987654321'],
    ['celular de 11 dígitos sem o 9', '11887654321'],
    ['vazio', ''],
    ['só letras', 'telefone'],
  ])('recusa %s', (_label, phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });
});

describe('formatPhone', () => {
  it.each([
    ['11987654321', '(11) 98765-4321'],
    ['1132567890', '(11) 3256-7890'],
    ['11', '(11'],
    ['', ''],
  ])('formata %s como %s', (entrada, esperado) => {
    expect(formatPhone(entrada)).toBe(esperado);
  });

  it('ignora dígitos além do 11º', () => {
    expect(formatPhone('11987654321999')).toBe('(11) 98765-4321');
  });
});

describe('validateProfileForm', () => {
  it('não acusa erro num perfil válido', () => {
    expect(validateProfileForm(COMPLETO)).toEqual([]);
  });

  it('acusa os quatro obrigatórios de uma vez', () => {
    const errors = validateProfileForm({});
    expect(errors.map((e) => e.field)).toEqual(['fullName', 'avatar', 'course', 'campus']);
  });

  it('recusa nome curto demais', () => {
    const errors = validateProfileForm({ ...COMPLETO, fullName: 'Jo' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('fullName');
  });

  it('não reclama de telefone em branco, porque é opcional', () => {
    expect(validateProfileForm({ ...COMPLETO, phone: '' })).toEqual([]);
  });

  it('reclama de telefone preenchido e inválido', () => {
    const errors = validateProfileForm({ ...COMPLETO, phone: '123' });
    expect(errors.map((e) => e.field)).toEqual(['phone']);
  });

  it('recusa bio acima do limite', () => {
    const errors = validateProfileForm({ ...COMPLETO, bio: 'x'.repeat(281) });
    expect(errors.map((e) => e.field)).toEqual(['bio']);
  });
});
