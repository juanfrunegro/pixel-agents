import { describe, expect, it } from 'vitest';

import {
  type PersonajeAtencion,
  resumenAtencion,
  type SenalesAtencion,
  TITULO_BASE,
  tituloPestana,
} from '../src/personal/atencion.js';
import {
  _tamanosPersonal,
  alMensaje,
  anotarHistorial,
  HISTORIAL_MAX,
  historialDe,
  META_VIGENCIA_MS,
  podarPersonal,
  registrarSub,
} from '../src/personal/personal.js';
import { _reiniciarReuniones, ENFRIAR_PAR_MS, reunir } from '../src/personal/reuniones.js';

const pj = (id: number, o: Partial<PersonajeAtencion> = {}): PersonajeAtencion => ({
  id,
  isActive: true,
  isSubagent: false,
  currentTool: 'Bash',
  bubbleType: null,
  ...o,
});
const nada: SenalesAtencion = {
  enUso: (ch) => ch.isActive && !!ch.currentTool,
  dormido: () => false,
  humo: () => false,
  deploy: () => false,
};

describe('lo que pide atención', () => {
  it('cuenta las sesiones trabajando (no sub-agentes ni dormidas) y pone primero los permisos', () => {
    const r = resumenAtencion(
      [
        pj(1),
        pj(2, { bubbleType: 'permission' }),
        pj(3, { isSubagent: true }),
        pj(4),
        pj(5, { isActive: false, currentTool: null }),
      ],
      { ...nada, dormido: (id) => id === 4, deploy: (id) => id === 1 },
    );
    expect(r.trabajando).toBe(2); // 1 y 2
    expect(r.items).toEqual([
      { id: 2, motivo: 'permiso' },
      { id: 1, motivo: 'deploy' },
    ]);
  });

  it('el título de la pestaña resume permisos y trabajo, y vuelve al nombre solo cuando no pasa nada', () => {
    expect(tituloPestana({ trabajando: 3, items: [{ id: 2, motivo: 'permiso' }] })).toBe(
      `✋ 1 · 3 trabajando — ${TITULO_BASE}`,
    );
    expect(tituloPestana({ trabajando: 2, items: [{ id: 1, motivo: 'humo' }] })).toBe(
      `2 trabajando — ${TITULO_BASE}`,
    );
    expect(tituloPestana({ trabajando: 0, items: [] })).toBe(TITULO_BASE);
  });
});

describe('historial de la ficha', () => {
  it('guarda los últimos pasos, sin repetir la misma acción seguida', () => {
    for (let i = 0; i < HISTORIAL_MAX + 5; i++) anotarHistorial(900, `paso ${i}`, 1000 + i);
    anotarHistorial(900, `paso ${HISTORIAL_MAX + 4}`, 5000);
    const h = historialDe(900);
    expect(h).toHaveLength(HISTORIAL_MAX);
    expect(h[0]).toEqual({ t: 5000, texto: `paso ${HISTORIAL_MAX + 4}` });
    expect(h[h.length - 1].texto).toBe('paso 5');
  });

  it('anota lo que llega en agentToolStart', () => {
    alMensaje({ type: 'agentToolStart', id: 901, toolId: 'x', status: 'Running: npm test' });
    expect(historialDe(901)[0].texto).toBe('Running: npm test');
  });
});

describe('poda de lo que ya no está', () => {
  it('borra sub-agentes que se fueron (en dos pasadas), su historial y las metas viejas sin usar', () => {
    const SEP = '⁣';
    alMensaje({
      type: 'agentToolStart',
      id: 950,
      toolId: 'tool-viejo',
      status: `Subtask: algo${SEP}${JSON.stringify({ t: 'general-purpose' })}`,
    });
    registrarSub(951, 950, 'tool-viejo');
    anotarHistorial(951, 'Reading x');
    const antes = _tamanosPersonal();
    // la primera poda solo lo marca (puede ser que su personaje todavía no llegó); la segunda lo borra
    podarPersonal((id) => id !== 951, Date.now());
    expect(_tamanosPersonal().subs).toBe(antes.subs);
    podarPersonal((id) => id !== 951, Date.now() + META_VIGENCIA_MS + 1);
    const despues = _tamanosPersonal();
    expect(despues.subs).toBe(antes.subs - 1);
    expect(historialDe(951)).toEqual([]);
    expect(despues.metaPorTool).toBeLessThan(antes.metaPorTool);
  });
});

describe('reuniones', () => {
  it('los enfriamientos vencidos se descartan (el mapa no crece todo el día)', () => {
    _reiniciarReuniones();
    expect(reunir([1, 2], 1000, 0)).toBe(true);
    // pasado el enfriamiento, el mismo par se puede volver a reunir
    expect(reunir([1, 2], 1000, ENFRIAR_PAR_MS + 5000)).toBe(true);
  });
});
