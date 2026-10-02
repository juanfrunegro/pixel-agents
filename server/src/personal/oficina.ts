/**
 * Personal (copia de juanfrunegro): oficina con una oficina chica por proyecto de Orca y salas compartidas (Diseño,
 * Biblioteca, Cafetería, Reuniones, Presentaciones) alrededor del Brain, regenerable en caliente con el botón
 * "Recargar". Cada sala es un Área: cada proyecto cae en la suya y en las compartidas no tiene puesto nadie (los agentes
 * van ahí según lo que hacen, ver webview-ui/src/personal/lugares.ts). Los uid de los muebles llevan el nombre de la
 * sala, así que una sala que ya existía conserva sus asientos al recargar.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  esSalaComun,
  SALA_BIBLIOTECA,
  SALA_CAFETERIA,
  SALA_DISENO,
  SALA_PRESENTACIONES,
  SALA_REUNIONES,
} from '../../../core/src/salasComunes.js';
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
  const tienen = new Set([...salas.map((s) => s.nombre), 'Brain']); // el Brain siempre está, en el centro
  const a: Record<string, string[]> = {};
  for (const nombre of new Set([...PROYECTOS_CONOCIDOS, ...reglas.map(([, n]) => n)])) {
    a[nombre] = [tienen.has(nombre) ? nombre : 'Otros'];
  }
  return a;
}

// ── Plano ───────────────────────────────────────────────────────
//
// Tres franjas de salas separadas por pasillos de 2 filas, para que toda la oficina entre en una pantalla:
//
//   arriba:  oficina  oficina  | Diseño     |  oficina  oficina
//   medio:   Biblioteca        |   BRAIN    |  Reuniones
//   abajo:   oficina  oficina  | Cafetería  Presentaciones |  oficina
//
// y una franja más de oficinas abajo solo si hay más de 7 proyectos. Las oficinas de proyecto son chicas y solo tienen
// escritorios; biblioteca, atriles, pizarrones, café y reuniones son compartidos (core/src/salasComunes.ts). Cada sala
// tiene pared arriba (con puertas desde el pasillo, salvo en la primera franja) y a los costados; abajo queda abierta
// al pasillo, como en el plano original.

const VACIO = 255; // TileType.VOID
const INTERIOR = 7; // filas de piso de cada sala
const PASILLO = 2;
const PASO_FRANJA = 1 + INTERIOR + PASILLO; // pared + interior + pasillo
const ANCHO_OFICINA = 12; // con su pared izquierda: 11 de piso, tres escritorios por fila
const OFICINAS_POR_FRANJA_EXTRA = 4;

const COLORES_COMUNES: Record<string, string> = {
  [SALA_DISENO]: '#d46fb8',
  [SALA_BIBLIOTECA]: '#a07850',
  [SALA_CAFETERIA]: '#d9a441',
  [SALA_REUNIONES]: '#5d8fd9',
  [SALA_PRESENTACIONES]: '#e8c547',
};

type Tipo =
  'oficina' | 'brain' | 'diseno' | 'biblioteca' | 'reuniones' | 'cafeteria' | 'presentaciones';

interface Pieza {
  tipo: Tipo;
  sala: Sala;
  ancho: number; // columnas, contando su pared izquierda
}

interface Mueble {
  uid: string;
  type: string;
  col: number;
  row: number;
  [k: string]: unknown;
}

/** Mueble relativo al piso de la sala: dx desde la primera columna de piso, dy desde la primera fila (−2 = sobre la pared). */
interface MuebleRelativo {
  id: string;
  type: string;
  dx: number;
  dy: number;
}

interface Contenido {
  muebles: MuebleRelativo[];
  /** Columnas (dx) de la pared de arriba que son puerta al pasillo. */
  puertas: number[];
}

const PARED_ARRIBA = -2;

/** Oficina de proyecto: dos filas de tres escritorios con su PC y su banco (6 puestos). Finanzas cambia uno por la mesa contable. */
function oficina(conMesaContable: boolean): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dy of [0, 3]) {
    for (const dx of [0, 4, 8]) {
      if (conMesaContable && dy === 3 && dx === 8) {
        m.push({ id: 'mesa-contable', type: 'MESA_CONTABLE', dx: 9, dy: 3 });
        continue;
      }
      const k = `${dy}-${dx}`;
      m.push({ id: `escritorio-${k}`, type: 'DESK_FRONT', dx, dy });
      m.push({ id: `pc-${k}`, type: 'PC_FRONT_OFF', dx: dx + 1, dy });
      m.push({ id: `banco-${k}`, type: 'CUSHIONED_BENCH', dx: dx + 1, dy: dy + 2 });
    }
  }
  // El medio de la pared de arriba queda libre: ahí va el nombre de la sala.
  m.push({ id: 'reloj', type: 'CLOCK', dx: 0, dy: PARED_ARRIBA });
  m.push({ id: 'cuadro-1', type: 'SMALL_PAINTING', dx: 9, dy: PARED_ARRIBA });
  m.push({ id: 'cuadro-2', type: 'SMALL_PAINTING_2', dx: 10, dy: PARED_ARRIBA });
  return { muebles: m, puertas: [3, 7] };
}

/** Brain, en el centro: seis escritorios como una oficina, con plantas y lugar en la pared. */
function brain(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dy of [0, 3]) {
    for (const dx of [3, 7, 11]) {
      const k = `${dy}-${dx}`;
      m.push({ id: `escritorio-${k}`, type: 'DESK_FRONT', dx, dy });
      m.push({ id: `pc-${k}`, type: 'PC_FRONT_OFF', dx: dx + 1, dy });
      m.push({ id: `banco-${k}`, type: 'CUSHIONED_BENCH', dx: dx + 1, dy: dy + 2 });
    }
  }
  m.push({ id: 'planta-1', type: 'PLANT', dx: 0, dy: 0 });
  m.push({ id: 'planta-2', type: 'PLANT_2', dx: 0, dy: 4 });
  m.push({ id: 'planta-grande', type: 'LARGE_PLANT', dx: 16, dy: 0 });
  m.push({ id: 'cuadro', type: 'LARGE_PAINTING', dx: 17, dy: PARED_ARRIBA });
  m.push({ id: 'reloj', type: 'CLOCK', dx: 13, dy: PARED_ARRIBA });
  m.push({ id: 'planta-colgante', type: 'HANGING_PLANT', dx: 4, dy: PARED_ARRIBA });
  return { muebles: m, puertas: [1, 15] };
}

/** Diseño: dos filas de atriles. */
function diseno(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dy of [0, 3]) {
    for (const dx of [1, 3, 5, 7]) m.push({ id: `atril-${dy}-${dx}`, type: 'EASEL', dx, dy });
  }
  m.push({ id: 'cuadro-grande', type: 'LARGE_PAINTING', dx: 0, dy: PARED_ARRIBA });
  m.push({ id: 'cuadro', type: 'SMALL_PAINTING', dx: 7, dy: PARED_ARRIBA });
  m.push({ id: 'planta-colgante', type: 'HANGING_PLANT', dx: 8, dy: PARED_ARRIBA });
  return { muebles: m, puertas: [0, 4] };
}

/** Biblioteca: bibliotecas en la pared y dos islas de estantes, con la entrada (y el nombre) en el medio. */
function biblioteca(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dx of [0, 2, 4, 12, 14, 16]) {
    m.push({ id: `pared-${dx}`, type: 'DOUBLE_BOOKSHELF', dx, dy: PARED_ARRIBA });
  }
  for (const dx of [1, 4, 12, 15]) {
    m.push({ id: `estante-${dx}`, type: 'DOUBLE_BOOKSHELF', dx, dy: 2 });
  }
  m.push({ id: 'mesa', type: 'SMALL_TABLE_FRONT', dx: 8, dy: 4 });
  m.push({ id: 'planta-1', type: 'PLANT', dx: 0, dy: 5 });
  m.push({ id: 'planta-2', type: 'LARGE_PLANT', dx: 16, dy: 4 });
  return { muebles: m, puertas: [8, 9] };
}

/** Reuniones: dos mesas de cuatro sillas y los pizarrones (para planificar). */
function reuniones(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const [n, tx] of [
    [1, 2],
    [2, 9],
  ] as const) {
    m.push({ id: `mesa-${n}`, type: 'TABLE_FRONT', dx: tx, dy: 1 });
    m.push({ id: `silla-${n}-1`, type: 'WOODEN_CHAIR_SIDE', dx: tx - 1, dy: 1 });
    m.push({ id: `silla-${n}-2`, type: 'WOODEN_CHAIR_SIDE', dx: tx - 1, dy: 3 });
    m.push({ id: `silla-${n}-3`, type: 'WOODEN_CHAIR_SIDE:left', dx: tx + 3, dy: 1 });
    m.push({ id: `silla-${n}-4`, type: 'WOODEN_CHAIR_SIDE:left', dx: tx + 3, dy: 3 });
    m.push({ id: `cafe-${n}`, type: 'COFFEE', dx: tx + 1, dy: 3 });
  }
  m.push({ id: 'pizarron-1', type: 'WHITEBOARD', dx: 14, dy: PARED_ARRIBA });
  m.push({ id: 'pizarron-2', type: 'WHITEBOARD', dx: 16, dy: PARED_ARRIBA });
  m.push({ id: 'reloj', type: 'CLOCK', dx: 3, dy: PARED_ARRIBA });
  m.push({ id: 'planta-colgante', type: 'HANGING_PLANT', dx: 1, dy: PARED_ARRIBA });
  m.push({ id: 'planta', type: 'LARGE_PLANT', dx: 15, dy: 3 });
  return { muebles: m, puertas: [6, 13] };
}

/** Cafetería: dos livings (sillones alrededor de una mesa ratona con café) y una mesita. */
function cafeteria(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const [n, cx] of [
    [1, 2],
    [2, 7],
  ] as const) {
    m.push({ id: `mesa-${n}`, type: 'COFFEE_TABLE', dx: cx, dy: 2 });
    m.push({ id: `cafe-${n}`, type: 'COFFEE', dx: cx, dy: 3 });
    m.push({ id: `sillon-${n}-arriba`, type: 'SOFA_FRONT', dx: cx, dy: 1 });
    m.push({ id: `sillon-${n}-izq`, type: 'SOFA_SIDE', dx: cx - 1, dy: 2 });
    m.push({ id: `sillon-${n}-der`, type: 'SOFA_SIDE:left', dx: cx + 2, dy: 2 });
    m.push({ id: `sillon-${n}-abajo`, type: 'SOFA_BACK', dx: cx, dy: 4 });
  }
  m.push({ id: 'mesita', type: 'SMALL_TABLE_FRONT', dx: 1, dy: 5 });
  m.push({ id: 'cafe-mesita', type: 'COFFEE', dx: 2, dy: 6 });
  m.push({ id: 'planta', type: 'PLANT_2', dx: 9, dy: 5 });
  m.push({ id: 'cuadro', type: 'SMALL_PAINTING_2', dx: 0, dy: PARED_ARRIBA });
  m.push({ id: 'cuadro-grande', type: 'LARGE_PAINTING', dx: 8, dy: PARED_ARRIBA });
  return { muebles: m, puertas: [5, 10] };
}

/**
 * Presentaciones: pantalla (pizarrón, a un costado para que el nombre de la sala se lea) y dos filas de sillas. Se
 * "prende" en la tanda 2.
 */
function presentaciones(): Contenido {
  const m: MuebleRelativo[] = [];
  m.push({ id: 'pantalla-1', type: 'WHITEBOARD', dx: 1, dy: PARED_ARRIBA });
  for (const dy of [2, 4]) {
    for (const dx of [1, 2, 3, 5, 6, 7]) {
      m.push({ id: `silla-${dy}-${dx}`, type: 'WOODEN_CHAIR_BACK', dx, dy });
    }
  }
  m.push({ id: 'planta-colgante', type: 'HANGING_PLANT', dx: 8, dy: PARED_ARRIBA });
  return { muebles: m, puertas: [0, 4] };
}

function contenido(p: Pieza): Contenido {
  switch (p.tipo) {
    case 'oficina':
      return oficina(p.sala.nombre === 'Finanzas');
    case 'brain':
      return brain();
    case 'diseno':
      return diseno();
    case 'biblioteca':
      return biblioteca();
    case 'reuniones':
      return reuniones();
    case 'cafeteria':
      return cafeteria();
    case 'presentaciones':
      return presentaciones();
  }
}

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const comun = (tipo: Tipo, nombre: string, ancho: number): Pieza => ({
  tipo,
  sala: { nombre, color: COLORES_COMUNES[nombre] },
  ancho,
});

/** Las franjas del plano: qué sala va en cada lugar, de izquierda a derecha. */
export function franjas(salas: Sala[]): Pieza[][] {
  const brainSala = salas.find((s) => s.nombre === 'Brain') ?? {
    nombre: 'Brain',
    color: COLORES.Brain,
  };
  const ofi = salas
    .filter((s) => s.nombre !== 'Brain')
    .map((sala): Pieza => ({ tipo: 'oficina', sala, ancho: ANCHO_OFICINA }));
  const arriba = [...ofi.slice(0, 2), comun('diseno', SALA_DISENO, 10), ...ofi.slice(2, 4)];
  const medio = [
    comun('biblioteca', SALA_BIBLIOTECA, 19),
    { tipo: 'brain' as const, sala: brainSala, ancho: 20 },
    comun('reuniones', SALA_REUNIONES, 19),
  ];
  const abajo = [
    ...ofi.slice(4, 6),
    comun('cafeteria', SALA_CAFETERIA, 12),
    comun('presentaciones', SALA_PRESENTACIONES, 10),
    ...ofi.slice(6, 7),
  ];
  const resto: Pieza[][] = [];
  for (let i = 7; i < ofi.length; i += OFICINAS_POR_FRANJA_EXTRA) {
    resto.push(ofi.slice(i, i + OFICINAS_POR_FRANJA_EXTRA));
  }
  return [arriba, medio, abajo, ...resto];
}

/** Plano compacto con oficinas por proyecto y salas compartidas. `original` aporta pisos, pared y colores. */
export function generarLayout(
  original: Record<string, unknown>,
  salas: Sala[],
): Record<string, unknown> {
  const C = original.cols as number;
  const tiles = original.tiles as number[];
  const colores = (original.tileColors as unknown[] | undefined) ?? tiles.map(() => null);
  const muestra = (c: number, r: number) => ({
    t: tiles[r * C + c],
    color: colores[r * C + c] ?? null,
  });
  const pisoOficina = muestra(1, 11); // madera de la sala izquierda
  const pisoComun = muestra(11, 11); // piso de la sala derecha (living)
  const pisoPasillo = muestra(11, 19);
  const pared = muestra(0, 11);
  const pisoDe = (tipo: Tipo) =>
    tipo === 'oficina' || tipo === 'brain' || tipo === 'biblioteca' ? pisoOficina : pisoComun;

  const filas = franjas(salas);
  const anchoDe = (f: Pieza[]) => f.reduce((s, p) => s + p.ancho, 0) + 1;
  const cols = Math.max(...filas.map(anchoDe));
  const paredDe = (b: number) => 1 + b * PASO_FRANJA;
  const rows = paredDe(filas.length - 1) + 1 + INTERIOR;

  const t: number[] = new Array(cols * rows).fill(VACIO);
  const tc: unknown[] = new Array(cols * rows).fill(null);
  const area: Array<string | null> = new Array(cols * rows).fill(null);
  const furniture: Mueble[] = [];
  const poner = (
    c: number,
    r: number,
    m: { t: number; color: unknown },
    a: string | null = null,
  ) => {
    const j = r * cols + c;
    t[j] = m.t;
    tc[j] = m.color;
    area[j] = a;
  };

  filas.forEach((franja, b) => {
    const filaPared = paredDe(b);
    // Pasillo debajo (salvo la última franja), de punta a punta.
    if (b < filas.length - 1) {
      for (let r = filaPared + 1 + INTERIOR; r < filaPared + 1 + INTERIOR + PASILLO; r++) {
        for (let c = 0; c < cols; c++) poner(c, r, pisoPasillo);
      }
    }
    let x = Math.floor((cols - anchoDe(franja)) / 2);
    for (const p of franja) {
      const { muebles, puertas } = contenido(p);
      const piso = pisoDe(p.tipo);
      for (let c = x; c < x + p.ancho; c++) poner(c, filaPared, pared);
      for (let r = filaPared + 1; r <= filaPared + INTERIOR; r++) {
        poner(x, r, pared);
        for (let c = x + 1; c < x + p.ancho; c++) poner(c, r, piso, p.sala.nombre);
      }
      // Puertas desde el pasillo de arriba (la primera franja no tiene pasillo arriba: se entra por abajo).
      if (b > 0) for (const dx of puertas) poner(x + 1 + dx, filaPared, piso);
      const sufijo = slug(p.sala.nombre);
      for (const f of muebles) {
        furniture.push({
          uid: `${sufijo}-${f.id}`,
          type: f.type,
          col: x + 1 + f.dx,
          row: filaPared + 1 + f.dy,
        });
      }
      x += p.ancho;
    }
    // Pared derecha de la última sala de la franja.
    for (let r = filaPared; r <= filaPared + INTERIOR; r++) poner(x, r, pared);
  });

  const enPlano = filas.flat().map((p) => p.sala);
  return {
    version: original.version,
    cols,
    rows,
    layoutRevision: original.layoutRevision,
    tiles: t,
    tileColors: tc,
    furniture,
    areas: enPlano.map((s) => ({ label: s.nombre, color: s.color })),
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
  const cols = layout.cols as number;
  const areaTiles = layout.areaTiles as Array<string | null>;
  const puestos = (layout.furniture as Mueble[]).filter(
    (f) => /CHAIR|BENCH/.test(f.type) && !esSalaComun(areaTiles[(f.row + 1) * cols + f.col]),
  ).length;
  return { salas: salas.map((s) => s.nombre), puestos };
}

/** Al arrancar: carga las reglas de los proyectos nuevos de Orca sin tocar el plano. */
export function cargarReglasOrca(): void {
  setReglasExtra(salasDesde(leerProyectosOrca()).reglas);
}
