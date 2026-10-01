import { describe, expect, it } from 'vitest';

import {
  alMensaje,
  claveDe,
  colorModelo,
  esDescartable,
  etiquetaModelo,
  modeloDe,
  nombreDe,
  registrarSub,
  separarStatus,
} from '../src/personal/personal.js';

describe('personal (pantalla)', () => {
  it('separa el status visible de la meta del sub-agente', () => {
    expect(
      separarStatus('Subtask: buscar bugs⁣{"t":"buscador-de-bugs","m":"sonnet","e":"medium"}'),
    ).toEqual({
      texto: 'Subtask: buscar bugs',
      meta: { t: 'buscador-de-bugs', m: 'sonnet', e: 'medium' },
    });
    expect(separarStatus('Reading foo.ts')).toEqual({ texto: 'Reading foo.ts', meta: null });
  });

  it('limpia el status del mensaje para que el original no vea la meta', () => {
    const msg = {
      type: 'agentToolStart',
      id: 1,
      toolId: 'toolu_1',
      status: 'Subtask: x⁣{"t":"verificador","m":"hereda","e":null}',
    };
    alMensaje(msg);
    expect(msg.status).toBe('Subtask: x');
  });

  it('nombres: CEO, definidos y Marvel para los descartables; modelo heredado del padre', () => {
    alMensaje({
      type: 'agentNamesLoaded',
      ceo: 'Juan',
      agentes: { verificador: 'Pepe · verificador' },
      descartables: ['Thor'],
    });
    alMensaje({ type: 'agentInfo', id: 1, model: 'claude-opus-5-5', costUsd: 1.5 });
    registrarSub(-1, 1, 'toolu_1');
    alMensaje({
      type: 'agentToolStart',
      id: 1,
      toolId: 'toolu_2',
      status: 'Subtask: y⁣{"t":"Explore","m":"sonnet","e":null}',
    });
    registrarSub(-2, 1, 'toolu_2');
    expect(nombreDe(1)).toBe('Juan');
    expect(nombreDe(-1)).toBe('Pepe · verificador');
    expect(modeloDe(-1)).toBe('claude-opus-5-5');
    expect(nombreDe(-2)).toBe('Thor');
    expect(esDescartable(-2)).toBe(true);
    expect(claveDe(-1)).toBe('verificador');
    expect(claveDe(1)).toBe('ceo');
  });

  it('etiqueta y color por modelo', () => {
    expect(etiquetaModelo('claude-opus-5-5')).toBe('Opus 5.5');
    expect(etiquetaModelo('sonnet')).toBe('Sonnet');
    expect(etiquetaModelo('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(colorModelo('claude-sonnet-5-5')).not.toBe(colorModelo('claude-opus-5-5'));
  });
});
