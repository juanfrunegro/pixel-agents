import { describe, expect, it } from 'vitest';

import { jsonHoy, resumirDia, trabajoDe } from '../src/personal/hoy.js';

describe('/hoy.json para coucou', () => {
  const desde = Date.parse('2026-10-02T03:00:00.000Z');
  const ts = (min: number) => new Date(desde + min * 60_000).toISOString();

  it('cuenta los tokens de hoy una sola vez por mensaje', () => {
    const uso = {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 1000,
    };
    const msg = (min: number) =>
      JSON.stringify({
        type: 'assistant',
        timestamp: ts(min),
        requestId: 'r1',
        message: { id: 'm1', model: 'claude-sonnet-5-5', usage: uso },
      });
    const t = trabajoDe(
      [msg(1), msg(2)].join('\n'),
      { archivo: 'a', proyectoDir: 'x', agente: 'Juan', esSub: false, wsl: false },
      desde,
    )!;
    expect(t.tokens).toBe(1115);
  });

  it('totales, proyectos redondeados y el cupo tal cual', () => {
    const base = { herramientas: new Map<string, number>(), archivo: 'a', agente: 'Juan' };
    const r = resumirDia([
      {
        ...base,
        proyecto: 'ERP',
        esSub: false,
        wsl: true,
        activoMs: 60_000,
        costo: 1.234,
        tokens: 500,
      },
      { ...base, proyecto: 'ERP', esSub: true, wsl: true, activoMs: 9, costo: 0.001, tokens: 50 },
      {
        ...base,
        proyecto: 'Brain',
        esSub: false,
        wsl: false,
        activoMs: 1000,
        costo: 0.5,
        tokens: 7,
      },
    ]);
    const j = jsonHoy(r, { windows: null, wsl: 1790950000 }, 123);
    expect(j.generado).toBe(123);
    expect(j.total).toEqual({ sesiones: 2, activoMs: 61_000, costo: 1.74, tokens: 557 });
    expect(j.proyectos[0]).toEqual({
      proyecto: 'ERP',
      sesiones: 1,
      activoMs: 60_000,
      costo: 1.23, // 1,235 en coma flotante queda 1,2349…
      tokens: 550,
      wsl: true,
    });
    expect(j.proyectos[1]).toMatchObject({ proyecto: 'Brain', wsl: false });
    expect(j.cupo).toEqual({ windows: null, wsl: 1790950000 });
    expect(jsonHoy([], { windows: 0, wsl: null }).total.costo).toBe(0);
  });
});
