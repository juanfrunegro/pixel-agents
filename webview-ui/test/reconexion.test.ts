import { afterEach, describe, expect, it, vi } from 'vitest';

import { PRESENTACIONES_APAGADA, veloPresentaciones } from '../src/personal/luces.js';
import {
  pedirConPlazo,
  type Resultado,
  resultadoDeError,
  textoFalla,
} from '../src/personal/recarga.js';
import { cartel, debeRecargar, MS_APAGADA } from '../src/personal/reconexion.js';

describe('reconexión de la pestaña', () => {
  it('recarga solo al volver después de haber estado conectada', () => {
    expect(debeRecargar('reconnecting', 'connected', true)).toBe(true);
    expect(debeRecargar('connecting', 'connected', false)).toBe(false); // primera conexión
    expect(debeRecargar('connected', 'connected', true)).toBe(false);
    expect(debeRecargar('connected', 'reconnecting', true)).toBe(false);
  });

  it('pasa de "Reconnecting…" a "Oficina apagada" si la caída dura', () => {
    expect(cartel('connected', null, 0)).toBeNull();
    expect(cartel('connecting', null, 0)).toBe('conectando');
    expect(cartel('reconnecting', 1000, 1000 + MS_APAGADA - 1)).toBe('reconectando');
    expect(cartel('reconnecting', 1000, 1000 + MS_APAGADA)).toBe('apagada');
  });
});

describe('Recargar con plazo', () => {
  afterEach(() => vi.useRealTimers());

  function armar(conectada = true) {
    let oyente: ((r: Resultado) => void) | null = null;
    const terminados: Resultado[] = [];
    const enviar = vi.fn();
    const cancelar = pedirConPlazo({
      conectada,
      enviar,
      escuchar: (cb) => {
        oyente = cb;
        return () => {
          oyente = null;
        };
      },
      plazoMs: 1000,
      alTerminar: (r) => terminados.push(r),
    });
    return { terminados, enviar, cancelar, responder: (r: Resultado) => oyente?.(r) };
  }

  it('sin respuesta del server termina por plazo (antes quedaba "Recargando…" para siempre)', () => {
    vi.useFakeTimers();
    const p = armar();
    expect(p.enviar).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(999);
    expect(p.terminados).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(p.terminados).toEqual([{ ok: false, motivo: 'plazo' }]);
  });

  it('con la pestaña desconectada falla al toque y no envía', () => {
    const p = armar(false);
    expect(p.enviar).not.toHaveBeenCalled();
    expect(p.terminados).toEqual([{ ok: false, motivo: 'desconectada' }]);
  });

  it('termina una sola vez y deja de escuchar', () => {
    vi.useFakeTimers();
    const p = armar();
    p.responder(resultadoDeError(undefined));
    p.responder({ ok: false, motivo: 'error' });
    vi.advanceTimersByTime(5000);
    expect(p.terminados).toEqual([{ ok: true }]);
  });

  it('el error de permiso del server se distingue', () => {
    const r = resultadoDeError('Esta pestaña no tiene permiso: abrí la oficina de nuevo.');
    expect(r).toMatchObject({ ok: false, motivo: 'permiso' });
    if (!r.ok) expect(textoFalla(r)).toBe('Sin permiso');
    expect(textoFalla({ ok: false, motivo: 'plazo' })).toBe('Sin respuesta');
  });
});

describe('Presentaciones apagada sin voz', () => {
  it('de día, sin voz: bien oscura; con voz: sin velo', () => {
    expect(veloPresentaciones(false, 0, false)).toBe(PRESENTACIONES_APAGADA);
    expect(veloPresentaciones(true, 0, false)).toBe(0);
  });

  it('de noche no se suma de más al velo de la noche', () => {
    expect(veloPresentaciones(false, 0.55, false)).toBeCloseTo(PRESENTACIONES_APAGADA - 0.55);
    expect(veloPresentaciones(false, 0.9, false)).toBe(0);
    // Con alguien trabajando ahí la noche no la cubre: va el velo entero.
    expect(veloPresentaciones(false, 0.55, true)).toBe(PRESENTACIONES_APAGADA);
  });
});
