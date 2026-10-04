import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { esAsientoReservado, esSalaComun, SALAS_COMUNES } from '../../core/src/salasComunes.js';
import {
  asignacion,
  generarLayout,
  leerProyectosOrca,
  salasDesde,
} from '../src/personal/oficina.js';
import { proyectoDe, setReglasExtra } from '../src/personal/personal.js';

interface Mueble {
  uid: string;
  type: string;
  col: number;
  row: number;
}

const DIR_MUEBLES = path.join(__dirname, '..', '..', 'webview-ui', 'public', 'assets', 'furniture');

interface Huella {
  w: number;
  h: number;
  bg: number;
  silla: boolean;
}

/** Huellas de los muebles leídas de los manifest (como el catálogo del webview), por id de asset. */
const HUELLAS: Map<string, Huella> = (() => {
  const m = new Map<string, Huella>();
  type Nodo = {
    id?: string;
    type?: string;
    category?: string;
    footprintW?: number;
    footprintH?: number;
    backgroundTiles?: number;
    members?: Nodo[];
  };
  const recorrer = (n: Nodo, bg: number, silla: boolean) => {
    const b = n.backgroundTiles ?? bg;
    const s = n.category ? n.category === 'chairs' : silla;
    if (n.members) for (const x of n.members) recorrer(x, b, s);
    else if (n.id && n.footprintW && n.footprintH)
      m.set(n.id, { w: n.footprintW, h: n.footprintH, bg: b, silla: s });
  };
  for (const d of fs.readdirSync(DIR_MUEBLES)) {
    const f = path.join(DIR_MUEBLES, d, 'manifest.json');
    if (fs.existsSync(f)) recorrer(JSON.parse(fs.readFileSync(f, 'utf8')) as Nodo, 0, false);
  }
  return m;
})();

const huella = (tipo: string): Huella => {
  const h = HUELLAS.get(tipo.split(':')[0]);
  if (!h) throw new Error(`mueble sin manifest: ${tipo}`);
  return h;
};

function areaDe(l: Record<string, unknown>, col: number, row: number): string | null {
  return (l.areaTiles as Array<string | null>)[row * (l.cols as number) + col] ?? null;
}

/** Tiles ocupados por muebles (sin las filas de fondo), como getBlockedTiles del webview. */
function bloqueados(l: Record<string, unknown>): Set<string> {
  const b = new Set<string>();
  for (const f of l.furniture as Mueble[]) {
    const h = huella(f.type);
    for (let dr = h.bg; dr < h.h; dr++)
      for (let dc = 0; dc < h.w; dc++) b.add(`${f.col + dc},${f.row + dr}`);
  }
  return b;
}

function asientos(l: Record<string, unknown>): Array<{ uid: string; col: number; row: number }> {
  const out: Array<{ uid: string; col: number; row: number }> = [];
  for (const f of l.furniture as Mueble[]) {
    const h = huella(f.type);
    if (!h.silla) continue;
    for (let dr = h.bg; dr < h.h; dr++)
      for (let dc = 0; dc < h.w; dc++) out.push({ uid: f.uid, col: f.col + dc, row: f.row + dr });
  }
  return out;
}

/** Tiles a los que se llega caminando desde `desde` (piso, sin muebles). */
function caminables(
  l: Record<string, unknown>,
  desde: { col: number; row: number } | null,
): Set<string> {
  const cols = l.cols as number;
  const rows = l.rows as number;
  const tiles = l.tiles as number[];
  const b = bloqueados(l);
  const ok = (c: number, r: number) =>
    c >= 0 &&
    r >= 0 &&
    c < cols &&
    r < rows &&
    tiles[r * cols + c] !== 255 &&
    tiles[r * cols + c] !== 0 &&
    !b.has(`${c},${r}`);
  const vistos = new Set<string>();
  if (!desde || !ok(desde.col, desde.row)) return vistos;
  const cola = [desde];
  vistos.add(`${desde.col},${desde.row}`);
  while (cola.length) {
    const { col, row } = cola.shift()!;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = col + dc;
      const r = row + dr;
      const k = `${c},${r}`;
      if (!vistos.has(k) && ok(c, r)) {
        vistos.add(k);
        cola.push({ col: c, row: r });
      }
    }
  }
  return vistos;
}

/** Un tile libre de la sala (el de más abajo a la izquierda), o null. */
function oficinaDe(l: Record<string, unknown>, sala: string): { col: number; row: number } | null {
  const cols = l.cols as number;
  const b = bloqueados(l);
  const areas = l.areaTiles as Array<string | null>;
  for (let i = areas.length - 1; i >= 0; i--) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (areas[i] === sala && !b.has(`${col},${row}`)) return { col, row };
  }
  return null;
}

function centroDe(l: Record<string, unknown>, sala: string): { col: number; row: number } {
  const cols = l.cols as number;
  let n = 0;
  let sc = 0;
  let sr = 0;
  (l.areaTiles as Array<string | null>).forEach((a, i) => {
    if (a !== sala) return;
    n++;
    sc += i % cols;
    sr += Math.floor(i / cols);
  });
  return { col: sc / n, row: sr / n };
}

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

  it('el plano tiene una oficina por proyecto, el Brain y las salas compartidas, y entra en una pantalla', () => {
    const l = generarLayout(plano, salasDesde(ORCA).salas);
    const areas = new Set((l.areaTiles as Array<string | null>).filter(Boolean));
    expect(areas).toEqual(
      new Set([
        'Brain',
        'Chaina',
        'Poker',
        'Finanzas',
        'ERP',
        'QF',
        'Trading Bot',
        'Otros',
        ...SALAS_COMUNES,
      ]),
    );
    // 1920x1080 con zoom 2 (32 px por tile), dejando lugar para la barra de abajo.
    expect(l.cols as number).toBeLessThanOrEqual(60);
    expect(l.rows as number).toBeLessThanOrEqual(30);
    // El Brain está en el medio: su centro cae en el tercio central del plano, en las dos direcciones.
    const c = centroDe(l, 'Brain');
    expect(c.col / (l.cols as number)).toBeGreaterThan(1 / 3);
    expect(c.col / (l.cols as number)).toBeLessThan(2 / 3);
    expect(c.row / (l.rows as number)).toBeGreaterThan(1 / 3);
    expect(c.row / (l.rows as number)).toBeLessThan(2 / 3);
    // Sin anexos: ninguna oficina de proyecto tiene bibliotecas, atriles ni pizarrones (salvo la pizarra de pendientes
    // del Brain, que no es un lugar de trabajo).
    const muebles = l.furniture as Mueble[];
    const enOficinas = muebles.filter(
      (f) => !esSalaComun(areaDe(l, f.col, f.row + 2)) && !f.uid.startsWith('brain-pizarra'),
    );
    expect(
      enOficinas.filter((f) => /BOOKSHELF|EASEL|WHITEBOARD/.test(f.type)).map((f) => f.uid),
    ).toEqual([]);
    // La mesa contable está en Finanzas, y solo ahí.
    const mesas = muebles.filter((f) => f.type === 'MESA_CONTABLE');
    expect(mesas.map((f) => areaDe(l, f.col, f.row + 1))).toEqual(['Finanzas']);
  });

  it('desde cada oficina se llega caminando al Brain y a cada sala compartida, y a todos sus asientos', () => {
    const l = generarLayout(plano, salasDesde(ORCA).salas);
    const alcanzable = caminables(l, oficinaDe(l, 'Chaina'));
    const salas = new Set<string>();
    for (const k of alcanzable) {
      const [col, row] = k.split(',').map(Number);
      const a = areaDe(l, col, row);
      if (a) salas.add(a);
    }
    expect([...salas].sort()).toEqual(
      [
        'Brain',
        'Chaina',
        'Poker',
        'Finanzas',
        'ERP',
        'QF',
        'Trading Bot',
        'Otros',
        ...SALAS_COMUNES,
      ].sort(),
    );
    // Cada asiento tiene al lado un tile al que se llega (para sentarse).
    for (const s of asientos(l)) {
      const vecinos = [
        [s.col + 1, s.row],
        [s.col - 1, s.row],
        [s.col, s.row + 1],
        [s.col, s.row - 1],
      ];
      expect(
        vecinos.some(([c, r]) => alcanzable.has(`${c},${r}`)),
        `asiento ${s.uid} en ${s.col},${s.row}`,
      ).toBe(true);
    }
  });

  it('cada oficina tiene sus puestos y las compartidas tienen lugar de sobra', () => {
    const l = generarLayout(plano, salasDesde(ORCA).salas);
    const por = new Map<string, number>();
    for (const s of asientos(l)) {
      const a = areaDe(l, s.col, s.row) ?? '?';
      por.set(a, (por.get(a) ?? 0) + 1);
    }
    expect(por.get('Chaina')).toBe(6);
    expect(por.get('ERP')).toBe(6);
    expect(por.get('Brain')).toBe(6);
    expect(por.get('Finanzas')).toBe(5); // un escritorio menos: la mesa contable
    expect(por.get('Cafetería')).toBeGreaterThanOrEqual(12);
    expect(por.get('Reuniones')).toBe(8);
    expect(por.get('Biblioteca') ?? 0).toBe(0);
  });

  it('oficina por niveles: un escritorio de manager por oficina, el del CEO en el Brain y la cabina de contratistas', () => {
    const l = generarLayout(plano, salasDesde(ORCA).salas);
    const muebles = l.furniture as Mueble[];
    const sillasDe = (fin: string) =>
      muebles.filter((f) => f.uid.endsWith(fin)).map((f) => areaDe(l, f.col, f.row));
    expect(sillasDe('-manager-silla')).toEqual(
      expect.arrayContaining(['Chaina', 'ERP', 'Finanzas']),
    );
    expect(sillasDe('-manager-silla')).not.toContain('Brain');
    expect(sillasDe('-ceo-silla')).toEqual(['Brain']);
    expect(
      muebles.filter((f) => esAsientoReservado(f.uid)).every((f) => f.type.includes('CHAIR')),
    ).toBe(true);
    const cabina = muebles.filter((f) => areaDe(l, f.col, f.row + 2) === 'Contratistas');
    expect(cabina.filter((f) => f.type === 'DESK_FRONT')).toHaveLength(4);
  });

  it('con más de 7 proyectos agrega una franja de oficinas abajo, y con pocos no deja huecos', () => {
    const muchos = [
      ...ORCA,
      ...['Uno', 'Dos', 'Tres'].map((n) => ({ nombre: n, ruta: `C:\\x\\${n}` })),
    ];
    const l = generarLayout(plano, salasDesde(muchos).salas);
    expect(oficinaDe(l, 'Tres')).not.toBeNull();
    expect(l.rows as number).toBeGreaterThan(30);
    const pocos = generarLayout(plano, salasDesde(ORCA.slice(0, 2)).salas);
    expect(new Set((pocos.areaTiles as Array<string | null>).filter(Boolean))).toEqual(
      new Set(['ERP', 'Chaina', 'Otros', 'Brain', ...SALAS_COMUNES]),
    );
    expect(caminables(pocos, oficinaDe(pocos, 'ERP')).size).toBeGreaterThan(100);
  });

  it('los asientos de una sala no cambian de uid al sumar otro proyecto', () => {
    const uids = (l: Record<string, unknown>) =>
      new Set((l.furniture as Mueble[]).map((f) => f.uid));
    const antes = uids(generarLayout(plano, salasDesde(ORCA.slice(0, 5)).salas));
    const despues = uids(generarLayout(plano, salasDesde(ORCA).salas));
    for (const uid of antes) expect(despues.has(uid)).toBe(true);
    const todos = (generarLayout(plano, salasDesde(ORCA).salas).furniture as Mueble[]).map(
      (f) => f.uid,
    );
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('los muebles propios (atril, mesa contable) existen como assets (manifest y png del mismo tamaño)', () => {
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
