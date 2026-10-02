import { describe, expect, it } from 'vitest';

import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';
import { tickPersonal } from '../src/personal/ambiente.js';
import { alMensaje, despiertaA, dormidoDe, esWsl, registrarSub } from '../src/personal/personal.js';

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
