import { beforeEach, describe, expect, it } from 'vitest';

import { _reiniciarCarteles, salaEn, salasDelPlano } from '../src/personal/carteles.js';

// 6 columnas x 4 filas: pared arriba (fila 0), ERP a la izquierda, pasillo (null) en la columna 3, Brain a la derecha.
const N = null;
const plano: Array<string | null> = [
  N,
  N,
  N,
  N,
  N,
  N,
  'ERP',
  'ERP',
  'ERP',
  N,
  'Brain',
  'Brain',
  'ERP',
  'ERP',
  'ERP',
  N,
  'Brain',
  'Brain',
  N,
  N,
  N,
  N,
  N,
  N,
];

describe('personal: carteles de las salas', () => {
  beforeEach(() => _reiniciarCarteles());

  it('una sala por nombre, con su caja y sus tramos', () => {
    const salas = salasDelPlano(plano, 6, 4);
    const erp = salas.find((s) => s.label === 'ERP');
    expect(erp).toMatchObject({ minCol: 0, maxCol: 2, minRow: 1 });
    expect(erp?.tramos).toEqual([
      { row: 1, c0: 0, c1: 2 },
      { row: 2, c0: 0, c1: 2 },
    ]);
    expect(salas.map((s) => s.label).sort()).toEqual(['Brain', 'ERP']);
  });

  it('se recalcula solo si cambia el plano', () => {
    expect(salasDelPlano(plano, 6, 4)).toBe(salasDelPlano(plano, 6, 4));
    expect(salasDelPlano([...plano], 6, 4)).not.toBe(salasDelPlano(plano, 6, 4));
  });

  it('la sala bajo el mouse: null en el pasillo o fuera del plano', () => {
    expect(salaEn(plano, 6, { col: 1, row: 2 })).toBe('ERP');
    expect(salaEn(plano, 6, { col: 3, row: 1 })).toBeNull();
    expect(salaEn(plano, 6, { col: 9, row: 1 })).toBeNull();
    expect(salaEn(plano, 6, null)).toBeNull();
  });
});
