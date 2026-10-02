import { describe, expect, it } from 'vitest';

import {
  SALA_BIBLIOTECA,
  SALA_CAFETERIA,
  SALA_PRESENTACIONES,
  SALA_REUNIONES,
} from '../../core/src/salasComunes.js';
import { createCharacter, updateCharacter } from '../src/office/engine/characters.js';
import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Seat, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';
import { moverSegunActividad, PERMANENCIA_MS } from '../src/personal/ambiente.js';
import { actividadDe, elegirPunto, puntosDeLugares } from '../src/personal/lugares.js';

describe('lugar según la actividad', () => {
  it.each([
    ['Read', 'biblioteca'],
    ['Grep', 'biblioteca'],
    ['Glob', 'biblioteca'],
    ['WebFetch', 'biblioteca'],
    ['WebSearch', 'biblioteca'],
    ['mcp__supabase__list_tables', 'biblioteca'],
    ['mcp__github__search_code', 'biblioteca'],
    ['TodoWrite', 'pizarron'],
    ['EnterPlanMode', 'pizarron'],
    ['Planning', 'pizarron'],
    ['Edit', null],
    ['Write', null],
    ['Bash', null],
    ['mcp__supabase__apply_migration', null],
    [null, null],
  ])('%s → %s', (tool, lugar) => {
    expect(actividadDe(tool)).toBe(lugar);
  });
});

// Sala de 6x5: fila 0 pared con una biblioteca colgada (2x2 en filas -1..0), pizarrón a la derecha.
const huellas: Record<string, { w: number; h: number }> = {
  DOUBLE_BOOKSHELF: { w: 2, h: 2 },
  WHITEBOARD: { w: 2, h: 2 },
  DESK_FRONT: { w: 3, h: 2 },
};
const plano = {
  cols: 6,
  furniture: [
    { uid: 'b', type: 'DOUBLE_BOOKSHELF', col: 0, row: -1 },
    { uid: 'w', type: 'WHITEBOARD', col: 4, row: -1 },
    { uid: 'd', type: 'DESK_FRONT', col: 1, row: 2 },
  ],
  areaTiles: Array(30).fill('ERP') as Array<string | null>,
};
const caminable = (c: number, r: number) => c >= 0 && c < 6 && r >= 1 && r < 5;

describe('atril y mesa contable: de qué se trata la tarea', () => {
  it.each([
    ['Artifact', 'Using Artifact', undefined, 'atril'],
    ['mcp__figma__get_design', 'Using mcp__figma__get_design', undefined, 'atril'],
    ['Skill', 'Skill: ui-ux-pro-max', undefined, 'atril'],
    ['Edit', 'Editing globals.css', undefined, 'atril'],
    ['Skill', 'Skill: blueprint', undefined, 'pizarron'],
    ['Edit', 'Editing cobranzas.ts', 'ERP', 'contable'],
    ['Read', 'Reading conciliacion.md', 'ERP', 'contable'],
    ['Bash', 'Running: python facturas.py', undefined, 'contable'],
    ['Bash', 'Running: python resumen.py', 'Finanzas', 'contable'],
    ['Bash', 'Running: npm test', 'ERP', null],
    ['Edit', 'Editing page.tsx', 'Finanzas', null],
    ['Read', 'Reading page.tsx', 'ERP', 'biblioteca'],
  ])('%s "%s" (%s) → %s', (tool, status, proyecto, lugar) => {
    expect(actividadDe(tool, status, proyecto)).toBe(lugar);
  });
});

describe('puntos de cada lugar', () => {
  const puntos = puntosDeLugares(plano, (t) => huellas[t], caminable);

  it('el tile de adelante de cada mueble, mirando hacia él', () => {
    expect(puntos.filter((p) => p.lugar === 'biblioteca').map((p) => [p.col, p.row])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(puntos.filter((p) => p.lugar === 'pizarron').map((p) => [p.col, p.row])).toEqual([
      [4, 1],
      [5, 1],
    ]);
    expect(puntos.every((p) => p.facingDir === Direction.UP && p.area === 'ERP')).toBe(true);
  });

  it('sin salas compartidas en el plano, elige el libre más cercano de cualquier sala', () => {
    expect(elegirPunto(puntos, 'biblioteca', { col: 5, row: 4 }, new Set())).toMatchObject({
      col: 1,
      row: 1,
    });
    expect(elegirPunto(puntos, 'biblioteca', { col: 5, row: 4 }, new Set(['1,1']))).toMatchObject({
      col: 0,
      row: 1,
    });
    expect(
      elegirPunto(puntos, 'biblioteca', { col: 0, row: 1 }, new Set(['0,1', '1,1'])),
    ).toBeNull();
  });

  it('con salas compartidas va a la suya aunque tenga un mueble igual más cerca', () => {
    const comun = { ...puntos[0], col: 30, row: 1, area: SALA_BIBLIOTECA };
    expect(elegirPunto([...puntos, comun], 'biblioteca', { col: 0, row: 1 }, new Set())).toBe(
      comun,
    );
    // El pizarrón de planificar es el de Reuniones; el de Presentaciones no cuenta.
    const reunion = { ...puntos[2], col: 40, area: SALA_REUNIONES };
    const presentacion = { ...puntos[2], col: 5, area: SALA_PRESENTACIONES };
    expect(elegirPunto([presentacion, reunion], 'pizarron', { col: 5, row: 1 }, new Set())).toBe(
      reunion,
    );
  });

  it('en la cafetería prefiere un asiento libre aunque el piso quede más cerca', () => {
    const asiento = {
      lugar: 'cafeteria' as const,
      col: 9,
      row: 1,
      facingDir: Direction.DOWN,
      area: SALA_CAFETERIA,
      sentado: true,
      prioridad: 0,
    };
    const piso = { ...asiento, col: 1, sentado: false, prioridad: 1 };
    expect(elegirPunto([piso, asiento], 'cafeteria', { col: 0, row: 1 }, new Set())).toBe(asiento);
    expect(elegirPunto([piso, asiento], 'cafeteria', { col: 0, row: 1 }, new Set(['9,1']))).toBe(
      piso,
    );
  });
});

describe('el agente camina a su lugar y vuelve', () => {
  // 6x5 todo piso; silla en (2,4) mirando arriba.
  const tileMap: TileTypeVal[][] = Array.from({ length: 5 }, () => Array(6).fill(TileType.FLOOR_1));
  const silla: Seat = { uid: 's', seatCol: 2, seatRow: 4, facingDir: Direction.UP, assigned: true };
  const seats = new Map([['s', silla]]);
  const correr = (ch: ReturnType<typeof createCharacter>, segundos: number) => {
    for (let t = 0; t < segundos; t += 0.05)
      updateCharacter(ch, 0.05, [], seats, tileMap, new Set());
  };

  it('con destino va ahí y trabaja mirando al mueble; sin destino vuelve a la silla', () => {
    const ch = createCharacter(1, 0, 's', silla);
    ch.isActive = true;
    ch.destino = { seatCol: 0, seatRow: 1, facingDir: Direction.UP };
    correr(ch, 5);
    expect([ch.tileCol, ch.tileRow, ch.state, ch.dir]).toEqual([
      0,
      1,
      CharacterState.TYPE,
      Direction.UP,
    ]);
    ch.destino = undefined;
    correr(ch, 5);
    expect([ch.tileCol, ch.tileRow, ch.state]).toEqual([2, 4, CharacterState.TYPE]);
  });

  it('si no hay camino al destino lo abandona y se queda en su silla (sin parpadear)', () => {
    const ch = createCharacter(2, 0, 's', silla);
    ch.isActive = true;
    ch.destino = { seatCol: 9, seatRow: 9, facingDir: Direction.UP }; // fuera del mapa
    correr(ch, 1);
    expect(ch.destino).toBeUndefined();
    expect([ch.tileCol, ch.tileRow, ch.state]).toEqual([2, 4, CharacterState.TYPE]);
  });
});

describe('no va y viene con cada herramienta', () => {
  it('se queda al menos PERMANENCIA_MS en un lugar antes de cambiar', () => {
    const ch = createCharacter(3, 0, null, null);
    ch.isActive = true;
    const os = {
      characters: new Map([[3, ch]]),
      seats: new Map(),
      getLayout: () => ({ ...plano, rows: 5, tiles: [], version: 1 }),
      tileMap: Array.from({ length: 5 }, () => Array(6).fill(TileType.FLOOR_1)),
      blockedTiles: new Set<string>(),
      walkableTiles: [],
      seatZone: () => 'ERP',
    } as unknown as OfficeState;
    ch.tileCol = 3;
    ch.tileRow = 4;
    ch.currentTool = 'Read';
    expect(moverSegunActividad(os, ch, 0)).toBe(true);
    expect(ch.lugar).toBe('biblioteca');
    ch.currentTool = 'Edit';
    expect(moverSegunActividad(os, ch, 1000)).toBe(false); // todavía no
    expect(moverSegunActividad(os, ch, PERMANENCIA_MS + 1)).toBe(true);
    expect(ch.lugar).toBeNull();
    expect(ch.destino).toBeUndefined();
    ch.currentTool = null; // pensando: se queda donde está
    expect(moverSegunActividad(os, ch, 3 * PERMANENCIA_MS)).toBe(false);
  });
});
