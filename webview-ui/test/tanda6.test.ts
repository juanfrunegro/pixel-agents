/**
 * Tanda 6 (personal): regresiones de la pantalla (sub en el piso, dormido en la cafetería, primer status de un sub lazy).
 */
import { describe, expect, it } from 'vitest';

import { updateCharacter } from '../src/office/engine/characters.js';
import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';
import { _reiniciarBases, REINTENTO_BASE_MS, tickPersonal } from '../src/personal/ambiente.js';
import { alMensaje, historialDe, registrarSub, statusDe } from '../src/personal/personal.js';

function personaje(id: number, cambios: Partial<Character> = {}): Character {
  return {
    id,
    state: CharacterState.TYPE,
    seatId: 's1',
    seatTimer: 0,
    frame: 1,
    frameTimer: 0.2,
    isSubagent: false,
    matrixEffect: null,
    isActive: false,
    tileCol: 0,
    tileRow: 0,
    ...cambios,
  } as Character;
}

function osDe(
  chars: Character[],
  seats: Map<string, unknown>,
  walkable: Array<{ col: number; row: number }> = [],
  sendToSeat: (id: number) => void = () => {},
): OfficeState {
  return {
    characters: new Map(chars.map((c) => [c.id, c])),
    sendToSeat,
    seats,
    seatZone: () => null, // sin oficina: el sub-agente cae al "piso libre"
    getLayout: () => ({ furniture: [], cols: 1, areaTiles: [] }),
    tileMap: [],
    blockedTiles: new Set<string>(),
    walkableTiles: walkable,
  } as unknown as OfficeState;
}

describe('sub-agente sin escritorio libre en el piso', () => {
  it('no oscila entre dos tiles: el reintento no cuenta su propia base anterior', () => {
    _reiniciarBases();
    const t0 = 1_790_000_000_000;
    // Padre sentado en (5,0) (con matrixEffect para que tickPersonal lo ignore); fila de piso 0..9.
    const padre = personaje(401, { seatId: 'p', matrixEffect: 'spawn' as never });
    const sub = personaje(-401, {
      isSubagent: true,
      parentAgentId: 401,
      seatId: null as never,
      state: CharacterState.IDLE,
      tileCol: 9,
      tileRow: 3,
    });
    registrarSub(-401, 401, 'toolu_b1');
    const seats = new Map([['p', { seatCol: 5, seatRow: 0, facingDir: 0, assigned: true }]]);
    const piso = Array.from({ length: 10 }, (_, col) => ({ col, row: 0 }));
    const os = osDe([padre, sub], seats, piso);

    const columnas: Array<number | undefined> = [];
    for (let i = 0; i < 6; i++) {
      tickPersonal(os, t0 + i * REINTENTO_BASE_MS);
      columnas.push(sub.destino?.seatCol);
    }
    // El primer cuadro puede no fijar destino (sub sin uso); de ahí en más alterna 6,4,6,4...
    const cola = columnas.slice(1);
    expect(new Set(cola).size).toBe(1);
  });
});

describe('dormido sentado fuera de su silla', () => {
  it('sentado en un asiento ajeno (cafetería) se manda a su silla, igual que el parado', () => {
    const t0 = 1_790_000_000_000;
    alMensaje({ type: 'agentInfo', id: 501, dormidoHasta: 0 });
    alMensaje({ type: 'agentInfo', id: 502, dormidoHasta: 0 });
    const sentadoCafe = personaje(501, {
      tileCol: 7,
      tileRow: 7,
      lugar: 'cafeteria' as never,
      destino: { seatCol: 7, seatRow: 7, facingDir: 0, sentado: true, descanso: true } as never,
    });
    const paradoCafe = personaje(502, { state: CharacterState.IDLE, tileCol: 8, tileRow: 8 });
    const aSilla: number[] = [];
    const seats = new Map([['s1', { seatCol: 1, seatRow: 1, facingDir: 0 }]]);
    const os = osDe([sentadoCafe, paradoCafe], seats, [], (id) => aSilla.push(id));
    for (let i = 0; i < 600; i++) {
      tickPersonal(os, t0 + i * 16);
      updateCharacter(sentadoCafe, 0.016, [], seats as never, [], new Set());
    }
    expect(aSilla).toContain(502); // el parado sí se manda a la silla
    expect(aSilla).toContain(501);
  });
});

describe('primer status de un sub creado lazy', () => {
  it('se conserva aunque alMensaje corra antes de registrarSub', () => {
    // Orden de useExtensionMessages.ts: alMensaje (l.193) y recién después registrarSub (l.560).
    alMensaje({
      type: 'subagentToolStart',
      id: 601,
      parentToolId: 'toolu_lazy',
      toolId: 'x1',
      status: 'Reading primero.md',
    });
    registrarSub(-601, 601, 'toolu_lazy');
    expect(statusDe(-601)).toBe('Reading primero.md');
    expect(historialDe(-601).length).toBe(1);
    // Con el sub ya registrado, el siguiente también llega.
    alMensaje({
      type: 'subagentToolStart',
      id: 601,
      parentToolId: 'toolu_lazy',
      toolId: 'x2',
      status: 'Reading segundo.md',
    });
    expect(statusDe(-601)).toBe('Reading segundo.md');
  });
});
