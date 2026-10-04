import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  escribirAbrirSola,
  escribirApagado,
  leerAbrirSola,
  leerApagado,
} from '../src/personal/apagado.js';

describe('personal: cuándo se apaga sola la oficina (apagado.json)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-apagado-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('abrir sola: prendido por defecto; apagado = la marca no-abrir-sola que lee pixel_agents.py', () => {
    expect(leerAbrirSola(dir)).toBe(true);
    expect(escribirAbrirSola(false, dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'no-abrir-sola'))).toBe(true);
    expect(leerAbrirSola(dir)).toBe(false);
    expect(escribirAbrirSola('no', dir)).toBe(false);
    expect(leerAbrirSola(dir)).toBe(false);
    expect(escribirAbrirSola(true, dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'no-abrir-sola'))).toBe(false);
    expect(leerAbrirSola(dir)).toBe(true);
  });

  it('sin archivo: sin_pestanas (lo de siempre)', () => {
    expect(leerApagado(dir)).toBe('sin_pestanas');
  });

  it('guarda y lee la opción (lo lee pixel_agents.py: {"opcion": …})', () => {
    expect(escribirApagado('1h', dir)).toBe(true);
    expect(leerApagado(dir)).toBe('1h');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'apagado.json'), 'utf8'))).toEqual({
      opcion: '1h',
    });
  });

  it('rechaza valores inválidos y no toca lo guardado', () => {
    escribirApagado('nunca', dir);
    expect(escribirApagado('5m', dir)).toBe(false);
    expect(escribirApagado(60, dir)).toBe(false);
    expect(leerApagado(dir)).toBe('nunca');
  });

  it('archivo roto o con opción desconocida: sin_pestanas', () => {
    fs.writeFileSync(path.join(dir, 'apagado.json'), '{"opcion":');
    expect(leerApagado(dir)).toBe('sin_pestanas');
    fs.writeFileSync(path.join(dir, 'apagado.json'), '{"opcion":"siempre"}');
    expect(leerApagado(dir)).toBe('sin_pestanas');
  });
});
