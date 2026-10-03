import { describe, expect, it } from 'vitest';

import { resolverToken } from '../src/personal/tokenGuardado.js';

describe('token de la oficina guardado en la pestaña', () => {
  it('con token en la dirección: lo usa y lo guarda si es nuevo', () => {
    expect(resolverToken('?token=abc', null)).toEqual({
      token: 'abc',
      guardar: 'abc',
      search: null,
    });
    expect(resolverToken('?token=abc', 'abc')).toEqual({
      token: 'abc',
      guardar: null,
      search: null,
    });
    // Un token nuevo en la dirección reemplaza al guardado.
    expect(resolverToken('?token=nuevo', 'viejo')).toEqual({
      token: 'nuevo',
      guardar: 'nuevo',
      search: null,
    });
  });

  it('sin token en la dirección: repone el guardado sin perder lo demás', () => {
    expect(resolverToken('', 'abc')).toEqual({ token: 'abc', guardar: null, search: '?token=abc' });
    expect(resolverToken('?debug=1', 'abc')).toEqual({
      token: 'abc',
      guardar: null,
      search: '?debug=1&token=abc',
    });
  });

  it('sin token en ningún lado: no toca nada', () => {
    expect(resolverToken('', null)).toEqual({ token: null, guardar: null, search: null });
  });
});
