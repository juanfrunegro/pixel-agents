import { describe, expect, it } from 'vitest';

import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';
import { tickPersonal } from '../src/personal/ambiente.js';
import {
  _reiniciarConversaciones,
  alLanzarSub,
  alTerminarSub,
  hablando,
  TURNO_SEG,
} from '../src/personal/burbujas.js';
import {
  alMensaje,
  despiertaA,
  dormidoDe,
  esWsl,
  registrarSub,
  statusDe,
} from '../src/personal/personal.js';
import { _reiniciarReuniones, reunionDe } from '../src/personal/reuniones.js';

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
    ...cambios,
  } as Character;
}

describe('dormido sin tokens', () => {
  const ahora = 1_790_000_000_000;

  it('duerme hasta la hora de vuelta y después despierta solo', () => {
    alMensaje({ type: 'agentInfo', id: 101, dormidoHasta: ahora / 1000 + 60 });
    expect(dormidoDe(101, ahora)).toBe(true);
    expect(despiertaA(101)?.getTime()).toBe(ahora + 60_000);
    expect(dormidoDe(101, ahora + 61_000)).toBe(false);
  });

  it('sin hora de vuelta (0) duerme hasta que el servidor diga que despertó', () => {
    alMensaje({ type: 'agentInfo', id: 102, dormidoHasta: 0 });
    expect(dormidoDe(102, ahora + 10 ** 9)).toBe(true);
    alMensaje({ type: 'agentInfo', id: 102, dormidoHasta: null });
    expect(dormidoDe(102, ahora)).toBe(false);
  });

  it('el sub-agente duerme con su sesión', () => {
    alMensaje({ type: 'agentInfo', id: 103, dormidoHasta: 0 });
    registrarSub(-103, 103, 'toolu_dormido');
    expect(dormidoDe(-103, ahora)).toBe(true);
  });

  it('sentado: se queda quieto en la silla; parado: vuelve a la silla', () => {
    alMensaje({ type: 'agentInfo', id: 104, dormidoHasta: 0 });
    alMensaje({ type: 'agentInfo', id: 105, dormidoHasta: 0 });
    const sentado = personaje(104);
    const parado = personaje(105, { state: CharacterState.IDLE });
    const despierto = personaje(106, { state: CharacterState.IDLE });
    const aSilla: number[] = [];
    const os = {
      characters: new Map([
        [104, sentado],
        [105, parado],
        [106, despierto],
      ]),
      sendToSeat: (id: number) => aSilla.push(id),
      seats: new Map(),
      seatZone: () => null,
      getLayout: () => ({ furniture: [], cols: 1, areaTiles: [] }),
      tileMap: [],
      blockedTiles: new Set<string>(),
      walkableTiles: [],
    } as unknown as OfficeState;
    tickPersonal(os, ahora);
    expect(sentado.seatTimer).toBeGreaterThan(0);
    expect(sentado.frame).toBe(0);
    expect(aSilla).toEqual([105]);
  });
});

describe('sesiones de WSL', () => {
  it('lo marca el servidor por sesión, y vale para sus sub-agentes', () => {
    alMensaje({ type: 'agentInfo', id: 201, wsl: true });
    alMensaje({ type: 'agentInfo', id: 202, wsl: false });
    registrarSub(-201, 201, 'toolu_wsl');
    expect(esWsl(201)).toBe(true);
    expect(esWsl(-201)).toBe(true);
    expect(esWsl(202)).toBe(false);
    expect(esWsl(999)).toBe(false);
  });
});

describe('agentes hablando', () => {
  it('al lanzar un sub-agente van a Reuniones (hablan al llegar); si ya está en otra, hablan ahí mismo', () => {
    _reiniciarConversaciones();
    _reiniciarReuniones();
    const t0 = 1_000_000;
    alLanzarSub(1, -1, t0);
    expect(reunionDe(1, t0)?.ids).toEqual([1, -1]);
    expect([...hablando(t0)]).toEqual([]);
    alLanzarSub(1, -2, t0); // lanzó otro a la vez: ese habla en el lugar
    const turno = TURNO_SEG * 1000;
    expect([...hablando(t0)]).toEqual([1]);
    expect([...hablando(t0 + turno)]).toEqual([-2]);
    expect([...hablando(t0 + 2 * turno)]).toEqual([1]);
    expect([...hablando(t0 + 3 * turno)]).toEqual([-2]);
    expect([...hablando(t0 + 4 * turno)]).toEqual([]);
  });

  it('al terminar, el sub-agente habla mientras se desvanece y después el que lo lanzó', () => {
    _reiniciarConversaciones();
    const t0 = 2_000_000;
    alTerminarSub(1, -1, t0);
    expect([...hablando(t0)]).toEqual([-1]);
    expect([...hablando(t0 + 400)]).toEqual([1]);
  });
});

describe('texto de la herramienta de cada personaje', () => {
  it('guarda el de la sesión y el de sus sub-agentes', () => {
    alMensaje({ type: 'agentToolStart', id: 301, toolId: 't1', status: 'Editing cobros.ts' });
    registrarSub(-301, 301, 'toolu_sub301');
    alMensaje({
      type: 'subagentToolStart',
      id: 301,
      parentToolId: 'toolu_sub301',
      toolId: 't2',
      status: 'Reading facturas.md',
    });
    expect(statusDe(301)).toBe('Editing cobros.ts');
    expect(statusDe(-301)).toBe('Reading facturas.md');
  });
});
