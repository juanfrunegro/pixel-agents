import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { CASOS_VOZ, escribirConfigVoz, leerConfigVoz } from '../src/personal/senales.js';

const dirs: string[] = [];
function carpeta(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'configvoz-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('config del aviso por voz (qué casos avisan)', () => {
  it('sin archivo, los cuatro casos prendidos', () => {
    expect(leerConfigVoz(carpeta())).toEqual({
      pregunta: true,
      permiso: true,
      fin_pregunta: true,
      esperando: true,
    });
    expect([...CASOS_VOZ]).toEqual(['pregunta', 'permiso', 'fin_pregunta', 'esperando']);
  });

  it('apaga un caso, conserva los demás y lo deja en el formato que leen los hooks', () => {
    const c = carpeta();
    expect(escribirConfigVoz('permiso', false, c)).toBe(true);
    expect(escribirConfigVoz('esperando', false, c)).toBe(true);
    expect(escribirConfigVoz('esperando', true, c)).toBe(true);
    expect(leerConfigVoz(c)).toEqual({
      pregunta: true,
      permiso: false,
      fin_pregunta: true,
      esperando: true,
    });
    const crudo = JSON.parse(fs.readFileSync(path.join(c, 'config.json'), 'utf8'));
    expect(crudo.permiso).toBe(false);
    expect(fs.readdirSync(c).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('rechaza casos o valores inválidos sin escribir', () => {
    const c = carpeta();
    expect(escribirConfigVoz('../x', false, c)).toBe(false);
    expect(escribirConfigVoz('permiso', 'no', c)).toBe(false);
    expect(escribirConfigVoz('toString', false, c)).toBe(false);
    expect(fs.existsSync(path.join(c, 'config.json'))).toBe(false);
  });

  it('archivo roto o con valores raros: todo prendido salvo false explícito', () => {
    const c = carpeta();
    fs.writeFileSync(path.join(c, 'config.json'), '{no es json');
    expect(leerConfigVoz(c).pregunta).toBe(true);
    fs.writeFileSync(path.join(c, 'config.json'), JSON.stringify({ pregunta: 0, permiso: false }));
    expect(leerConfigVoz(c)).toMatchObject({ pregunta: true, permiso: false });
  });
});
