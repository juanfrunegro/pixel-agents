import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  asignacion,
  generarLayout,
  leerProyectosOrca,
  salasDesde,
} from '../src/personal/oficina.js';
import { proyectoDe, setReglasExtra } from '../src/personal/personal.js';

const ORCA = [
  {
    nombre: 'ERP',
    ruta: '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\Claude\\Projects\\ERP',
    color: '#ec4899',
  },
  {
    nombre: 'Centro de control',
    ruta: 'C:\\Users\\juanf\\Documents\\Chaina\\Centro de control',
    color: '#737373',
  },
  { nombre: 'brain', ruta: 'C:\\Users\\juanf\\.claude\\brain', color: '#737373' },
  { nombre: 'Poker_App', ruta: 'C:/Users/juanf/Documents/IA Tools/Poker_App', color: '#737373' },
  {
    nombre: 'Finanzas_personales',
    ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Finanzas_personales',
  },
  { nombre: 'Analisis QF', ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Analisis QF' },
  {
    nombre: 'Trading Bot',
    ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Trading Bot',
    color: '#737373',
  },
];

const plano = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'webview-ui', 'public', 'assets', 'default-layout-1.json'),
    'utf8',
  ),
) as Record<string, unknown>;

afterEach(() => setReglasExtra([]));

describe('personal: oficina según los proyectos de Orca', () => {
  it('una sala por proyecto, con los nombres de siempre y "Otros" al final', () => {
    const { salas } = salasDesde(ORCA);
    expect(salas.map((s) => s.nombre)).toEqual([
      'Brain',
      'Chaina',
      'Poker',
      'Finanzas',
      'ERP',
      'QF',
      'Trading Bot',
      'Otros',
    ]);
    // Las conocidas conservan su color; una nueva con el gris de Orca recibe uno de la paleta.
    expect(salas.find((s) => s.nombre === 'ERP')?.color).toBe('#d9534f');
    expect(salas.find((s) => s.nombre === 'Trading Bot')?.color).not.toBe('#737373');
  });

  it('un proyecto nuevo de Orca hace caer a sus agentes (también en worktrees) en su sala', () => {
    const { salas, reglas } = salasDesde(ORCA);
    expect(
      proyectoDe({ cwd: 'C:\\Users\\juanf\\Documents\\IA Tools\\Trading Bot' }),
    ).toBeUndefined();
    setReglasExtra(reglas);
    expect(proyectoDe({ cwd: 'C:\\Users\\juanf\\orca\\workspaces\\Trading Bot\\estrategia' })).toBe(
      'Trading Bot',
    );
    expect(
      proyectoDe({ projectDir: 'x\\projects\\C--Users-juanf-Documents-IA-Tools-Trading-Bot' }),
    ).toBe('Trading Bot');
    const a = asignacion(salas, reglas);
    expect(a['Trading Bot']).toEqual(['Trading Bot']);
    expect(a.Pixel).toEqual(['Otros']);
    expect(a.Pruebas).toEqual(['Otros']);
    expect(a.ERP).toEqual(['ERP']);
  });

  it('el plano tiene una sala por proyecto y los asientos de una sala no cambian de uid al sumar otra', () => {
    const seis = generarLayout(plano, salasDesde(ORCA.slice(0, 5)).salas);
    const ocho = generarLayout(plano, salasDesde(ORCA).salas);
    expect(ocho.cols).toBe(3 * 18); // sala original (11) + anexo (6) + pared
    expect(ocho.rows).toBe(1 + 3 * 12 + 1);
    const uids = (l: Record<string, unknown>) =>
      new Set((l.furniture as Array<{ uid: string }>).map((f) => f.uid));
    for (const uid of uids(seis)) expect(uids(ocho).has(uid)).toBe(true);
    const tiles = ocho.tiles as number[];
    // Sin franjas de piso fuera de las salas: la fila de margen es vacío (255), no piso.
    expect(tiles.slice(0, 54).every((t) => t === 255)).toBe(true);
    const areas = new Set((ocho.areaTiles as Array<string | null>).filter(Boolean));
    expect(areas).toEqual(
      new Set(['Brain', 'Chaina', 'Poker', 'Finanzas', 'ERP', 'QF', 'Trading Bot', 'Otros']),
    );
  });

  it('cada sala tiene un anexo con biblioteca y pizarrón, sin puestos, al que se entra por la puerta', () => {
    const l = generarLayout(plano, salasDesde(ORCA.slice(0, 1)).salas);
    const cols = l.cols as number;
    const tiles = l.tiles as number[];
    const muebles = l.furniture as Array<{ uid: string; type: string; col: number; row: number }>;
    const anexo = muebles.filter((f) => f.uid.startsWith('anexo-'));
    expect(anexo.map((f) => f.type)).toEqual(
      expect.arrayContaining(['DOUBLE_BOOKSHELF', 'WHITEBOARD', 'EASEL', 'MESA_CONTABLE']),
    );
    expect(anexo.some((f) => /CHAIR|BENCH/.test(f.type))).toBe(false);
    // Fila 0 = margen; la sala arranca en la fila 1 (fila 9 del plano original).
    const en = (c: number, filaOriginal: number) => tiles[(filaOriginal - 8) * cols + c];
    expect(en(10, 15)).not.toBe(0); // puerta en la pared del medio
    expect(en(10, 12)).toBe(0); // el resto de esa pared sigue
    expect(en(13, 15)).toBe(en(1, 15)); // piso del anexo = piso de la sala
    expect(en(17, 15)).toBe(0); // pared derecha del anexo
    expect(en(13, 10)).toBe(0); // pared de arriba del anexo
    const areas = l.areaTiles as Array<string | null>;
    expect(areas[(15 - 8) * cols + 13]).toBe('ERP');
  });

  it('los muebles nuevos del anexo existen como assets (manifest y png del mismo tamaño)', () => {
    const dir = path.join(__dirname, '..', '..', 'webview-ui', 'public', 'assets', 'furniture');
    for (const id of ['EASEL', 'MESA_CONTABLE']) {
      const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'manifest.json'), 'utf8')) as {
        id: string;
        width: number;
        height: number;
      };
      expect(m.id).toBe(id);
      const png = fs.readFileSync(path.join(dir, id, `${id}.png`));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([m.width, m.height]);
    }
  });

  it('lee los proyectos del archivo de Orca y no rompe si no existe', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-'));
    const ruta = path.join(dir, 'orca-data.json');
    fs.writeFileSync(
      ruta,
      JSON.stringify({
        repos: [{ displayName: 'ERP', path: 'C:\\x\\ERP', badgeColor: '#fff' }, { id: 'roto' }],
      }),
    );
    expect(leerProyectosOrca(ruta)).toEqual([{ nombre: 'ERP', ruta: 'C:\\x\\ERP', color: '#fff' }]);
    expect(leerProyectosOrca(path.join(dir, 'no-existe.json'))).toEqual([]);
    expect(leerProyectosOrca(null)).toEqual([]);
  });
});
