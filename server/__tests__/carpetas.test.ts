/**
 * Personal (copia de juanfrunegro): cualquier carpeta en una oficina libre — proyectos de Orca leídos de su base nueva
 * (profile-state.db), subcarpetas de IA Tools y "Otra carpeta…" validada.
 */
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  guardarExtra,
  leerCarpetas,
  subcarpetas,
  validarCarpeta,
} from '../src/personal/carpetas.js';
import {
  candidatoDeRuta,
  candidatos,
  disponiblesDe,
  leerProyectosOrca,
  leerReposDb,
  salasConOcupacion,
} from '../src/personal/oficina.js';
import { setReglasExtra } from '../src/personal/personal.js';

afterEach(() => setReglasExtra([]));

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-carpetas-'));

const OP = {
  home: 'C:\\Users\\juanf',
  distro: 'Ubuntu',
  esCarpeta: (r: string) => !r.toLowerCase().includes('no-existe'),
};

describe('validarCarpeta ("Otra carpeta…")', () => {
  it('acepta una carpeta de proyecto y la devuelve normalizada', () => {
    expect(validarCarpeta('C:/Users/juanf/Documents/IA Tools/coucou/', OP)).toEqual({
      ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\coucou',
    });
    expect(validarCarpeta('  "C:\\Users\\juanf\\Documents\\Chaina"  ', OP)).toEqual({
      ruta: 'C:\\Users\\juanf\\Documents\\Chaina',
    });
    expect(validarCarpeta('D:\\proyectos\\algo', OP)).toEqual({ ruta: 'D:\\proyectos\\algo' });
  });

  it('acepta carpetas de WSL, por red o escritas como /home/...', () => {
    expect(validarCarpeta('\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\x', OP)).toEqual({
      ruta: '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\x',
    });
    expect(validarCarpeta('/home/juanf/Documents/Claude/Projects/ERP', OP)).toEqual({
      ruta: '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\Claude\\Projects\\ERP',
    });
  });

  it('rechaza rutas relativas, raíces, carpetas del sistema y el home entero', () => {
    const malas = [
      '',
      '   ',
      'proyectos\\algo',
      '..\\..\\Windows',
      'C:\\',
      'C:',
      'D:\\',
      'C:\\Windows',
      'C:\\Windows\\System32',
      'c:\\program files\\algo',
      'C:\\Program Files (x86)\\x',
      'C:\\ProgramData\\x',
      'C:\\Users',
      'C:\\Users\\juanf',
      'C:\\Users\\juanf\\',
      'C:\\Users\\juanf\\AppData\\Roaming\\orca',
      'C:\\Users\\juanf\\Documents\\..\\..\\..\\Windows',
      '\\\\servidor\\compartido\\x',
      '\\\\wsl.localhost\\Ubuntu',
      '\\\\wsl.localhost\\Ubuntu\\etc',
      '\\\\wsl.localhost\\Ubuntu\\home\\juanf',
      '/home/juanf',
      '/etc/passwd',
      '/',
      'C:\\Users\\juanf\\Documents\\a<b',
      'C:\\Users\\juanf\\Documents\\no-existe',
    ];
    for (const r of malas) {
      expect(validarCarpeta(r, OP), r).toHaveProperty('error');
    }
    expect(validarCarpeta(42, OP)).toHaveProperty('error');
    expect(validarCarpeta(null, OP)).toHaveProperty('error');
  });

  it('rechaza lo que no es carpeta (con la verificación real del disco)', () => {
    // El temporal vive en AppData, que se rechaza por ser del sistema: acá el "home" es otro.
    const real = {
      home: 'C:\\nadie',
      distro: 'Ubuntu',
      esCarpeta: (r: string) => {
        try {
          return fs.statSync(r).isDirectory();
        } catch {
          return false;
        }
      },
    };
    const dir = tmp();
    const archivo = path.join(dir, 'a.txt');
    fs.writeFileSync(archivo, 'x');
    expect(validarCarpeta(archivo, real)).toHaveProperty('error');
    expect(validarCarpeta(path.join(dir, 'no-hay'), real)).toHaveProperty('error');
    expect(validarCarpeta(dir, real)).toEqual({ ruta: path.win32.normalize(dir) });
  });
});

describe('carpetas.json y subcarpetas de la raíz', () => {
  it('sin archivo: raíz IA Tools del home y sin extras; guardarExtra no repite por ruta', () => {
    const dir = tmp();
    const ruta = path.join(dir, 'carpetas.json');
    expect(leerCarpetas(ruta)).toEqual({
      raiz: path.join(os.homedir(), 'Documents', 'IA Tools'),
      extras: [],
    });
    guardarExtra({ nombre: 'coucou', ruta: 'C:\\x\\coucou' }, ruta);
    guardarExtra({ nombre: 'coucou', ruta: 'c:/x/coucou/' }, ruta);
    expect(leerCarpetas(ruta).extras).toEqual([{ nombre: 'coucou', ruta: 'C:\\x\\coucou' }]);
    fs.writeFileSync(ruta, JSON.stringify({ raiz: 'D:\\otra', extras: [{ roto: 1 }] }));
    expect(leerCarpetas(ruta)).toEqual({ raiz: 'D:\\otra', extras: [] });
  });

  it('lista las subcarpetas (sin ocultas ni node_modules), la más tocada primero', () => {
    const raiz = tmp();
    for (const n of ['vieja', 'nueva', '.oculta', 'node_modules']) fs.mkdirSync(path.join(raiz, n));
    fs.writeFileSync(path.join(raiz, 'archivo.txt'), 'x');
    const hace = Date.now() / 1000 - 3600;
    fs.utimesSync(path.join(raiz, 'vieja'), hace, hace);
    expect(subcarpetas(raiz).map((s) => s.nombre)).toEqual(['nueva', 'vieja']);
    expect(subcarpetas(path.join(raiz, 'no-existe'))).toEqual([]);
  });
});

describe('proyectos de Orca desde su base nueva (profile-state.db)', () => {
  it('lee el documento "repos" y, si la base no sirve, devuelve null para caer al JSON', () => {
    const dir = tmp();
    const ruta = path.join(dir, 'profile-state.db');
    const req = createRequire(path.join(process.cwd(), 'x.js'));
    const { DatabaseSync } = req('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(ruta);
    db.exec(
      'CREATE TABLE profile_state_documents (domain TEXT PRIMARY KEY, payload TEXT NOT NULL)',
    );
    db.prepare('INSERT INTO profile_state_documents VALUES (?, ?)').run(
      'repos',
      JSON.stringify([
        { displayName: 'ERP', path: '\\\\wsl.localhost\\Ubuntu\\x\\ERP', badgeColor: '#ec4899' },
        { displayName: 'coucou', path: 'C:/Users/juanf/Documents/IA Tools/coucou' },
        { id: 'roto' },
      ]),
    );
    db.close();
    expect(leerReposDb(ruta)).toEqual([
      { nombre: 'ERP', ruta: '\\\\wsl.localhost\\Ubuntu\\x\\ERP', color: '#ec4899' },
      { nombre: 'coucou', ruta: 'C:/Users/juanf/Documents/IA Tools/coucou', color: undefined },
    ]);
    expect(leerReposDb(path.join(dir, 'no-existe.db'))).toBeNull();
    expect(leerReposDb(null)).toBeNull();
    // Con una ruta explícita sigue leyendo el JSON (los tests de siempre).
    expect(leerProyectosOrca(null)).toEqual([]);
  });
});

describe('candidatos para "Asignar proyecto ▸"', () => {
  const ORCA = [
    {
      nombre: 'ERP',
      ruta: '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\Claude\\Projects\\ERP',
    },
    { nombre: 'brain', ruta: 'C:\\Users\\juanf\\.claude\\brain' },
    { nombre: 'Poker_App', ruta: 'C:/Users/juanf/Documents/IA Tools/Poker_App' },
    { nombre: 'coucou', ruta: 'C:/Users/juanf/Documents/IA Tools/coucou' },
  ];
  const IA = 'C:\\Users\\juanf\\Documents\\IA Tools';
  const sub = () => [
    { nombre: 'Poker_App', ruta: `${IA}\\Poker_App`, modificado: 50 },
    { nombre: 'coucou', ruta: `${IA}\\coucou`, modificado: 90 },
    { nombre: 'investment-tracker', ruta: `${IA}\\investment-tracker`, modificado: 70 },
    { nombre: 'pixel-agents', ruta: `${IA}\\pixel-agents`, modificado: 80 },
  ];
  const mtime = (r: string) => (r.includes('ERP') ? 10 : r.includes('Poker') ? 50 : 90);

  it('Orca + IA Tools + agregadas, sin repetir ruta ni sala, sin el Brain, la más reciente primero', () => {
    const c = candidatos(
      ORCA,
      { raiz: IA, extras: [{ nombre: 'Chaina', ruta: 'C:\\Users\\juanf\\Documents\\Chaina' }] },
      sub,
      mtime,
    );
    expect(c.map((x) => [x.nombre, x.origen])).toEqual([
      ['Coucou', 'orca'],
      ['Chaina', 'otra'],
      ['Pixel', 'carpeta'],
      ['Investment tracker', 'carpeta'],
      ['Poker', 'orca'],
      ['ERP', 'orca'],
    ]);
    expect(disponiblesDe(c)).not.toContain('Brain');
  });

  it('"Otra carpeta…": valida, reusa la ya conocida y no deja dos salas con el mismo nombre', () => {
    const existentes = candidatos(ORCA, { raiz: IA, extras: [] }, sub, mtime);
    const ok = (r: unknown) => ({ ruta: r as string });
    expect(candidatoDeRuta('C:\\x\\mi-dashboard', existentes, ok)).toMatchObject({
      nombre: 'Mi dashboard',
      origen: 'otra',
    });
    // La misma carpeta que coucou de Orca (escrita distinto): devuelve ese candidato.
    expect(
      candidatoDeRuta('C:\\Users\\juanf\\Documents\\IA Tools\\coucou', existentes, ok),
    ).toMatchObject({
      nombre: 'Coucou',
      origen: 'orca',
    });
    // Otra carpeta que también se llamaría "Coucou": error.
    expect(candidatoDeRuta('D:\\copias\\coucou', existentes, ok)).toHaveProperty('error');
    // Una carpeta del Brain no puede tener oficina propia.
    expect(candidatoDeRuta('C:\\Users\\juanf\\.claude', existentes, ok)).toHaveProperty('error');
    // La validación manda.
    expect(candidatoDeRuta('C:\\Windows', existentes)).toHaveProperty('error');
  });
});

describe('colores de las oficinas', () => {
  it('cada oficina ocupada tiene un color distinto aunque dos proyectos traigan el mismo', () => {
    const deOrca = [
      { nombre: 'Coucou', color: '#d4a72c' },
      { nombre: 'Trading Bot', color: '#d4a72c' },
      { nombre: 'Pixel', color: '#a463e0' }, // el del Brain
    ];
    const salas = salasConOcupacion(
      ['Coucou', 'Trading Bot', null, 'Pixel', 'Chaina', null],
      deOrca,
    );
    const ocupadas = salas.filter((s) => !/^Libre/.test(s.nombre));
    const colores = ocupadas.map((s) => s.color);
    expect(new Set(colores).size).toBe(colores.length);
    expect(salas.find((s) => s.nombre === 'Chaina')?.color).toBe('#e8832a');
    expect(salas.find((s) => s.nombre === 'Coucou')?.color).toBe('#d4a72c');
  });
});
