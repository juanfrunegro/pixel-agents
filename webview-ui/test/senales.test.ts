import { describe, expect, it } from 'vitest';

import { SALA_PRESENTACIONES } from '../../core/src/salasComunes.js';
import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character, Seat } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';
import { _reiniciarBases, baseDe, tickPersonal } from '../src/personal/ambiente.js';
import { alfaDe, calcularLuces, lucesActuales } from '../src/personal/luces.js';
import {
  alMensaje,
  DEPLOY_MAX_MS,
  deployDe,
  HUMO_VIGENTE_MS,
  humoDe,
  PRESENTACION_MS,
  presentandoDe,
  registrarSub,
  vozDe,
} from '../src/personal/personal.js';

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
): OfficeState {
  return {
    characters: new Map(chars.map((c) => [c.id, c])),
    seats: new Map(seats),
    seatZone: (uid: string) => zonas[uid] ?? null,
    sendToSeat: () => undefined,
    getLayout: () => ({ furniture: [], cols: 1, areaTiles: [] }),
    tileMap: [],
    blockedTiles: new Set<string>(),
    walkableTiles: [{ col: 9, row: 9 }],
  } as unknown as OfficeState;
}

describe('señales de la sesión (agentInfo)', () => {
  it('humo con 3 errores seguidos recientes; no con 2 ni con errores viejos', () => {
    alMensaje({ type: 'agentInfo', id: 301, errores: 3, ultimoError: ahora - 1000 });
    alMensaje({ type: 'agentInfo', id: 302, errores: 2, ultimoError: ahora - 1000 });
    alMensaje({
      type: 'agentInfo',
      id: 303,
      errores: 5,
      ultimoError: ahora - HUMO_VIGENTE_MS - 1,
    });
    expect(humoDe(301, ahora)).toBe(true);
    expect(humoDe(302, ahora)).toBe(false);
    expect(humoDe(303, ahora)).toBe(false);
  });

  it('una herramienta que sale bien (errores 0) saca el humo', () => {
    alMensaje({ type: 'agentInfo', id: 304, errores: 3, ultimoError: ahora });
    alMensaje({ type: 'agentInfo', id: 304, errores: 0, ultimoError: null });
    expect(humoDe(304, ahora)).toBe(false);
  });

  it('deploy: mientras dure (y vence solo); el sub-agente deploya con su sesión', () => {
    alMensaje({ type: 'agentInfo', id: 305, deployDesde: ahora - 5000 });
    registrarSub(-305, 305, 'toolu_deploy_sub');
    expect(deployDe(305, ahora)).toBe(true);
    expect(deployDe(-305, ahora)).toBe(true);
    expect(deployDe(305, ahora - 5000 + DEPLOY_MAX_MS + 1)).toBe(false);
    alMensaje({ type: 'agentInfo', id: 305, deployDesde: null });
    expect(deployDe(305, ahora)).toBe(false);
  });

  it('voz pedida y presentando durante PRESENTACION_MS después de que se dijo', () => {
    alMensaje({ type: 'agentInfo', id: 306, voz: true, presento: null });
    expect(vozDe(306)).toBe(true);
    expect(presentandoDe(306, ahora)).toBe(false);
    alMensaje({ type: 'agentInfo', id: 306, voz: false, presento: ahora });
    expect(vozDe(306)).toBe(false);
    expect(presentandoDe(306, ahora + 1000)).toBe(true);
    expect(presentandoDe(306, ahora + PRESENTACION_MS + 1)).toBe(false);
  });
});

describe('luces de las salas', () => {
  it('deploy prende la oficina del agente; Presentaciones: presentando gana a preparando', () => {
    const luces = calcularLuces([
      { sala: 'ERP', deploy: true, voz: false, presentando: false },
      { sala: 'Brain', deploy: false, voz: true, presentando: false },
      { sala: 'Chaina', deploy: false, voz: false, presentando: true },
      { sala: 'Poker', deploy: false, voz: true, presentando: false },
    ]);
    expect(luces.get('ERP')).toBe('deploy');
    expect(luces.get(SALA_PRESENTACIONES)).toBe('presentando');
    expect(luces.has('Brain')).toBe(false);
  });

  it('solo voz pedida: Presentaciones tenue', () => {
    const luces = calcularLuces([{ sala: 'Brain', deploy: false, voz: true, presentando: false }]);
    expect(luces.get(SALA_PRESENTACIONES)).toBe('preparando');
    expect(alfaDe('preparando', ahora)).toBeLessThan(alfaDe('presentando', ahora));
  });

  it('el deploy parpadea: la opacidad cambia con el tiempo y queda suave', () => {
    const valores = [0, 350, 700, 1050].map((t) => alfaDe('deploy', t));
    expect(new Set(valores.map((v) => v.toFixed(3))).size).toBeGreaterThan(1);
    for (const v of valores) {
      expect(v).toBeGreaterThanOrEqual(0.08);
      expect(v).toBeLessThanOrEqual(0.28);
    }
  });

  it('un agente con deploy prende su oficina en el tick (sub-agente: la de su padre)', () => {
    _reiniciarBases();
    alMensaje({ type: 'agentInfo', id: 310, deployDesde: ahora - 1000 });
    const padre = personaje(310, { seatId: 'e1', isActive: true });
    const os = oficina([padre], [silla('e1', 1, 1, true)], { e1: 'ERP' });
    tickPersonal(os, ahora);
    expect(lucesActuales().get('ERP')).toBe('deploy');
  });
});

describe('escritorio de un sub-agente', () => {
  it('se sienta en el escritorio libre más cercano de la oficina de su padre', () => {
    _reiniciarBases();
    const padre = personaje(320, { seatId: 'a', isActive: true });
    const sub = personaje(-320, { isSubagent: true, parentAgentId: 320, isActive: true });
    const os = oficina(
      [padre, sub],
      [silla('a', 1, 1, true), silla('b', 3, 1), silla('c', 8, 1), silla('x', 2, 1)],
      { a: 'ERP', b: 'ERP', c: 'ERP', x: 'Chaina' },
    );
    const base = baseDe(os, sub);
    expect(base).toMatchObject({ col: 3, row: 1, sentado: true, silla: 'b' });
  });

  it('dos sub-agentes no comparten escritorio; sin libres, al piso cerca del padre', () => {
    _reiniciarBases();
    const padre = personaje(330, { seatId: 'a', isActive: true });
    const s1 = personaje(-331, { isSubagent: true, parentAgentId: 330, isActive: true });
    const s2 = personaje(-332, { isSubagent: true, parentAgentId: 330, isActive: true });
    const os = oficina([padre, s1, s2], [silla('a', 1, 1, true), silla('b', 3, 1)], {
      a: 'ERP',
      b: 'ERP',
    });
    tickPersonal(os, ahora);
    expect(s1.destino).toMatchObject({ seatCol: 3, seatRow: 1, sentado: true });
    expect(s2.destino).toMatchObject({ seatCol: 9, seatRow: 9 });
    expect(s2.destino?.sentado).toBe(false);
  });

  it('no toma la silla de otra sesión ni una de otra oficina', () => {
    _reiniciarBases();
    const padre = personaje(340, { seatId: 'a', isActive: true });
    const otra = personaje(341, { seatId: 'b', isActive: true });
    const sub = personaje(-340, { isSubagent: true, parentAgentId: 340, isActive: true });
    const os = oficina(
      [padre, otra, sub],
      [silla('a', 1, 1, true), silla('b', 2, 1), silla('c', 2, 2)],
      { a: 'ERP', b: 'ERP', c: 'Chaina' },
    );
    const base = baseDe(os, sub);
    expect(base.silla).toBeUndefined();
  });
});

describe('presentando', () => {
  it('después del aviso por voz sube al escenario y después se queda sentado en Presentaciones (no a la cafetería)', () => {
    _reiniciarBases();
    alMensaje({ type: 'agentInfo', id: 350, voz: false, presento: ahora });
    const ch = personaje(350, { seatId: 'a', isActive: false });
    const os = oficina([ch], [silla('a', 1, 1, true)], { a: 'Brain' });
    tickPersonal(os, ahora + 1000);
    expect(ch.lugar).toBe('presentacion');
    tickPersonal(os, ahora + PRESENTACION_MS + 1);
    expect(ch.lugar).toBe('fila');
  });

  it('el que habló vuelve a la cafetería después de un turno nuevo sin voz', async () => {
    const { habloRecienDe } = await import('../src/personal/personal.js');
    alMensaje({ type: 'agentInfo', id: 351, voz: false, presento: Date.now() - 120_000 });
    expect(habloRecienDe(351)).toBe(true);
    alMensaje({ type: 'agentToolStart', id: 351, toolId: 't1', status: 'Reading x' });
    expect(habloRecienDe(351)).toBe(false);
  });
});

describe('señales en la tarjeta del agente', () => {
  it('permiso, humo y deploy, en ese orden; nada si no hay señales', async () => {
    const { senalesDe } = await import('../src/personal/senales.js');
    alMensaje({ type: 'agentInfo', id: 360, errores: 3, ultimoError: ahora, deployDesde: ahora });
    expect(senalesDe(360, true, ahora).map((s) => s.clave)).toEqual(['permiso', 'humo', 'deploy']);
    expect(senalesDe(360, false, ahora + DEPLOY_MAX_MS + HUMO_VIGENTE_MS)).toEqual([]);
  });
});
