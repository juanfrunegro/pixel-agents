/**
 * Personal (copia de juanfrunegro): oficina con una sala por proyecto de Orca, regenerable en caliente con el botón
 * "Recargar" (antes: ~/.claude/tools/pixel-oficina/generar.py con Pixel apagado).
 *
 * Toma la sala de trabajo del plano original (escritorios, 4 sillas y 2 bancos), le suma al costado un anexo con
 * biblioteca y pizarrón (adonde van los agentes según lo que hacen, ver webview-ui/src/personal/lugares.ts) y la repite
 * en una grilla de 3 columnas, una por proyecto de Orca más "Otros". Cada sala es un Área y cada proyecto cae en la suya. Los uid de los
 * muebles llevan el nombre de la sala, así que una sala que ya existía conserva sus asientos al recargar.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readConfig, writeConfig } from '../configPersistence.js';
import { LAYOUT_FILE_DIR, LAYOUT_FILE_NAME } from '../constants.js';
import { writeLayoutToFile } from '../layoutPersistence.js';
import { normalizarCarpeta, proyectoDe, PROYECTOS_CONOCIDOS, setReglasExtra } from './personal.js';

export interface ProyectoOrca {
  nombre: string;
  ruta: string;
  color?: string;
}

export interface Sala {
  nombre: string;
  color: string;
}

/** Colores de siempre para las salas conocidas (los de generar.py) y paleta para las nuevas. */
const COLORES: Record<string, string> = {
  Brain: '#a463e0',
  Chaina: '#e8832a',
  Poker: '#4cb36a',
  Finanzas: '#3b9bd6',
  ERP: '#d9534f',
  Otros: '#9aa0ab',
};
const PALETA = ['#d4a72c', '#2bb5a8', '#c75fa3', '#7f8cf0', '#8fbf3a', '#e06b4c'];
const GRIS_ORCA = '#737373'; // color por defecto de Orca: no dice nada
const ORDEN = ['Brain', 'Chaina', 'Poker', 'Finanzas', 'ERP'];

/** Dónde guarda Orca sus proyectos (perfil activo). PIXEL_ORCA_DATA lo pisa (tests). */
export function rutaDatosOrca(): string | null {
  if (process.env.PIXEL_ORCA_DATA) return process.env.PIXEL_ORCA_DATA;
  const base = path.join(
    process.env.APPDATA ?? path.join(os.homedir() || '.', 'AppData', 'Roaming'),
    'orca',
  );
  let perfil = 'local-default';
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(base, 'orca-profile-index.json'), 'utf8')) as {
      activeProfileId?: string;
    };
    if (typeof idx.activeProfileId === 'string' && /^[\w-]+$/.test(idx.activeProfileId)) {
      perfil = idx.activeProfileId;
    }
  } catch {
    /* sin índice: perfil por defecto */
  }
  const ruta = path.join(base, 'profiles', perfil, 'orca-data.json');
  return fs.existsSync(ruta) ? ruta : null;
}

/** Proyectos agregados a Orca. Lista vacía si Orca no está instalado o el archivo no se puede leer. */
export function leerProyectosOrca(ruta = rutaDatosOrca()): ProyectoOrca[] {
  if (!ruta) return [];
  try {
    const d = JSON.parse(fs.readFileSync(ruta, 'utf8')) as {
      repos?: Array<{ displayName?: unknown; path?: unknown; badgeColor?: unknown }>;
    };
    return (d.repos ?? [])
      .filter((r) => typeof r.displayName === 'string' && typeof r.path === 'string')
      .map((r) => ({
        nombre: (r.displayName as string).trim(),
        ruta: r.path as string,
        color: typeof r.badgeColor === 'string' ? r.badgeColor : undefined,
      }));
  } catch {
    return [];
  }
}

const bonito = (s: string): string => {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

/**
 * Salas a partir de los proyectos de Orca. Un proyecto conocido usa su nombre de siempre (Chaina, Poker, ERP…); uno
 * nuevo, su nombre en Orca. Devuelve también las reglas carpeta → sala de los proyectos nuevos, para que sus agentes
 * caigan en su sala.
 */
export function salasDesde(proyectos: ProyectoOrca[]): {
  salas: Sala[];
  reglas: Array<[string, string]>;
} {
  const vistos = new Map<string, string | undefined>();
  const reglas: Array<[string, string]> = [];
  for (const p of proyectos) {
    const conocido = proyectoDe({ cwd: p.ruta }, false);
    const nombre = conocido ?? bonito(p.nombre);
    if (!nombre || nombre === 'Otros') continue;
    if (!conocido) {
      const clave = normalizarCarpeta(path.win32.basename(p.ruta.replace(/[\\/]+$/, '')));
      if (clave.length >= 3) reglas.push([clave, nombre]);
    }
    if (!vistos.has(nombre)) vistos.set(nombre, p.color);
  }
  const nombres = [...vistos.keys()].sort((a, b) => {
    const ia = ORDEN.indexOf(a);
    const ib = ORDEN.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });
  let libre = 0;
  const salas = nombres.map((nombre) => {
    const orca = vistos.get(nombre);
    const color =
      COLORES[nombre] ??
      (orca && orca.toLowerCase() !== GRIS_ORCA ? orca : PALETA[libre++ % PALETA.length]);
    return { nombre, color };
  });
  salas.push({ nombre: 'Otros', color: COLORES.Otros });
  return { salas, reglas };
}

/** Carpeta (lo que devuelve proyectoDe) → sala. Los proyectos conocidos sin sala propia van a "Otros". */
export function asignacion(
  salas: Sala[],
  reglas: Array<[string, string]>,
): Record<string, string[]> {
  const tienen = new Set(salas.map((s) => s.nombre));
  const a: Record<string, string[]> = {};
  for (const nombre of new Set([...PROYECTOS_CONOCIDOS, ...reglas.map(([, n]) => n)])) {
    a[nombre] = [tienen.has(nombre) ? nombre : 'Otros'];
  }
  return a;
}

// Bloque de la sala izquierda en el plano original (incluye la decoración de pared).
const VACIO = 255; // TileType.VOID (generar.py usaba 5, un piso: quedaban franjas caminables arriba y abajo)
const PARED = 0;
const FILA0 = 9;
const FILA1 = 20;
const COL0 = 0;
const COL1 = 10;
const ALTO = FILA1 - FILA0 + 1;
/** Anexo a la derecha de la sala original: se entra por la puerta de su pared derecha (col 10, filas 14 a 17). */
const ANEXO = 6;
const ANCHO = COL1 - COL0 + 1 + ANEXO + 1; // sala original + anexo + pared derecha
const MARGEN = 1;
const POR_FILA = 3;

interface Mueble {
  uid: string;
  type: string;
  col: number;
  row: number;
  [k: string]: unknown;
}

/**
 * Muebles del anexo, en coordenadas de la sala (col 0 = pared izquierda, fila 9 = decoración de pared). Sin sillas ni
 * bancos: si no, el anexo tendría puestos y los agentes se sentarían ahí a trabajar.
 */
export const MUEBLES_ANEXO: Array<{ id: string; type: string; col: number; row: number }> = [
  { id: 'biblio-1', type: 'DOUBLE_BOOKSHELF', col: 11, row: 9 },
  { id: 'biblio-2', type: 'DOUBLE_BOOKSHELF', col: 13, row: 9 },
  { id: 'pizarron', type: 'WHITEBOARD', col: 15, row: 9 },
  { id: 'planta-1', type: 'PLANT', col: 11, row: 19 },
  { id: 'planta-2', type: 'LARGE_PLANT', col: 15, row: 18 },
];

/** Plano con una sala por entrada, armado a partir del plano original. */
export function generarLayout(
  original: Record<string, unknown>,
  salas: Sala[],
): Record<string, unknown> {
  const C = original.cols as number;
  const tiles = original.tiles as number[];
  const colores = (original.tileColors as unknown[] | undefined) ?? tiles.map(() => null);
  const muebles = (original.furniture as Mueble[]).filter(
    (f) => f.col >= COL0 && f.col <= COL1 && f.row >= FILA0 && f.row <= FILA1,
  );
  const filasSalas = Math.ceil(salas.length / POR_FILA);
  const cols = POR_FILA * ANCHO;
  const rows = MARGEN + filasSalas * ALTO + 1;
  const t: number[] = new Array(cols * rows).fill(VACIO);
  const tc: unknown[] = new Array(cols * rows).fill(null);
  const area: Array<string | null> = new Array(cols * rows).fill(null);
  const furniture: Mueble[] = [];
  // Piso y pared del anexo: los mismos que la sala original.
  const piso = tiles[(FILA0 + 2) * C + COL0 + 1];
  const colorPiso = colores[(FILA0 + 2) * C + COL0 + 1] ?? null;
  const colorPared = colores[(FILA0 + 1) * C + COL0] ?? null;
  salas.forEach(({ nombre }, i) => {
    const dc = (i % POR_FILA) * ANCHO - COL0;
    const df = MARGEN + Math.floor(i / POR_FILA) * ALTO - FILA0;
    const sufijo = nombre.toLowerCase().replace(/\s+/g, '-');
    for (let r = FILA0; r <= FILA1; r++) {
      for (let c = COL0; c <= COL1; c++) {
        const k = r * C + c;
        const j = (r + df) * cols + (c + dc);
        t[j] = tiles[k];
        tc[j] = colores[k] ?? null;
        if (tiles[k] !== VACIO && tiles[k] !== PARED && r > FILA0 + 1) area[j] = nombre;
      }
      // Anexo: pared arriba (fila 10) y a la derecha, piso en el resto; la fila 9 queda vacía (decoración).
      for (let c = COL1 + 1; c <= COL1 + ANEXO + 1; c++) {
        if (r === FILA0) continue;
        const j = (r + df) * cols + (c + dc);
        const esPared = r === FILA0 + 1 || c === COL1 + ANEXO + 1;
        t[j] = esPared ? PARED : piso;
        tc[j] = esPared ? colorPared : colorPiso;
        if (!esPared) area[j] = nombre;
      }
    }
    for (const f of muebles) {
      furniture.push({
        ...f,
        uid: `${f.uid}-${sufijo}`,
        col: f.col + dc,
        row: f.row + df,
      });
    }
    for (const { id, ...f } of MUEBLES_ANEXO) {
      furniture.push({ ...f, uid: `anexo-${id}-${sufijo}`, col: f.col + dc, row: f.row + df });
    }
  });
  return {
    version: original.version,
    cols,
    rows,
    layoutRevision: original.layoutRevision,
    tiles: t,
    tileColors: tc,
    furniture,
    areas: salas.map((s) => ({ label: s.nombre, color: s.color })),
    areaTiles: area,
  };
}

/** Copia `ruta` a `ruta.antes-<marca>` y deja solo las 5 copias más nuevas. */
function copiaDeSeguridad(ruta: string, marca: string): void {
  if (!fs.existsSync(ruta)) return;
  fs.copyFileSync(ruta, `${ruta}.antes-${marca}`);
  const dir = path.dirname(ruta);
  const prefijo = `${path.basename(ruta)}.antes-`;
  const viejas = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefijo))
    .sort()
    .slice(0, -5);
  for (const f of viejas) fs.rmSync(path.join(dir, f), { force: true });
}

export interface ResultadoRecarga {
  salas: string[];
  puestos: number;
}

/**
 * Vuelve a leer los proyectos de Orca, regenera el plano y las asignaciones (con copia de lo anterior) y actualiza
 * las reglas carpeta → sala. No reinicia el servidor: los clientes recargan la página y reciben todo de nuevo.
 */
export function recargarOficina(original: Record<string, unknown>): ResultadoRecarga {
  const { salas, reglas } = salasDesde(leerProyectosOrca());
  setReglasExtra(reglas);
  const layout = generarLayout(original, salas);
  const dir = path.join(os.homedir(), LAYOUT_FILE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const marca = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  copiaDeSeguridad(path.join(dir, LAYOUT_FILE_NAME), marca);
  copiaDeSeguridad(path.join(dir, 'config.json'), marca);
  writeLayoutToFile(layout);
  const cfg = readConfig();
  cfg.standalone.areaMappings = asignacion(salas, reglas);
  cfg.standalone.showAreas = true;
  writeConfig(cfg);
  const puestos = (layout.furniture as Mueble[]).filter((f) => /CHAIR|BENCH/.test(f.type)).length;
  return { salas: salas.map((s) => s.nombre), puestos };
}

/** Al arrancar: carga las reglas de los proyectos nuevos de Orca sin tocar el plano. */
export function cargarReglasOrca(): void {
  setReglasExtra(salasDesde(leerProyectosOrca()).reglas);
}
