/** Cabina de Contratistas: lo que dice Orca se dibuja sentado en las sillas de la cabina. */
import { afterEach, describe, expect, it } from 'vitest';

import type { Seat } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';
import {
  _reiniciarContratistas,
  alMensajeContratistas,
  claveExterno,
  nombreContratista,
  personajesContratistas,
  setSillasContratistas,
} from '../src/personal/contratistas.js';
import { alMensaje } from '../src/personal/personal.js';

const silla = (uid: string, col: number, row: number): [string, Seat] => [
  uid,
  { uid, seatCol: col, seatRow: row, facingDir: Direction.UP, assigned: false },
];
const c = (motor: string, estado: string, proyecto = 'ERP') => ({
  motor,
  proyecto,
  workspace: 'main',
  estado,
  tarea: null,
  desde: null,
});

describe('cabina de Contratistas', () => {
  afterEach(() => _reiniciarContratistas());

  it('nombre de la persona sin el modelo; Gemini corre como Antigravity', () => {
    alMensaje({
      type: 'agentNamesLoaded',
      ceo: 'Juan',
      agentes: {},
      descartables: [],
      orden: ['Juan', 'Tomo'],
      externos: { pi: 'Tomo · Pi (DeepSeek)', antigravity: 'Lucho · Antigravity (Gemini)' },
    });
    expect(nombreContratista('pi')).toBe('Tomo · Pi');
    expect(claveExterno('gemini')).toBe('antigravity');
    expect(nombreContratista('gemini')).toBe('Lucho · Antigravity');
    expect(nombreContratista('cursor')).toBe('Cursor');
  });

  it('uno por silla, los que trabajan primero; sin sillas o sin lista, nadie', () => {
    alMensajeContratistas({
      type: 'contratistas',
      lista: [c('codex', 'done'), c('pi', 'working'), c('codex', 'waiting', 'Chaina')],
    });
    expect(personajesContratistas()).toEqual([]); // todavía sin sillas
    setSillasContratistas(
      new Map([
        silla('contratistas-silla-3-0', 1, 5),
        silla('contratistas-silla-0-0', 1, 2),
        silla('otra', 9, 9),
      ]),
    );
    const ps = personajesContratistas(0);
    expect(ps).toHaveLength(2);
    // Arriba (fila 2) el primero de la lista ordenada: uno que trabaja o espera.
    expect(ps[0].tileRow).toBe(2);
    expect(ps.every((p) => p.id <= -900_000)).toBe(true);
    alMensajeContratistas({ type: 'contratistas', lista: [] });
    expect(personajesContratistas()).toEqual([]);
  });

  it('el que trabaja tipea (cambia de cuadro); el que terminó queda quieto', () => {
    setSillasContratistas(
      new Map([silla('contratistas-silla-0-0', 1, 2), silla('contratistas-silla-0-4', 5, 2)]),
    );
    alMensajeContratistas({
      type: 'contratistas',
      lista: [c('pi', 'working'), c('codex', 'done')],
    });
    const a = personajesContratistas(0).map((p) => p.frame);
    const b = personajesContratistas(300).map((p) => p.frame);
    expect(a[0]).not.toBe(b[0]);
    expect(a[1]).toBe(0);
    expect(b[1]).toBe(0);
  });
});
