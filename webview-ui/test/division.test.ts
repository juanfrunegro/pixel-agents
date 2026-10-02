import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../src/office/types.js';
import {
  cajaDeSalas,
  encuadre,
  pantallaDividida,
  salasPorLado,
  setPantallaDividida,
} from '../src/personal/division.js';

const TODAS = ['Brain', 'Chaina', 'ERP', 'Otros'];

describe('pantalla dividida: qué salas va a cada lado', () => {
  it('cada lado muestra las salas donde tiene agentes', () => {
    expect(
      salasPorLado(
        [
          { lado: 'windows', sala: 'Chaina' },
          { lado: 'windows', sala: 'Brain' },
          { lado: 'wsl', sala: 'ERP' },
        ],
        TODAS,
      ),
    ).toEqual({ windows: ['Brain', 'Chaina'], wsl: ['ERP'] });
  });

  it('sin nadie en WSL muestra la sala del ERP; sin nadie en Windows, todas las demás', () => {
    expect(salasPorLado([], TODAS)).toEqual({
      windows: ['Brain', 'Chaina', 'Otros'],
      wsl: ['ERP'],
    });
  });

  it('una sala con agentes de los dos lados aparece en las dos mitades', () => {
    expect(
      salasPorLado(
        [
          { lado: 'windows', sala: 'ERP' },
          { lado: 'wsl', sala: 'ERP' },
        ],
        TODAS,
      ),
    ).toEqual({ windows: ['ERP'], wsl: ['ERP'] });
  });
});

describe('pantalla dividida: encuadre', () => {
  // Plano 6x5 con la sala "A" en las columnas 2-3, filas 3-4.
  const cols = 6;
  const rows = 5;
  const areaTiles = Array<string | null>(cols * rows).fill(null);
  for (const [c, r] of [
    [2, 3],
    [3, 3],
    [2, 4],
    [3, 4],
  ])
    areaTiles[r * cols + c] = 'A';

  it('la caja cubre la sala con aire y la pared de arriba, sin salirse del plano', () => {
    expect(cajaDeSalas(['A'], areaTiles, cols, rows)).toEqual({
      col0: 1,
      row0: 0,
      col1: 4,
      row1: 4,
    });
    expect(cajaDeSalas(['Nada'], areaTiles, cols, rows)).toEqual({
      col0: 0,
      row0: 0,
      col1: 5,
      row1: 4,
    });
  });

  it('zoom entero y el centro de la caja en el centro de la vista', () => {
    const caja = { col0: 1, row0: 0, col1: 4, row1: 4 }; // 4x5 tiles = 64x80 px
    const { zoom, panX, panY } = encuadre(caja, 400, 400, cols, rows);
    expect(zoom).toBe(5); // min(400/64, 400/80) = 5
    // Mismo cálculo que mapOffset del renderer: el centro de la caja cae en el centro de la vista.
    const offsetX = Math.floor((400 - cols * TILE_SIZE * zoom) / 2) + Math.round(panX);
    const offsetY = Math.floor((400 - rows * TILE_SIZE * zoom) / 2) + Math.round(panY);
    expect(offsetX + 3 * TILE_SIZE * zoom).toBe(200);
    expect(offsetY + 2.5 * TILE_SIZE * zoom).toBe(200);
    expect(encuadre(caja, 10, 10, cols, rows).zoom).toBe(1); // nunca menos de 1
  });
});

describe('pantalla dividida: se recuerda', () => {
  it('se prende y se apaga aunque no haya localStorage (tests en node)', () => {
    setPantallaDividida(true);
    expect(pantallaDividida()).toBe(true);
    setPantallaDividida(false);
    expect(pantallaDividida()).toBe(false);
  });
});
