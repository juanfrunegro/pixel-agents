import { describe, expect, it } from 'vitest';

import {
  ESCENARIO_FILA,
  SALA_CAFETERIA,
  SALA_PRESENTACIONES,
} from '../../core/src/salasComunes.js';
import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character, PlacedFurniture, Seat } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';
import {
  _reiniciarBases,
  baseDe,
  gentePorProyecto,
  REINTENTO_BASE_MS,
  salasConGente,
  tickPersonal,
} from '../src/personal/ambiente.js';
import { luzDelDia, NOCHE, tramosOscuros } from '../src/personal/luces.js';
import { elegirPunto, puntosDePresentacion } from '../src/personal/lugares.js';
import { alMensaje, cupoPorCuenta, textoCupo } from '../src/personal/personal.js';
import {
  cargarPizarra,
  cerrarMenuSala,
  cerrarPizarra,
  clicPersonal,
  estadoPizarra,
  grilla,
  marcoPizarra,
  oficinaEn,
} from '../src/personal/pizarra.js';

const ahora = 1_790_000_000_000;

function personaje(id: number, cambios: Partial<Character> = {}): Character {
  return {
    id,
    state: CharacterState.IDLE,
    seatId: null,
    seatTimer: 0,
    frame: 0,
    frameTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    isActive: false,
    currentTool: null,
    tileCol: 0,
    tileRow: 0,
    ...cambios,
  } as Character;
}

function silla(uid: string, col: number, row: number, assigned = false): [string, Seat] {
  return [uid, { uid, seatCol: col, seatRow: row, facingDir: Direction.UP, assigned }];
}

function oficina(
  chars: Character[],
  seats: Array<[string, Seat]>,
  zonas: Record<string, string>,
  layout: { cols: number; areaTiles: Array<string | null>; furniture?: PlacedFurniture[] } = {
    cols: 1,
    areaTiles: [],
  },
): OfficeState {
  return {
    characters: new Map(chars.map((c) => [c.id, c])),
    seats: new Map(seats),
    seatZone: (uid: string) => zonas[uid] ?? null,
    sendToSeat: () => undefined,
    getLayout: () => ({ furniture: [], ...layout }),
    tileMap: [],
    blockedTiles: new Set<string>(),
    walkableTiles: [{ col: 9, row: 9 }],
  } as unknown as OfficeState;
}

/** Plano de 10x8 con una sala Presentaciones de 9 columnas (1..9) y 7 filas de piso (1..7). */
function planoPresentaciones(): { cols: number; areaTiles: Array<string | null> } {
  const cols = 11;
  const areaTiles: Array<string | null> = new Array(cols * 9).fill(null);
  for (let r = 1; r <= 7; r++)
    for (let c = 1; c <= 9; c++) areaTiles[r * cols + c] = SALA_PRESENTACIONES;
  return { cols, areaTiles };
}

describe('tanda 3 · arreglo A: quien presenta', () => {
  it('se para en el escenario: centrado, en el piso, mirando al público y lejos de la pared', () => {
    const p = puntosDePresentacion(planoPresentaciones(), () => true);
    expect(p[0]).toMatchObject({
      col: 5,
      row: 1 + ESCENARIO_FILA,
      facingDir: Direction.DOWN,
      prioridad: 0,
    });
    // La tarjeta (unas 2 filas arriba de la cabeza) queda dentro de la sala.
    expect(p[0].row - 3).toBeGreaterThanOrEqual(1);
    // Dos lugares más a los costados para cuando hay más de uno; las sillas, después.
    expect(p.slice(1).map((x) => [x.col, x.prioridad])).toEqual([
      [3, 1],
      [7, 1],
    ]);
  });

  it('elige el centro aunque venga de un costado; si está ocupado, un costado', () => {
    const p = puntosDePresentacion(planoPresentaciones(), () => true);
    expect(elegirPunto(p, 'presentacion', { col: 1, row: 1 }, new Set())).toMatchObject({ col: 5 });
    expect(elegirPunto(p, 'presentacion', { col: 1, row: 1 }, new Set(['5,4']))).toMatchObject({
      col: 3,
    });
  });

  it('sin escenario caminable usa las sillas de la sala', () => {
    const sillas = [
      {
        lugar: 'presentacion' as const,
        col: 2,
        row: 6,
        facingDir: Direction.UP,
        area: SALA_PRESENTACIONES,
        sentado: true,
      },
    ];
    const p = puntosDePresentacion(planoPresentaciones(), () => false, sillas);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ col: 2, row: 6, prioridad: 2 });
  });
});

describe('tanda 3 · arreglo B: escritorio de un sub-agente', () => {
  it('toma prestado el escritorio de una sesión que descansa en la cafetería (los sin dueño primero)', () => {
    _reiniciarBases();
    const padre = personaje(400, { seatId: 'a', isActive: true });
    const descansa = personaje(401, { seatId: 'b', lugar: 'cafeteria' });
    const sub = personaje(-400, { isSubagent: true, parentAgentId: 400, isActive: true });
    const os = oficina([padre, descansa, sub], [silla('a', 1, 1, true), silla('b', 2, 1, true)], {
      a: 'ERP',
      b: 'ERP',
    });
    expect(baseDe(os, sub, ahora)).toMatchObject({ col: 2, row: 1, sentado: true, silla: 'b' });
    // Si además hay uno sin dueño, ese gana aunque esté más lejos.
    const os2 = oficina(
      [padre, descansa, sub],
      [silla('a', 1, 1, true), silla('b', 2, 1, true), silla('c', 6, 1)],
      { a: 'ERP', b: 'ERP', c: 'ERP' },
    );
    expect(baseDe(os2, sub, ahora).silla).toBe('c');
  });

  it('cuando vuelve el dueño, el sub-agente se muda', () => {
    _reiniciarBases();
    const padre = personaje(410, { seatId: 'a', isActive: true, currentTool: 'Task' });
    const dueno = personaje(411, { seatId: 'b', lugar: 'cafeteria' });
    const sub = personaje(-410, { isSubagent: true, parentAgentId: 410, isActive: true });
    const os = oficina([padre, dueno, sub], [silla('a', 1, 1, true), silla('b', 2, 1, true)], {
      a: 'ERP',
      b: 'ERP',
    });
    tickPersonal(os, ahora);
    expect(sub.destino).toMatchObject({ seatCol: 2, seatRow: 1, sentado: true });
    // Vuelve a trabajar: sale de la cafetería hacia su escritorio.
    dueno.isActive = true;
    dueno.currentTool = 'Edit';
    tickPersonal(os, ahora + 100);
    expect(sub.destino).toMatchObject({ seatCol: 9, seatRow: 9 });
  });

  it('si quedó en el piso porque el padre todavía no tenía silla, lo reintenta', () => {
    _reiniciarBases();
    const padre = personaje(420, { isActive: true });
    const sub = personaje(-420, {
      isSubagent: true,
      parentAgentId: 420,
      isActive: true,
      tileCol: 4,
      tileRow: 4,
    });
    const os = oficina([padre, sub], [silla('a', 1, 1, true), silla('b', 3, 1)], {
      a: 'ERP',
      b: 'ERP',
    });
    tickPersonal(os, ahora);
    expect(sub.destino).toMatchObject({ seatCol: 4, seatRow: 4 });
    padre.seatId = 'a';
    tickPersonal(os, ahora + REINTENTO_BASE_MS - 1);
    expect(sub.destino).toMatchObject({ seatCol: 4, seatRow: 4 });
    tickPersonal(os, ahora + REINTENTO_BASE_MS + 1);
    expect(sub.destino).toMatchObject({ seatCol: 3, seatRow: 1, sentado: true });
  });
});

describe('tanda 3 · luz según la hora', () => {
  it('día normal, atardecer cálido, noche oscura, amanecer que aclara', () => {
    expect(luzDelDia(12)).toEqual({ oscuridad: 0, calidez: 0 });
    expect(luzDelDia(18.5).oscuridad).toBe(0);
    expect(luzDelDia(18.5).calidez).toBeGreaterThan(0);
    expect(luzDelDia(19.5).oscuridad).toBeCloseTo(NOCHE / 2);
    expect(luzDelDia(22).oscuridad).toBe(NOCHE);
    expect(luzDelDia(3).oscuridad).toBe(NOCHE);
    expect(luzDelDia(7.5).oscuridad).toBeCloseTo(NOCHE / 2);
    expect(luzDelDia(24 + 12)).toEqual(luzDelDia(12));
  });

  it('sin saltos entre tramos (suave en la segunda pantalla)', () => {
    for (const h of [7, 8, 18, 19, 20]) {
      const a = luzDelDia(h - 1e-6);
      const b = luzDelDia(h);
      expect(Math.abs(a.oscuridad - b.oscuridad)).toBeLessThan(1e-3);
      expect(Math.abs(a.calidez - b.calidez)).toBeLessThan(1e-3);
    }
  });

  it('de noche quedan iluminadas solo las salas prendidas', () => {
    // Fila 0: A A B ; fila 1: (pasillo) A null
    const areaTiles = ['A', 'A', 'B', null, 'A', null];
    const tramos = tramosOscuros(areaTiles, 3, 2, new Set(['A']));
    expect(tramos).toEqual([
      { row: 0, col: 2, hasta: 3 },
      { row: 1, col: 0, hasta: 1 },
      { row: 1, col: 2, hasta: 3 },
    ]);
    expect(tramosOscuros(areaTiles, 3, 2, new Set())).toHaveLength(2);
  });

  it('se prende la sala donde alguien trabaja; no la cafetería ni la de un dormido', () => {
    alMensaje({ type: 'agentInfo', id: 432, dormidoHasta: 0 });
    const lee = personaje(430, { isActive: true, currentTool: 'Read', tileCol: 0, tileRow: 0 });
    const cafe = personaje(431, { isActive: false, lugar: 'cafeteria', tileCol: 1, tileRow: 0 });
    const duerme = personaje(432, { isActive: true, currentTool: 'Bash', tileCol: 2, tileRow: 0 });
    const os = oficina(
      [lee, cafe, duerme],
      [],
      {},
      {
        cols: 3,
        areaTiles: ['Biblioteca', SALA_CAFETERIA, 'ERP'],
      },
    );
    expect([...salasConGente(os, ahora)]).toEqual(['Biblioteca']);
    alMensaje({ type: 'agentClosed', id: 432 });
  });
});

describe('tanda 3 · pizarra del Brain y menú de oficina', () => {
  const furniture = [
    { uid: 'brain-pizarra-1', type: 'WHITEBOARD', col: 10, row: 4 },
    { uid: 'brain-pizarra-2', type: 'WHITEBOARD', col: 12, row: 4 },
    { uid: 'brain-reloj', type: 'CLOCK', col: 20, row: 4 },
  ] as PlacedFurniture[];

  it('la pizarra es la caja de sus dos pizarrones', () => {
    expect(marcoPizarra(furniture, () => ({ w: 2, h: 2 }))).toEqual({
      col: 10,
      row: 4,
      w: 4,
      h: 2,
    });
  });

  it('clic en la pizarra abre el panel; en una oficina, su menú; en una sala compartida, nada', () => {
    marcoPizarra(furniture, () => ({ w: 2, h: 2 }));
    const cols = 4;
    // Fila 0: pared (sin área); fila 1: Chaina Chaina Cafetería Otros
    const areaTiles = [null, null, null, null, 'Chaina', 'Chaina', SALA_CAFETERIA, 'Otros'];
    expect(clicPersonal({ cols: 40, areaTiles: [] }, { col: 11, row: 5 }, 0, 0)).toBe(true);
    expect(estadoPizarra().abierta).toBe(true);
    cerrarPizarra();
    // El piso y el nombre de la sala (en la pared de arriba) abren el menú de la oficina.
    expect(clicPersonal({ cols, areaTiles }, { col: 0, row: 1 }, 50, 60)).toBe(true);
    expect(estadoPizarra().menu).toEqual({ sala: 'Chaina', x: 50, y: 60 });
    cerrarMenuSala();
    expect(oficinaEn(areaTiles, cols, 1, 0)).toBe('Chaina');
    expect(oficinaEn(areaTiles, cols, 2, 1)).toBeNull();
    expect(oficinaEn(areaTiles, cols, 3, 1)).toBeNull();
    expect(clicPersonal({ cols, areaTiles }, { col: 2, row: 1 }, 0, 0)).toBe(false);
  });

  it('grilla: una columna con pocos proyectos, dos filas con más', () => {
    expect(grilla(3)).toEqual({ columnas: 1, filas: 3 });
    expect(grilla(7)).toEqual({ columnas: 4, filas: 2 });
    expect(grilla(0)).toEqual({ columnas: 1, filas: 1 });
  });

  it('quién trabaja en cada proyecto: sesiones en uso, por la oficina de su silla', () => {
    const trabaja = personaje(440, { seatId: 'a', isActive: true, currentTool: 'Edit' });
    const descansa = personaje(441, { seatId: 'b', isActive: false, lugar: 'cafeteria' });
    const sub = personaje(-440, { isSubagent: true, parentAgentId: 440, isActive: true });
    const os = oficina([trabaja, descansa, sub], [silla('a', 1, 1, true), silla('b', 2, 1, true)], {
      a: 'Poker',
      b: 'Poker',
    });
    expect([...gentePorProyecto(os, ahora)]).toEqual([['Poker', [440]]]);
  });

  it('pide los pendientes con el token de la URL y guarda las filas', async () => {
    const g = globalThis as unknown as { window?: unknown };
    const antes = g.window;
    g.window = { location: { search: '?token=abc' } };
    let pedida = '';
    await cargarPizarra(async (url) => {
      pedida = url;
      return { ok: true, json: async () => ({ proyectos: [{ sala: 'ERP', abiertos: 13 }] }) };
    });
    expect(pedida).toBe('/pizarra?token=abc');
    expect(estadoPizarra().filas).toEqual([{ sala: 'ERP', abiertos: 13 }]);
    await cargarPizarra(async () => ({ ok: false, json: async () => ({}) }));
    expect(estadoPizarra().error).toMatch(/No se pudieron leer/);
    expect(estadoPizarra().filas).toHaveLength(1); // conserva lo último que leyó
    g.window = antes;
  });
});

describe('tanda 3 · cupo por cuenta', () => {
  it('OK, o sin cupo hasta la hora de vuelta de la cuenta; vuelve a OK solo', () => {
    const hasta = Math.floor(Date.now() / 1000) + 3600;
    alMensaje({ type: 'agentInfo', id: 450, wsl: true, dormidoHasta: hasta });
    alMensaje({ type: 'agentInfo', id: 451, wsl: false, dormidoHasta: null });
    const c = cupoPorCuenta();
    expect(c.wsl).toEqual({ sinCupo: true, hasta: hasta * 1000 });
    expect(c.windows.sinCupo).toBe(false);
    expect(textoCupo(c.windows)).toBe('OK');
    expect(textoCupo(c.wsl)).toMatch(/^sin cupo hasta \d\d:\d\d$/);
    expect(textoCupo({ sinCupo: true, hasta: null })).toBe('sin cupo');
    expect(cupoPorCuenta(hasta * 1000 + 1).wsl.sinCupo).toBe(false);
    // Una sesión cerrada ya no cuenta.
    alMensaje({ type: 'agentClosed', id: 450 });
    expect(cupoPorCuenta().wsl.sinCupo).toBe(false);
  });
});
