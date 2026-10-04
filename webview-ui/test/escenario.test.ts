import { describe, expect, it } from 'vitest';

import { escenarioDe } from '../src/personal/escenario.js';
import { PRESENTACION_MAX_MS, PRESENTACION_MS, turnosEscenario } from '../src/personal/personal.js';

describe('personal: turnos del escenario de Presentaciones', () => {
  it('uno solo: arriba mientras dura su aviso, después baja', () => {
    const avisos = [{ id: 1, desde: 1000, ms: 5000 }];
    expect(turnosEscenario(avisos, 999).get(1)).toBeUndefined();
    expect(turnosEscenario(avisos, 1000).get(1)).toBe('escenario');
    expect(turnosEscenario(avisos, 5999).get(1)).toBe('escenario');
    expect(turnosEscenario(avisos, 6000).get(1)).toBeUndefined();
  });

  it('dos a la vez: uno por vez en orden de llegada, el otro espera en la fila', () => {
    const avisos = [
      { id: 2, desde: 2000, ms: 4000 },
      { id: 1, desde: 1000, ms: 5000 },
    ];
    const t = turnosEscenario(avisos, 3000);
    expect(t.get(1)).toBe('escenario');
    expect(t.get(2)).toBe('fila');
    // El 1 termina a los 6000: sube el 2 hasta 6000 + 4000.
    expect(turnosEscenario(avisos, 6000).get(2)).toBe('escenario');
    expect(turnosEscenario(avisos, 6000).get(1)).toBeUndefined();
    expect(turnosEscenario(avisos, 10_000).get(2)).toBeUndefined();
  });

  it('sin duración usa PRESENTACION_MS; una duración enorme se recorta', () => {
    expect(turnosEscenario([{ id: 1, desde: 0, ms: null }], PRESENTACION_MS - 1).get(1)).toBe(
      'escenario',
    );
    expect(
      turnosEscenario([{ id: 1, desde: 0, ms: null }], PRESENTACION_MS).get(1),
    ).toBeUndefined();
    expect(
      turnosEscenario([{ id: 1, desde: 0, ms: 10 * 60_000 }], PRESENTACION_MAX_MS).get(1),
    ).toBeUndefined();
  });
});

describe('personal: dónde va el escenario', () => {
  it('centrado en Presentaciones, en la fila del escenario, sin salirse de la sala', () => {
    // Sala de 9 columnas (1..9) y 4 filas (1..4); pared en la fila 0.
    const cols = 11;
    const rows = 6;
    const plano: Array<string | null> = Array.from({ length: cols * rows }, (_, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      return c >= 1 && c <= 9 && r >= 1 && r <= 4 ? 'Presentaciones' : null;
    });
    expect(escenarioDe(plano, cols, rows)).toEqual({ col: 5, row: 4, c0: 2, c1: 8 });
    expect(
      escenarioDe(
        plano.map(() => null),
        cols,
        rows,
      ),
    ).toBeNull();
  });
});
