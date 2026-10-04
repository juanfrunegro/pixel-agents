import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CALMA_MS,
  enviarWhatsapp,
  escribirWhatsapp,
  escribirWhatsappProyecto,
  EsperaDeFin,
  EsperaDeProyectos,
  type EstadoSesion,
  pidioWhatsapp,
  proyectosConWhatsapp,
  quieta,
  resumenParaAviso,
  type SesionDeProyecto,
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

function sesion(lastDataAt: number, over: Partial<EstadoSesion> = {}): SesionDeProyecto {
  return { ...estado(over), lastDataAt };
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

  describe('por proyecto (menú de la oficina)', () => {
    const PEDIDO = 1_000;

    it('avisa una sola vez, cuando todas las sesiones del proyecto llevan CALMA_MS quietas', () => {
      const e = new EsperaDeProyectos();
      const todas = [sesion(PEDIDO + 5), sesion(PEDIDO - 500)];
      expect(e.revisar('ERP', todas, PEDIDO, 10_000)).toBe(false);
      expect(e.revisar('ERP', todas, PEDIDO, 10_000 + CALMA_MS - 1)).toBe(false);
      expect(e.revisar('ERP', todas, PEDIDO, 10_000 + CALMA_MS)).toBe(true);
      expect(e.revisar('ERP', todas, PEDIDO, 10_000 + CALMA_MS + 1)).toBe(false);
    });

    it('una sola sesión con trabajo en curso (o un manager trabajando para ella) frena el aviso y la cuenta vuelve a cero', () => {
      const e = new EsperaDeProyectos();
      const quietas = [sesion(PEDIDO + 5), sesion(PEDIDO + 5)];
      const conManager = [
        sesion(PEDIDO + 5),
        sesion(PEDIDO + 5, {
          activeSubagentToolIds: new Map([['manager', new Set(['analista'])]]),
        }),
      ];
      e.revisar('ERP', quietas, PEDIDO, 0);
      expect(e.revisar('ERP', conManager, PEDIDO, 20_000)).toBe(false);
      expect(e.revisar('ERP', quietas, PEDIDO, 25_000)).toBe(false);
      expect(e.revisar('ERP', quietas, PEDIDO, 25_000 + CALMA_MS - 1)).toBe(false);
      expect(e.revisar('ERP', quietas, PEDIDO, 25_000 + CALMA_MS)).toBe(true);
    });

    it('no avisa si nadie del proyecto trabajó después de pedirlo, haya o no sesiones abiertas', () => {
      const e = new EsperaDeProyectos();
      expect(e.revisar('ERP', [sesion(PEDIDO - 1)], PEDIDO, CALMA_MS * 3)).toBe(false);
      expect(e.revisar('ERP', [sesion(PEDIDO - 1)], PEDIDO, CALMA_MS * 6)).toBe(false);
      expect(e.revisar('ERP', [], PEDIDO, CALMA_MS * 9)).toBe(false);
      expect(e.revisar('ERP', [], PEDIDO, CALMA_MS * 12)).toBe(false);
    });

    it('si trabajaron y después cerraron todas las sesiones, también terminó', () => {
      const e = new EsperaDeProyectos();
      expect(e.revisar('ERP', [sesion(PEDIDO + 5, { isWaiting: false })], PEDIDO, 0)).toBe(false);
      expect(e.revisar('ERP', [], PEDIDO, 1_000)).toBe(false);
      expect(e.revisar('ERP', [], PEDIDO, 1_000 + CALMA_MS)).toBe(true);
    });

    it('apagar la marca olvida lo que llevaba: al prenderla de nuevo arranca de cero', () => {
      const e = new EsperaDeProyectos();
      e.revisar('ERP', [sesion(PEDIDO + 5)], PEDIDO, 0);
      e.soloEstos([]);
      // Nueva marca, posterior al último trabajo: no cuenta el trabajo de antes.
      expect(e.revisar('ERP', [sesion(PEDIDO + 5)], PEDIDO + 10, CALMA_MS * 2)).toBe(false);
      expect(e.revisar('ERP', [sesion(PEDIDO + 5)], PEDIDO + 10, CALMA_MS * 5)).toBe(false);
    });

    it('los proyectos no se mezclan', () => {
      const e = new EsperaDeProyectos();
      e.revisar('ERP', [sesion(PEDIDO + 5)], PEDIDO, 0);
      e.revisar('Chaina', [sesion(PEDIDO + 5, { isWaiting: false })], PEDIDO, 0);
      expect(
        e.revisar('Chaina', [sesion(PEDIDO + 5, { isWaiting: false })], PEDIDO, CALMA_MS),
      ).toBe(false);
      expect(e.revisar('ERP', [sesion(PEDIDO + 5)], PEDIDO, CALMA_MS)).toBe(true);
    });

    describe('marca por proyecto', () => {
      let dir: string;
      beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-wpp-p-'));
      });
      afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

      it('prender, listar con desde cuándo y apagar; nombres con espacios y símbolos van codificados', () => {
        expect(proyectosConWhatsapp(dir).size).toBe(0);
        expect(escribirWhatsappProyecto('ERP', true, dir)).toBe(true);
        expect(escribirWhatsappProyecto('Comando voz (Mochi)*', true, dir)).toBe(true);
        const marcas = proyectosConWhatsapp(dir);
        expect([...marcas.keys()].sort()).toEqual(['Comando voz (Mochi)*', 'ERP']);
        expect(typeof marcas.get('ERP')).toBe('number');
        for (const a of fs.readdirSync(path.join(dir, 'proyectos')))
          expect(a).not.toMatch(/[ *()]/);
        expect(escribirWhatsappProyecto('ERP', false, dir)).toBe(true);
        expect([...proyectosConWhatsapp(dir).keys()]).toEqual(['Comando voz (Mochi)*']);
      });

      it('rechaza oficinas libres, "Otros", rutas y valores que no son booleanos', () => {
        expect(escribirWhatsappProyecto('Libre 3', true, dir)).toBe(false);
        expect(escribirWhatsappProyecto('Otros', true, dir)).toBe(false);
        expect(escribirWhatsappProyecto('', true, dir)).toBe(false);
        expect(escribirWhatsappProyecto(' ERP', true, dir)).toBe(false);
        expect(escribirWhatsappProyecto(42, true, dir)).toBe(false);
        expect(escribirWhatsappProyecto('ERP', 'si', dir)).toBe(false);
        expect(escribirWhatsappProyecto('../fuera', true, dir)).toBe(true);
        expect(fs.readdirSync(path.join(dir, 'proyectos'))).toEqual(['..%2Ffuera.on']);
        expect(fs.existsSync(path.join(dir, 'fuera.on'))).toBe(false);
      });
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
