/** Oficina por niveles: el manager a su escritorio, sus agentes a su lado y la sesión (CEO) al escritorio del CEO. */
import { describe, expect, it } from 'vitest';

import type { OfficeState } from '../src/office/engine/officeState.js';
import type { Character, Seat } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';
import { _reiniciarBases, baseDe, tickPersonal } from '../src/personal/ambiente.js';
import { alMensaje, jefeDe, managerDe, registrarSub } from '../src/personal/personal.js';
import { tipoManagerDe } from '../src/personal/placas.js';

const ahora = 1_790_000_000_000;
const SEP = '⁣';

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
    isActive: true,
    currentTool: null,
    tileCol: 0,
    tileRow: 0,
    ...cambios,
  } as Character;
}

function silla(uid: string, col: number, row: number, assigned = false): [string, Seat] {
  return [uid, { uid, seatCol: col, seatRow: row, facingDir: Direction.UP, assigned }];
}

function oficina(chars: Character[], seats: Array<[string, Seat]>, zonas: Record<string, string>) {
  return {
    characters: new Map(chars.map((c) => [c.id, c])),
    seats: new Map(seats),
    seatZone: (uid: string) => zonas[uid] ?? null,
    sendToSeat: () => undefined,
    getLayout: () => ({ furniture: [], cols: 1, areaTiles: [] }),
    tileMap: [],
    blockedTiles: new Set<string>(),
    walkableTiles: [{ col: 20, row: 20 }],
  } as unknown as OfficeState;
}

/** La sesión `lead` lanza a manager-erp (spawn `mgr`) y el manager lanza a un agente (spawn `nest`). */
function delegacion(lead: number, mgr: string, nest: string) {
  alMensaje({
    type: 'agentToolStart',
    id: lead,
    toolId: mgr,
    toolName: 'Agent',
    status: `Subtask: revisar${SEP}${JSON.stringify({ t: 'manager-erp', m: 'sonnet', e: null })}`,
  });
  registrarSub(-lead, lead, mgr);
  // El manager lanza al anidado: el servidor lo traduce como herramienta del manager…
  alMensaje({
    type: 'subagentToolStart',
    id: lead,
    parentToolId: mgr,
    toolId: nest,
    status: `Subtask: cobertura${SEP}${JSON.stringify({ t: 'analista-cobertura', m: 'sonnet', e: null })}`,
  });
  // …y el trabajo del anidado llega con su jefe.
  alMensaje({
    type: 'subagentToolStart',
    id: lead,
    parentToolId: nest,
    toolId: `${nest}-lee`,
    status: 'Reading x.ts',
    jefeToolId: mgr,
  });
  registrarSub(-lead - 1, lead, nest);
}

const SILLAS: Array<[string, Seat]> = [
  silla('erp-banco-3-0', 2, 5, true), // la de la sesión
  silla('erp-banco-3-4', 3, 5), // libre, cerca de la sesión
  silla('erp-manager-silla', 6, 2),
  silla('erp-banco-0-8', 10, 2), // libre, al lado del manager
  silla('brain-ceo-silla', 30, 2),
];
const ZONAS = {
  'erp-banco-3-0': 'ERP',
  'erp-banco-3-4': 'ERP',
  'erp-manager-silla': 'ERP',
  'erp-banco-0-8': 'ERP',
  'brain-ceo-silla': 'Brain',
};

describe('oficina por niveles', () => {
  it('reconoce al manager y al jefe de un agente anidado', () => {
    delegacion(500, 'toolu_mgr_500', 'toolu_nest_500');
    expect(managerDe(-500)).toBe('manager-erp');
    expect(managerDe(-501)).toBeNull();
    expect(jefeDe(-501)).toBe(-500);
    expect(jefeDe(-500)).toBeNull();
    expect(tipoManagerDe('ERP')).toBe('manager-erp');
    expect(tipoManagerDe('Finanzas personales')).toBe('manager-finanzas-personales');
  });

  it('el manager se sienta en su escritorio, en la oficina de su proyecto', () => {
    _reiniciarBases();
    delegacion(510, 'toolu_mgr_510', 'toolu_nest_510');
    const lead = personaje(510, { seatId: 'erp-banco-3-0' });
    const mgr = personaje(-510, { isSubagent: true, parentAgentId: 510 });
    const os = oficina([lead, mgr], SILLAS, ZONAS);
    expect(baseDe(os, mgr, ahora)).toMatchObject({ col: 6, row: 2, silla: 'erp-manager-silla' });
  });

  it('el agente que lanza el manager se sienta a su lado (no al lado de la sesión), aunque llegue antes', () => {
    _reiniciarBases();
    delegacion(520, 'toolu_mgr_520', 'toolu_nest_520');
    const lead = personaje(520, { seatId: 'erp-banco-3-0' });
    const mgr = personaje(-520, { isSubagent: true, parentAgentId: 520 });
    const anidado = personaje(-521, { isSubagent: true, parentAgentId: 520 });
    // El anidado primero en el mapa: su base se calcula antes que la del manager y después se corrige.
    const os = oficina([anidado, lead, mgr], SILLAS, ZONAS);
    tickPersonal(os, ahora);
    tickPersonal(os, ahora + 100);
    expect(anidado.destino).toMatchObject({ seatCol: 10, seatRow: 2, sentado: true });
  });

  it('mientras el manager trabaja, la sesión espera en el escritorio del CEO; cuando termina, vuelve', () => {
    _reiniciarBases();
    delegacion(530, 'toolu_mgr_530', 'toolu_nest_530');
    const lead = personaje(530, { seatId: 'erp-banco-3-0' });
    const mgr = personaje(-530, { isSubagent: true, parentAgentId: 530 });
    const os = oficina([lead, mgr], SILLAS, ZONAS);
    tickPersonal(os, ahora);
    expect(lead.lugar).toBe('ceo');
    expect(lead.destino).toMatchObject({ seatCol: 30, seatRow: 2, sentado: true });

    mgr.matrixEffect = 'despawn';
    tickPersonal(os, ahora + 100);
    expect(lead.lugar).not.toBe('ceo');
  });

  it('una sola sesión en el escritorio del CEO: la segunda que delega sigue con lo suyo', () => {
    _reiniciarBases();
    delegacion(540, 'toolu_mgr_540', 'toolu_nest_540');
    delegacion(550, 'toolu_mgr_550', 'toolu_nest_550');
    const a = personaje(540, { seatId: 'erp-banco-3-0' });
    const b = personaje(550, { seatId: 'erp-banco-3-4' });
    const os = oficina(
      [
        a,
        b,
        personaje(-540, { isSubagent: true, parentAgentId: 540 }),
        personaje(-550, { isSubagent: true, parentAgentId: 550 }),
      ],
      SILLAS,
      ZONAS,
    );
    tickPersonal(os, ahora);
    expect([a.lugar, b.lugar].filter((l) => l === 'ceo')).toHaveLength(1);
  });
});
