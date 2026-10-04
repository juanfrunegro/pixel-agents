import { beforeEach, describe, expect, it } from 'vitest';

import {
  _reiniciarCarteles,
  globitoJuntoAlNombre,
  renderCarteles,
  salaEn,
  salasDelPlano,
} from '../src/personal/carteles.js';
import { CARTEL_WHATSAPP } from '../src/personal/colores.js';
import { setWhatsappProyectos } from '../src/personal/pizarra.js';

/** Canvas falso: anota cada fillRect con su color. */
function lienzo() {
  const rects: Array<{ color: string; x: number; y: number }> = [];
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText() {},
    fillRect(x: number, y: number) {
      rects.push({ color: String(ctx.fillStyle), x, y });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

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

  describe('globito del aviso por WhatsApp', () => {
    beforeEach(() => setWhatsappProyectos([]));

    const verdes = () => {
      const { ctx, rects } = lienzo();
      renderCarteles(ctx, plano, [], 6, 4, 0, 0, 4, null);
      return rects.filter((r) => r.color === CARTEL_WHATSAPP);
    };

    it('sin aviso prendido, ningún cartel lo lleva', () => {
      expect(verdes()).toHaveLength(0);
    });

    it('con el aviso de ERP prendido, solo el cartel de ERP lleva el globito', () => {
      setWhatsappProyectos(['ERP']);
      const v = verdes();
      expect(v.length).toBeGreaterThan(0);
      // Todo el globito cae sobre las columnas de ERP (0 a 2), no sobre las del Brain.
      const s = 16 * 4;
      for (const r of v) expect(r.x).toBeLessThan(3 * s);
    });

    it('con "Mostrar áreas" prendido va a la derecha del nombre, solo si ese proyecto lo pidió', () => {
      setWhatsappProyectos(['ERP', 'Libre 3']);
      for (const [label, espera] of [
        ['ERP', true],
        ['Brain', false],
        ['Libre 3', false],
      ] as const) {
        const { ctx, rects } = lienzo();
        globitoJuntoAlNombre(ctx, label, 200, 50, 18);
        const v = rects.filter((r) => r.color === CARTEL_WHATSAPP);
        expect(v.length > 0).toBe(espera);
        for (const r of v) expect(r.x).toBeGreaterThan(200);
      }
    });

    it('ignora lo que no es una lista de nombres', () => {
      setWhatsappProyectos('ERP');
      expect(verdes()).toHaveLength(0);
    });
  });
});
