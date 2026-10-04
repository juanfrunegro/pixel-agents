import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CALMA_MS,
  enviarWhatsapp,
  escribirWhatsapp,
  EsperaDeFin,
  type EstadoSesion,
  pidioWhatsapp,
  quieta,
  resumenParaAviso,
} from '../src/personal/whatsapp.js';

function estado(over: Partial<EstadoSesion> = {}): EstadoSesion {
  return {
    isWaiting: true,
    activeToolIds: new Set(),
    activeSubagentToolIds: new Map(),
    backgroundAgentToolIds: new Set(),
    ...over,
  };
}

describe('personal: aviso por WhatsApp cuando termina todo', () => {
  it('quieta = terminó el turno y no le queda nada vivo', () => {
    expect(quieta(estado())).toBe(true);
    expect(quieta(estado({ isWaiting: false }))).toBe(false);
    expect(quieta(estado({ activeToolIds: new Set(['t']) }))).toBe(false);
    expect(quieta(estado({ backgroundAgentToolIds: new Set(['bg']) }))).toBe(false);
    expect(quieta(estado({ activeSubagentToolIds: new Map([['p', new Set(['s'])]]) }))).toBe(false);
    expect(quieta(estado({ activeSubagentToolIds: new Map([['p', new Set()]]) }))).toBe(true);
  });

  it('avisa una sola vez, cuando lleva CALMA_MS quieta', () => {
    const e = new EsperaDeFin();
    expect(e.revisar('s', estado(), 0)).toBe(false);
    expect(e.revisar('s', estado(), CALMA_MS - 1)).toBe(false);
    expect(e.revisar('s', estado(), CALMA_MS)).toBe(true);
    // Ya avisó: arranca la cuenta de nuevo (el servidor además borra la marca).
    expect(e.revisar('s', estado(), CALMA_MS + 1)).toBe(false);
  });

  it('si un sub-agente en segundo plano la despierta, la cuenta vuelve a cero (no avisa por cada agente)', () => {
    const e = new EsperaDeFin();
    e.revisar('s', estado(), 0);
    expect(e.revisar('s', estado({ backgroundAgentToolIds: new Set(['bg']) }), 20_000)).toBe(false);
    expect(e.revisar('s', estado(), 25_000)).toBe(false);
    expect(e.revisar('s', estado(), 25_000 + CALMA_MS - 1)).toBe(false);
    expect(e.revisar('s', estado(), 25_000 + CALMA_MS)).toBe(true);
  });

  it('no avisa por un turno viejo: la sesión tiene que trabajar después de pedirlo', () => {
    const e = new EsperaDeFin();
    expect(e.revisar('s', estado(), 0, false)).toBe(false);
    expect(e.revisar('s', estado(), CALMA_MS * 3, false)).toBe(false);
  });

  it('el detalle es la primera oración de la última respuesta, sin saltos de línea', () => {
    expect(resumenParaAviso('Listo, arreglé los fantasmas.\nDespués sigo.')).toBe(
      'Listo, arreglé los fantasmas.',
    );
    expect(resumenParaAviso(undefined)).toBe('Terminó lo que le pediste.');
    expect(resumenParaAviso('x'.repeat(300)).length).toBeLessThanOrEqual(160);
  });

  describe('marca por sesión', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-wpp-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('prender, leer desde cuándo y apagar; rechaza sesiones inválidas', () => {
      expect(pidioWhatsapp('abc-1', dir)).toBeNull();
      expect(escribirWhatsapp('abc-1', true, dir)).toBe(true);
      expect(typeof pidioWhatsapp('abc-1', dir)).toBe('number');
      expect(escribirWhatsapp('abc-1', false, dir)).toBe(true);
      expect(pidioWhatsapp('abc-1', dir)).toBeNull();
      expect(escribirWhatsapp('../fuera', true, dir)).toBe(false);
      expect(escribirWhatsapp('abc-1', 'si', dir)).toBe(false);
    });
  });

  it('en prueba (PIXEL_WHATSAPP_PRUEBA) no manda: lo anota', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.PIXEL_WHATSAPP_PRUEBA = '1';
    try {
      enviarWhatsapp('Terminó tu sesión de ERP', 'Listo.');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('prueba, no se manda'));
    } finally {
      delete process.env.PIXEL_WHATSAPP_PRUEBA;
      log.mockRestore();
    }
  });
});
