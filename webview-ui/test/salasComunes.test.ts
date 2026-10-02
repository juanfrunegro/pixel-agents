import { beforeEach, describe, expect, it } from 'vitest';

import { SALA_CAFETERIA, SALA_REUNIONES } from '../../core/src/salasComunes.js';
import { createCharacter, updateCharacter } from '../src/office/engine/characters.js';
import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character, Seat, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';
import { tickPersonal } from '../src/personal/ambiente.js';
import { _reiniciarConversaciones, alLanzarSub, hablando } from '../src/personal/burbujas.js';
import { enCafeteria, separarEtiquetas } from '../src/personal/etiquetas.js';
import { apagadoPorFiltro, filtroSistema, setFiltroSistema } from '../src/personal/filtro.js';
import { elegirPunto } from '../src/personal/lugares.js';
import { alMensaje, enUso, registrarSub, SIN_USO_MS } from '../src/personal/personal.js';
import {
  _reiniciarReuniones,
  CALENTAMIENTO_MS,
  DURACION_PROYECTO_MS,
  DURACION_SUB_MS,
  ENFRIAR_PAR_MS,
  ENFRIAR_PROYECTO_MS,
  ESPERA_LLEGADA_MS,
  reunionDe,
  reunir,
  sesionesQueSeCruzan,
} from '../src/personal/reuniones.js';

/*
 * Plano de prueba, 12x6 todo piso:
 *   columnas 0-3  ERP (escritorio s1 en 1,3 y s2 en 2,3)
 *   columnas 4-7  Cafetería (sillones c1 en 5,2 y c2 en 6,2)
 *   columnas 8-11 Reuniones (sillas r1 en 9,2 y r2 en 10,2)
 */
const COLS = 12;
const ROWS = 6;
const salaEn = (col: number) => (col < 4 ? 'ERP' : col < 8 ? SALA_CAFETERIA : SALA_REUNIONES);
const areaTiles = Array.from({ length: COLS * ROWS }, (_, i) => salaEn(i % COLS));

function oficina(personajes: Character[]): OfficeState {
  const seats = new Map<string, Seat>(
    (
      [
        ['s1', 1, 3, Direction.UP],
        ['s2', 2, 3, Direction.UP],
        ['c1', 5, 2, Direction.DOWN],
        ['c2', 6, 2, Direction.DOWN],
        ['r1', 9, 2, Direction.RIGHT],
        ['r2', 10, 2, Direction.LEFT],
      ] as const
    ).map(([uid, seatCol, seatRow, facingDir]) => [
      uid,
      { uid, seatCol, seatRow, facingDir, assigned: uid.startsWith('s') },
    ]),
  );
  const blocked = new Set([...seats.values()].map((s) => `${s.seatCol},${s.seatRow}`));
  const walkable: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) if (!blocked.has(`${c},${r}`)) walkable.push({ col: c, row: r });
  return {
    characters: new Map(personajes.map((p) => [p.id, p])),
    seats,
    seatZone: (uid: string) => {
      const s = seats.get(uid);
      return s ? salaEn(s.seatCol) : null;
    },
    getLayout: () => ({ furniture: [], cols: COLS, areaTiles }),
    tileMap: Array.from({ length: ROWS }, () => Array(COLS).fill(TileType.FLOOR_1)),
    blockedTiles: blocked,
    walkableTiles: walkable,
    sendToSeat: () => {},
  } as unknown as OfficeState;
}

function agente(id: number, seatId: string, cambios: Partial<Character> = {}): Character {
  const silla = { s1: [1, 3], s2: [2, 3] }[seatId as 's1' | 's2'];
  const ch = createCharacter(id, 0, seatId, {
    uid: seatId,
    seatCol: silla[0],
    seatRow: silla[1],
    facingDir: Direction.UP,
    assigned: true,
  });
  ch.folderName = 'ERP';
  Object.assign(ch, cambios);
  return ch;
}

const T0 = 5_000_000;

beforeEach(() => {
  _reiniciarReuniones();
  _reiniciarConversaciones();
});

describe('cafetería: los que no están trabajando', () => {
  it('inactivo se va a un sillón libre de la cafetería, y vuelve en cuanto arranca a trabajar', () => {
    const a = agente(701, 's1', { isActive: false });
    const os = oficina([a]);
    tickPersonal(os, T0);
    expect(a.lugar).toBe('cafeteria');
    expect(a.destino).toMatchObject({ seatCol: 5, seatRow: 2, sentado: true });
    a.isActive = true;
    a.currentTool = 'Edit';
    tickPersonal(os, T0 + 100); // sin esperar PERMANENCIA_MS
    expect(a.lugar).not.toBe('cafeteria');
    expect(a.destino).toBeUndefined();
  });

  it('con los sillones ocupados se queda parado en la cafetería', () => {
    const a = agente(711, 's1', { isActive: false });
    const b = agente(712, 's2', { isActive: false });
    const c = agente(713, 's1', { isActive: false });
    const os = oficina([a, b, c]);
    tickPersonal(os, T0);
    const destinos = [a, b, c].map((x) => x.destino);
    expect(destinos.filter((d) => d?.sentado).length).toBe(2);
    const parado = destinos.find((d) => d && !d.sentado);
    expect(parado && salaEn(parado.seatCol)).toBe(SALA_CAFETERIA);
    expect(new Set(destinos.map((d) => `${d?.seatCol},${d?.seatRow}`)).size).toBe(3);
  });

  it('esperando tu permiso no está inactivo: se queda en su escritorio', () => {
    const a = agente(721, 's1', { isActive: false, bubbleType: 'permission' });
    const b = agente(722, 's2', { isActive: true, currentTool: 'Read', bubbleType: 'permission' });
    tickPersonal(oficina([a, b]), T0);
    expect(a.destino).toBeUndefined();
    expect(a.lugar).toBeUndefined();
    expect(b.destino).toBeUndefined();
  });

  it('sin tokens se duerme en su escritorio, no en la cafetería', () => {
    alMensaje({ type: 'agentInfo', id: 731, dormidoHasta: 0 });
    const a = agente(731, 's1', { isActive: false });
    tickPersonal(oficina([a]), T0);
    expect(a.destino).toBeUndefined();
    expect(a.lugar).toBeNull();
  });

  it('los sub-agentes no van a la cafetería', () => {
    const padre = agente(741, 's1', { isActive: true });
    const sub = createCharacter(-741, 0, null, null);
    Object.assign(sub, { isSubagent: true, isActive: false, tileCol: 2, tileRow: 4 });
    registrarSub(-741, 741, 'toolu_cafe');
    tickPersonal(oficina([padre, sub]), T0);
    expect(sub.lugar).toBeUndefined();
    expect(sub.destino).toBeUndefined();
  });
});

describe('reuniones', () => {
  it('al lanzar un sub-agente van los dos a sillas vecinas de Reuniones, hablan al llegar y después vuelven', () => {
    const padre = agente(801, 's1', { isActive: true, currentTool: 'Agent' });
    const sub = createCharacter(-801, 0, null, null);
    Object.assign(sub, {
      isSubagent: true,
      isActive: true,
      tileCol: 4,
      tileRow: 5,
      parentAgentId: 801,
    });
    registrarSub(-801, 801, 'toolu_reunion');
    const os = oficina([padre, sub]);
    alLanzarSub(801, -801, T0);
    tickPersonal(os, T0);
    expect(padre.lugar).toBe('reunion');
    expect(sub.lugar).toBe('reunion');
    const d1 = padre.destino!;
    const d2 = sub.destino!;
    expect([salaEn(d1.seatCol), salaEn(d2.seatCol)]).toEqual([SALA_REUNIONES, SALA_REUNIONES]);
    expect(Math.abs(d1.seatCol - d2.seatCol)).toBe(1);
    expect(hablando(T0)).toEqual(new Set());
    // Llegan: arrancan a hablar.
    for (const [ch, d] of [
      [padre, d1],
      [sub, d2],
    ] as const) {
      ch.tileCol = d.seatCol;
      ch.tileRow = d.seatRow;
    }
    tickPersonal(os, T0 + 3000);
    expect(hablando(T0 + 3000)).toEqual(new Set([801]));
    // Termina: el padre a su escritorio y el sub-agente al lado de la silla del padre (1,3).
    tickPersonal(os, T0 + DURACION_SUB_MS + 1);
    expect(padre.lugar).not.toBe('reunion');
    expect(padre.destino).toBeUndefined();
    const base = sub.destino!;
    expect(Math.abs(base.seatCol - 1) + Math.abs(base.seatRow - 3)).toBe(1);
  });

  it('si alguno no llega, hablan igual pasado un rato', () => {
    const padre = agente(811, 's1', { isActive: true });
    const sub = createCharacter(-811, 0, null, null);
    Object.assign(sub, { isSubagent: true, isActive: true, tileCol: 2, tileRow: 4 });
    const os = oficina([padre, sub]);
    alLanzarSub(811, -811, T0);
    tickPersonal(os, T0);
    tickPersonal(os, T0 + ESPERA_LLEGADA_MS);
    expect(hablando(T0 + ESPERA_LLEGADA_MS).size).toBe(1);
  });

  it('dos sesiones del mismo proyecto: reunión corta cuando la segunda se pone a trabajar', () => {
    const a = agente(821, 's1', { isActive: true, currentTool: 'Edit' });
    const b = agente(822, 's2', { isActive: false, currentTool: 'Edit' });
    const os = oficina([a, b]);
    tickPersonal(os, T0); // primera vez: solo mira quién está
    tickPersonal(os, T0 + CALENTAMIENTO_MS + 1);
    b.isActive = true;
    tickPersonal(os, T0 + CALENTAMIENTO_MS + 2);
    expect(reunionDe(821, T0 + CALENTAMIENTO_MS + 2)?.ids).toEqual([821, 822]);
    expect(b.lugar).toBe('reunion');
    expect(DURACION_PROYECTO_MS).toBeLessThanOrEqual(30_000);
    tickPersonal(os, T0 + CALENTAMIENTO_MS + DURACION_PROYECTO_MS + 3);
    expect(a.lugar).not.toBe('reunion');
    expect(b.lugar).not.toBe('reunion');
  });

  it('al abrir la página no se reúne nadie, aunque aparezcan todas las sesiones juntas', () => {
    expect(sesionesQueSeCruzan([{ id: 1, proyecto: 'ERP' }], T0)).toEqual([]);
    expect(
      sesionesQueSeCruzan(
        [
          { id: 1, proyecto: 'ERP' },
          { id: 2, proyecto: 'ERP' },
        ],
        T0 + 1000,
      ),
    ).toEqual([]);
  });

  it('el mismo par no se reúne de nuevo antes de ENFRIAR_PAR_MS, ni el proyecto antes de ENFRIAR_PROYECTO_MS', () => {
    expect(reunir([1, 2], 1000, T0, 'ERP')).toBe(true);
    expect(reunir([1, 3], 1000, T0 + 5000, 'ERP')).toBe(false); // el proyecto acaba de reunirse
    expect(reunir([1, 3], 1000, T0 + ENFRIAR_PROYECTO_MS + 1, 'ERP')).toBe(true);
    expect(reunir([2, 1], 1000, T0 + ENFRIAR_PROYECTO_MS * 2 + 2, 'ERP')).toBe(false); // mismo par
    expect(reunir([2, 1], 1000, T0 + ENFRIAR_PAR_MS + 1, 'ERP')).toBe(true);
  });

  it('nadie está en dos reuniones a la vez', () => {
    expect(reunir([1, 2], 10_000, T0)).toBe(true);
    expect(reunir([2, 3], 10_000, T0 + 1)).toBe(false);
    expect(reunir([3, 4], 10_000, T0 + 1)).toBe(true);
  });
});

describe('caminar a la cafetería (inactivo con destino)', () => {
  const tileMap: TileTypeVal[][] = Array.from({ length: 6 }, () => Array(8).fill(TileType.FLOOR_1));
  const silla: Seat = { uid: 's', seatCol: 1, seatRow: 4, facingDir: Direction.UP, assigned: true };
  const seats = new Map([['s', silla]]);
  const correr = (ch: Character, segundos: number) => {
    for (let t = 0; t < segundos; t += 0.05)
      updateCharacter(ch, 0.05, [{ col: 7, row: 0 }], seats, tileMap, new Set());
  };

  it('va al sillón y se queda sentado quieto, sin pasear', () => {
    const ch = createCharacter(1, 0, 's', silla);
    ch.isActive = false;
    ch.seatTimer = -1;
    ch.destino = { seatCol: 6, seatRow: 2, facingDir: Direction.DOWN, sentado: true };
    correr(ch, 8);
    expect([ch.tileCol, ch.tileRow, ch.state, ch.dir, ch.frame]).toEqual([
      6,
      2,
      CharacterState.TYPE,
      Direction.DOWN,
      0,
    ]);
    correr(ch, 30); // un rato largo: sigue ahí
    expect([ch.tileCol, ch.tileRow, ch.state]).toEqual([6, 2, CharacterState.TYPE]);
  });

  it('en un lugar sin asiento se queda parado mirando para donde corresponde', () => {
    const ch = createCharacter(2, 0, 's', silla);
    ch.isActive = false;
    ch.destino = { seatCol: 4, seatRow: 1, facingDir: Direction.LEFT };
    correr(ch, 8);
    expect([ch.tileCol, ch.tileRow, ch.state, ch.dir]).toEqual([
      4,
      1,
      CharacterState.IDLE,
      Direction.LEFT,
    ]);
  });
});

describe('sesiones sin uso (restauradas al abrir la página)', () => {
  it('activa pero sin herramienta ni trabajo reciente va a la cafetería; con trabajo reciente se queda', () => {
    const ahora = Date.now();
    const quieta = agente(751, 's1', { isActive: true });
    const trabajando = agente(752, 's2', { isActive: true });
    alMensaje({ type: 'agentToolDone', id: 752, toolId: 'x' });
    expect(enUso(quieta, ahora)).toBe(false);
    expect(enUso(trabajando, ahora)).toBe(true);
    expect(enUso(trabajando, ahora + SIN_USO_MS + 1)).toBe(false);
    tickPersonal(oficina([quieta, trabajando]), ahora);
    expect(quieta.lugar).toBe('cafeteria');
    expect(quieta.destino).toMatchObject({ sentado: true, descanso: true });
    expect(trabajando.lugar).not.toBe('cafeteria');
    // Arranca una herramienta: vuelve a su escritorio.
    quieta.currentTool = 'Edit';
    tickPersonal(oficina([quieta, trabajando]), ahora + 100);
    expect(quieta.destino).toBeUndefined();
  });

  it('en la cafetería no teclea aunque la sesión figure activa', () => {
    const tileMap: TileTypeVal[][] = Array.from({ length: 6 }, () =>
      Array(8).fill(TileType.FLOOR_1),
    );
    const silla: Seat = {
      uid: 's',
      seatCol: 1,
      seatRow: 4,
      facingDir: Direction.UP,
      assigned: true,
    };
    const ch = createCharacter(3, 0, 's', silla);
    ch.isActive = true;
    ch.destino = {
      seatCol: 6,
      seatRow: 2,
      facingDir: Direction.DOWN,
      sentado: true,
      descanso: true,
    };
    for (let t = 0; t < 10; t += 0.05)
      updateCharacter(ch, 0.05, [], new Map([['s', silla]]), tileMap, new Set());
    expect([ch.tileCol, ch.tileRow, ch.state, ch.frame]).toEqual([6, 2, CharacterState.TYPE, 0]);
  });
});

describe('agentes juntos sin pisarse', () => {
  it('los sub-agentes que aparecen en el mismo lugar van a lugares distintos al lado del padre', () => {
    const padre = agente(761, 's1', { isActive: true });
    const subs = [-761, -762, -763].map((id) => {
      const sub = createCharacter(id, 0, null, null);
      Object.assign(sub, {
        isSubagent: true,
        isActive: true,
        tileCol: 3,
        tileRow: 5,
        parentAgentId: 761,
      });
      return sub;
    });
    tickPersonal(oficina([padre, ...subs]), T0);
    const tiles = subs.map((x) => `${x.destino?.seatCol},${x.destino?.seatRow}`);
    expect(new Set(tiles).size).toBe(3);
    for (const x of subs) {
      expect(
        Math.abs(x.destino!.seatCol - 1) + Math.abs(x.destino!.seatRow - 3),
      ).toBeLessThanOrEqual(4);
    }
  });

  it('en la cafetería se reparten entre los livings en vez de amontonarse', () => {
    const asiento = (col: number) => ({
      lugar: 'cafeteria' as const,
      col,
      row: 2,
      facingDir: Direction.DOWN,
      area: SALA_CAFETERIA,
      sentado: true,
      prioridad: 0,
    });
    const puntos = [asiento(1), asiento(2), asiento(9)];
    // Con el sillón 1 ocupado, el 2 (pegado) queda más cerca pero elige el 9.
    expect(elegirPunto(puntos, 'cafeteria', { col: 0, row: 2 }, new Set(['1,2']), true)?.col).toBe(
      9,
    );
    // Sin separar (otros lugares), el más cercano.
    expect(elegirPunto(puntos, 'cafeteria', { col: 0, row: 2 }, new Set(['1,2']))?.col).toBe(2);
  });

  it('los que descansan en la cafetería no muestran tarjeta (salvo al pasar el mouse)', () => {
    const d = { seatCol: 5, seatRow: 2, facingDir: Direction.DOWN, sentado: true, descanso: true };
    expect(enCafeteria({ tileCol: 5, tileRow: 2, destino: d })).toBe(true);
    expect(enCafeteria({ tileCol: 4, tileRow: 2, destino: d })).toBe(false); // todavía caminando
    expect(enCafeteria({ tileCol: 5, tileRow: 2, destino: { ...d, descanso: false } })).toBe(false);
  });

  it('las tarjetas que chocan suben; las separadas no se mueven', () => {
    const s = separarEtiquetas([
      { id: 1, x: 100, y: 300 },
      { id: 2, x: 130, y: 300 },
      { id: 3, x: 400, y: 300 },
    ]);
    expect(s.get(3)).toBe(0);
    expect([s.get(1), s.get(2)].sort()).toEqual([0, 50]);
  });
});

describe('filtro Windows | WSL', () => {
  it('apaga a los del otro sistema; "todos" no apaga a nadie', () => {
    alMensaje({ type: 'agentInfo', id: 901, wsl: true });
    alMensaje({ type: 'agentInfo', id: 902, wsl: false });
    registrarSub(-901, 901, 'toolu_filtro');
    expect([901, -901, 902].map((id) => apagadoPorFiltro(id, 'todos'))).toEqual([
      false,
      false,
      false,
    ]);
    expect([901, -901, 902].map((id) => apagadoPorFiltro(id, 'windows'))).toEqual([
      true,
      true,
      false,
    ]);
    expect([901, -901, 902].map((id) => apagadoPorFiltro(id, 'wsl'))).toEqual([false, false, true]);
  });

  it('se cambia y se recuerda sin romper si no hay almacenamiento', () => {
    setFiltroSistema('wsl');
    expect(filtroSistema()).toBe('wsl');
    setFiltroSistema('todos');
    expect(filtroSistema()).toBe('todos');
  });
});
