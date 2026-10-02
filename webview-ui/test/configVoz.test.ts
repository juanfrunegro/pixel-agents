import { describe, expect, it } from 'vitest';

import { CASOS_VOZ, configVozActual, setConfigVoz } from '../src/personal/configVoz.js';

describe('config del aviso por voz en el panel', () => {
  it('los cuatro casos en orden, con su texto', () => {
    expect(CASOS_VOZ.map((c) => c.texto)).toEqual([
      'Pregunta',
      'Permiso',
      'Termina con pregunta',
      'Te espera',
    ]);
  });

  it('lo que falta cuenta como prendido y solo false apaga', () => {
    setConfigVoz({ permiso: false, esperando: 'raro' });
    expect(configVozActual()).toEqual({
      pregunta: true,
      permiso: false,
      fin_pregunta: true,
      esperando: true,
    });
    setConfigVoz(null);
    expect(Object.values(configVozActual() ?? {})).toEqual([true, true, true, true]);
  });
});
