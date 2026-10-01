import { describe, expect, it } from 'vitest';

import { costoUsd, metaDeSubagente, SEPARADOR_META } from '../src/personal/personal.js';

describe('personal: costo equivalente a precio de API', () => {
  it('cobra entrada, caché y salida según el modelo', () => {
    // Sonnet 5.5: 2 entrada · 4 caché 1 h · 0,20 lectura · 10 salida (US$ por millón)
    const u = {
      input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    };
    expect(costoUsd('claude-sonnet-5-5', u)).toBeCloseTo(2 + 4 + 0.2 + 10, 6);
  });
  it('Opus 5.5 y Fable 5.1 tienen su propia lectura de caché', () => {
    expect(costoUsd('claude-opus-5-5', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2, 6);
    expect(costoUsd('claude-fable-5-1', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(
      0.25,
      6,
    );
  });
  it('modelo desconocido no suma', () => {
    expect(costoUsd('<synthetic>', { output_tokens: 1000 })).toBe(0);
  });
});

describe('personal: meta del sub-agente en el status', () => {
  it('lleva tipo y modelo pedido, separados por el carácter invisible', () => {
    const s = metaDeSubagente({ subagent_type: 'tipo-que-no-existe', model: 'opus' });
    expect(s.startsWith(SEPARADOR_META)).toBe(true);
    expect(JSON.parse(s.slice(1))).toEqual({ t: 'tipo-que-no-existe', m: 'opus', e: null });
  });
  it('sin tipo es general-purpose y sin modelo hereda', () => {
    expect(JSON.parse(metaDeSubagente({}).slice(1))).toMatchObject({
      t: 'general-purpose',
      m: 'hereda',
    });
  });
});
