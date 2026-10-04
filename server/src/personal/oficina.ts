/**
 * Personal (copia de juanfrunegro): oficina con una oficina chica por proyecto de Orca y salas compartidas (Diseño,
 * Biblioteca, Cafetería, Reuniones, Presentaciones) alrededor del Brain, regenerable en caliente con el botón
 * "Recargar". Cada sala es un Área: cada proyecto cae en la suya y en las compartidas no tiene puesto nadie (los agentes
 * van ahí según lo que hacen, ver webview-ui/src/personal/lugares.ts). Los uid de los muebles llevan el nombre de la
 * sala, así que una sala que ya existía conserva sus asientos al recargar.
 */
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';

import {
  esAsientoReservado,
  ESCENARIO_FILA,
  esSalaComun,
  SALA_BIBLIOTECA,
  SALA_CAFETERIA,
  SALA_CONTRATISTAS,
  SALA_DISENO,
  SALA_PRESENTACIONES,
  SALA_REUNIONES,
} from '../../../core/src/salasComunes.js';
import { readConfig, writeConfig } from '../configPersistence.js';
import { LAYOUT_FILE_DIR, LAYOUT_FILE_NAME } from '../constants.js';
import { readLayoutFromFile, writeLayoutToFile } from '../layoutPersistence.js';
import {
  guardarExtra,
  leerCarpetas,
  mismaRuta,
  modificado,
  subcarpetas,
  validarCarpeta,
} from './carpetas.js';
import {
  asignables,
  guardarOcupacion,
  leerOcupacion,
  type Ocupacion,
  ocupacionDelPlano,
  rutaOcupacion,
  salaDelLugar,
} from './ocupacion.js';
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
/** Oficina sin proyecto (ocupacion.ts): gris apagado, como el nombre tenue "Libre". */
const COLOR_LIBRE = '#5d6370';
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

type RepoCrudo = { displayName?: unknown; path?: unknown; badgeColor?: unknown };

function deRepos(repos: RepoCrudo[] | undefined): ProyectoOrca[] {
  return (repos ?? [])
    .filter((r) => typeof r.displayName === 'string' && typeof r.path === 'string')
    .map((r) => ({
      nombre: (r.displayName as string).trim(),
      ruta: r.path as string,
      color: typeof r.badgeColor === 'string' ? r.badgeColor : undefined,
    }));
}

/**
 * Base SQLite donde las versiones nuevas de Orca guardan los proyectos (profile-state.db, documento "repos"). Desde
 * esa migración orca-data.json quedó congelado: un proyecto agregado después solo está acá. PIXEL_ORCA_DB la pisa.
 */
export function rutaDbOrca(): string | null {
  if (process.env.PIXEL_ORCA_DB) return process.env.PIXEL_ORCA_DB;
  if (process.env.PIXEL_ORCA_DATA) return null; // tests con un orca-data.json armado: no mirar la base real
  const json = rutaDatosOrca();
  if (!json) return null;
  const ruta = path.join(path.dirname(json), 'profile-state.db');
  return fs.existsSync(ruta) ? ruta : null;
}

/** Proyectos del documento "repos" de profile-state.db (solo lectura). null si no se puede leer. */
export function leerReposDb(ruta: string | null): ProyectoOrca[] | null {
  if (!ruta) return null;
  try {
    // node:sqlite viene con Node ≥ 22.5; con uno más viejo cae al JSON.
    const req = createRequire(path.join(process.cwd(), 'pixel-agents.js'));
    const { DatabaseSync } = req('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(ruta, { readOnly: true });
    try {
      const fila = db
        .prepare("SELECT payload FROM profile_state_documents WHERE domain = 'repos'")
        .get() as { payload?: unknown } | undefined;
      if (typeof fila?.payload !== 'string') return null;
      const repos = JSON.parse(fila.payload) as unknown;
      return Array.isArray(repos) ? deRepos(repos as RepoCrudo[]) : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * Proyectos agregados a Orca. Sin argumento: la base de Orca (profile-state.db) y, si no está o no se puede leer, el
 * orca-data.json. Con una ruta: ese JSON. Lista vacía si Orca no está instalado o no se puede leer.
 */
export function leerProyectosOrca(ruta?: string | null): ProyectoOrca[] {
  if (ruta === undefined) {
    const db = leerReposDb(rutaDbOrca());
    if (db) return db;
    ruta = rutaDatosOrca();
  }
  if (!ruta) return [];
  try {
    const d = JSON.parse(fs.readFileSync(ruta, 'utf8')) as { repos?: RepoCrudo[] };
    return deRepos(d.repos);
  } catch {
    return [];
  }
}

/**
 * Proyectos que pueden tener sala: los de Orca y las carpetas que Juan ya puso en una oficina sin que estén en Orca
 * (carpetas.ts). Se lee fresco cada vez (un proyecto recién agregado a Orca aparece enseguida), con 3 s de caché para
 * no abrir la base varias veces seguidas en el mismo pedido.
 */
let cacheProyectos: { hecho: number; lista: ProyectoOrca[] } | null = null;
export function leerProyectos(ahora = Date.now()): ProyectoOrca[] {
  if (cacheProyectos && ahora - cacheProyectos.hecho < 3_000) return cacheProyectos.lista;
  const lista = [...leerProyectosOrca()];
  for (const e of leerCarpetas().extras) {
    if (!lista.some((p) => mismaRuta(p.ruta, e.ruta)))
      lista.push({ nombre: e.nombre, ruta: e.ruta });
  }
  cacheProyectos = { hecho: ahora, lista };
  return lista;
}

/** Olvida la caché (al guardar una carpeta nueva). */
export function olvidarProyectos(): void {
  cacheProyectos = null;
}

export type Origen = 'orca' | 'carpeta' | 'otra';

/** Algo que se puede poner en una oficina (menú "Asignar proyecto ▸"). */
export interface Candidato {
  /** Nombre de la sala que tendría (Chaina, Coucou…). */
  nombre: string;
  ruta: string;
  origen: Origen;
  /** Última modificación de la carpeta (ms), para ordenar. */
  modificado: number;
}

/**
 * Todo lo que se puede asignar: proyectos de Orca, carpetas ya agregadas a mano y las subcarpetas de la raíz de
 * proyectos (IA Tools) que no son ninguna de las anteriores. Sin repetir sala ni ruta, sin el Brain ni "Otros"; la
 * carpeta tocada más recientemente primero.
 */
export function candidatos(
  orca: ProyectoOrca[] = leerProyectosOrca(),
  carpetas = leerCarpetas(),
  sub: (raiz: string) => Array<{ nombre: string; ruta: string; modificado?: number }> = subcarpetas,
  mtime: (ruta: string) => number = modificado,
): Candidato[] {
  const out: Candidato[] = [];
  const agregar = (p: ProyectoOrca, origen: Origen, mod?: number) => {
    const nombre = salaDeProyecto(p);
    if (!nombre || nombre === 'Brain' || nombre === 'Otros') return;
    if (out.some((c) => c.nombre === nombre || mismaRuta(c.ruta, p.ruta))) return;
    out.push({ nombre, ruta: p.ruta, origen, modificado: mod ?? mtime(p.ruta) });
  };
  for (const p of orca) agregar(p, 'orca');
  for (const e of carpetas.extras) agregar({ nombre: e.nombre, ruta: e.ruta }, 'otra');
  for (const s of sub(carpetas.raiz))
    agregar({ nombre: s.nombre, ruta: s.ruta }, 'carpeta', s.modificado);
  return out.sort((a, b) => b.modificado - a.modificado);
}

let cacheCandidatos: { hecho: number; lista: Candidato[] } | null = null;
/** candidatos() con 5 s de caché (leer \\wsl.localhost tarda); `forzar` la vuelve a leer igual. */
export function candidatosFrescos(forzar = false, ahora = Date.now()): Candidato[] {
  if (!forzar && cacheCandidatos && ahora - cacheCandidatos.hecho < 5_000) {
    return cacheCandidatos.lista;
  }
  cacheCandidatos = { hecho: ahora, lista: candidatos() };
  return cacheCandidatos.lista;
}

/**
 * Carpeta para "Otra carpeta…": la valida (carpetas.ts) y le da nombre de sala. Error si no sirve o si ya hay otro
 * proyecto con ese nombre en otra carpeta.
 */
export function candidatoDeRuta(
  crudo: unknown,
  existentes: Candidato[] = candidatosFrescos(),
  validar: (r: unknown) => { ruta: string } | { error: string } = validarCarpeta,
): Candidato | { error: string } {
  const v = validar(crudo);
  if ('error' in v) return v;
  const ya = existentes.find((c) => mismaRuta(c.ruta, v.ruta));
  if (ya) return ya;
  const nombre = path.win32.basename(v.ruta);
  const p = { nombre, ruta: v.ruta };
  const sala = salaDeProyecto(p);
  if (!sala || sala === 'Brain' || sala === 'Otros') {
    return { error: 'Esa carpeta ya es parte de otra sala fija (Brain u Otros).' };
  }
  if (existentes.some((c) => c.nombre === sala)) {
    return { error: `Ya hay un proyecto que se llama ${sala} en otra carpeta.` };
  }
  return { nombre: sala, ruta: v.ruta, origen: 'otra', modificado: modificado(v.ruta) };
}

/** Deja guardada en carpetas.json una carpeta que no es de Orca (para que sus agentes caigan en su oficina). */
export function recordarCarpeta(c: Candidato, orca: ProyectoOrca[] = leerProyectosOrca()): void {
  if (orca.some((p) => mismaRuta(p.ruta, c.ruta))) return;
  guardarExtra({ nombre: path.win32.basename(c.ruta.replace(/[\\/]+$/, '')), ruta: c.ruta });
  olvidarProyectos();
  cacheCandidatos = null;
}

const bonito = (s: string): string => {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

/** Sala de un proyecto de Orca: su nombre de siempre si es conocido (Chaina, Poker, ERP…) o su nombre en Orca. */
export function salaDeProyecto(p: ProyectoOrca): string {
  return proyectoDe({ cwd: p.ruta }, false) ?? bonito(p.nombre);
}

/** Proyecto de Orca de cada sala (el primero, si dos caen en la misma). */
export function proyectosPorSala(proyectos = leerProyectos()): Map<string, ProyectoOrca> {
  const m = new Map<string, ProyectoOrca>();
  for (const p of proyectos) {
    const sala = salaDeProyecto(p);
    if (sala && sala !== 'Otros' && !m.has(sala)) m.set(sala, p);
  }
  return m;
}

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
    const nombre = salaDeProyecto(p);
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

/**
 * Salas del plano según qué proyecto ocupa cada oficina (ocupacion.ts): las oficinas en su lugar fijo (libres como
 * "Libre N"), el Brain y "Otros" al final. Los colores salen de salasDesde (los de siempre o los de Orca); un proyecto
 * que ya no está en Orca conserva su oficina con su color conocido o uno de la paleta.
 */
export function salasConOcupacion(o: Ocupacion, deOrca: Sala[]): Sala[] {
  const color = new Map(deOrca.map((s) => [s.nombre, s.color]));
  // Cada oficina ocupada con un color distinto de las otras (y del Brain y Otros): si el suyo ya lo usa otra sala,
  // el primero libre de la paleta.
  const usados = new Set([COLORES.Brain, COLORES.Otros]);
  const lugares = o.map((p, i): Sala => {
    if (!p) return { nombre: salaDelLugar(o, i), color: COLOR_LIBRE };
    let c = color.get(p) ?? COLORES[p];
    if (!c || usados.has(c)) c = PALETA.find((x) => !usados.has(x)) ?? c ?? PALETA[0];
    usados.add(c);
    return { nombre: p, color: c };
  });
  return [
    ...lugares,
    { nombre: 'Brain', color: color.get('Brain') ?? COLORES.Brain },
    { nombre: 'Otros', color: COLORES.Otros },
  ];
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
//   medio:   Contratistas Biblioteca | BRAIN |  Reuniones
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
  [SALA_CONTRATISTAS]: '#e0a030',
};

type Tipo =
  | 'oficina'
  | 'brain'
  | 'diseno'
  | 'biblioteca'
  | 'reuniones'
  | 'cafeteria'
  | 'presentaciones'
  | 'contratistas';

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

/** Color de alfombra del motor (CarpetTile.color / accentColor): tono, saturación, brillo y contraste. */
interface ColorAlfombra {
  h: number;
  s: number;
  b: number;
  c: number;
  colorize: true;
}

/** Alfombra rectangular relativa al piso de la sala (se camina por encima; el motor dibuja los bordes). */
interface Alfombra {
  dx: number;
  dy: number;
  w: number;
  h: number;
  variant: number;
  color: ColorAlfombra;
  accentColor: ColorAlfombra;
}

interface Contenido {
  muebles: MuebleRelativo[];
  /** Columnas (dx) de la pared de arriba que son puerta al pasillo. */
  puertas: number[];
  alfombras?: Alfombra[];
}

const tono = (h: number, s: number, b: number, c = 0): ColorAlfombra => ({
  h,
  s,
  b,
  c,
  colorize: true,
});

const PARED_ARRIBA = -2;

/**
 * Escritorio con dueño por rol (manager o CEO): el escritorio y la PC de siempre, con silla en vez de banco. La silla
 * queda reservada (esAsientoReservado) y el webview le pone una placa con el nombre.
 */
function escritorioDeRol(m: MuebleRelativo[], rol: string, dx: number, dy: number): void {
  m.push({ id: `${rol}-escritorio`, type: 'DESK_FRONT', dx, dy });
  m.push({ id: `${rol}-pc`, type: 'PC_FRONT_OFF', dx: dx + 1, dy });
  m.push({ id: `${rol}-silla`, type: 'CUSHIONED_CHAIR_BACK', dx: dx + 1, dy: dy + 2 });
}

/**
 * Oficina de proyecto: dos filas de tres escritorios con su PC y su banco. El de arriba al centro es el del manager del
 * proyecto (oficina por niveles): queda vacío hasta que lo lanzan, y los agentes que él lanza se sientan a su lado. Quedan
 * 5 puestos para las sesiones. Finanzas cambia uno por la mesa contable.
 */
function oficina(conMesaContable: boolean): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dy of [0, 3]) {
    for (const dx of [0, 4, 8]) {
      if (dy === 0 && dx === 4) {
        escritorioDeRol(m, 'manager', dx, dy);
        continue;
      }
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

/**
 * Brain, en el centro: la oficina del CEO. Arriba al centro, el escritorio del CEO (adonde va la sesión mientras un
 * manager trabaja para ella); los otros cinco, como una oficina; plantas y lugar en la pared.
 */
function brain(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dy of [0, 3]) {
    for (const dx of [3, 7, 11]) {
      if (dy === 0 && dx === 7) {
        escritorioDeRol(m, 'ceo', dx, dy);
        continue;
      }
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
  // La pizarra de pendientes (tres pizarrones juntos; el webview escribe encima, ver webview-ui/src/personal/pizarra.ts).
  for (const [n, dx] of [
    [1, 2],
    [2, 4],
    [3, 6],
  ] as const) {
    m.push({ id: `pizarra-${n}`, type: 'WHITEBOARD', dx, dy: PARED_ARRIBA });
  }
  return { muebles: m, puertas: [1, 15] };
}

/**
 * Diseño: un estudio. Dos grupos de tres atriles (arriba a la izquierda y abajo a la derecha) alrededor de una alfombra
 * de color con la mesa de luz y sus muestras; plantas, un cuadro y un mural en la pared (el medio queda para el nombre).
 * La fila de abajo queda libre: se entra desde el pasillo.
 */
function diseno(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dx of [0, 1, 2]) m.push({ id: `atril-0-${dx}`, type: 'EASEL', dx, dy: 0 });
  for (const dx of [6, 7, 8]) m.push({ id: `atril-3-${dx}`, type: 'EASEL', dx, dy: 3 });
  m.push({ id: 'mesa-luz', type: 'MESA_LUZ', dx: 4, dy: 1 });
  m.push({ id: 'planta', type: 'PLANT', dx: 8, dy: 0 });
  m.push({ id: 'cactus', type: 'CACTUS', dx: 0, dy: 4 });
  m.push({ id: 'cuadro-grande', type: 'LARGE_PAINTING', dx: 0, dy: PARED_ARRIBA });
  m.push({ id: 'planta-colgante', type: 'HANGING_PLANT', dx: 2, dy: PARED_ARRIBA });
  m.push({ id: 'mural', type: 'MURAL', dx: 6, dy: PARED_ARRIBA });
  return {
    muebles: m,
    puertas: [0, 4],
    alfombras: [
      {
        dx: 3,
        dy: 0,
        w: 4,
        h: 5,
        variant: 0,
        color: tono(300, 45, -25),
        accentColor: tono(45, 70, 10),
      },
    ],
  };
}

/**
 * Biblioteca: bibliotecas en la pared a los costados del nombre y una fila de islas de estantes (12 lugares para leer).
 * Más angosta desde que comparte la franja con la cabina de Contratistas.
 */
function biblioteca(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dx of [0, 8]) {
    m.push({ id: `pared-${dx}`, type: 'DOUBLE_BOOKSHELF', dx, dy: PARED_ARRIBA });
  }
  for (const dx of [0, 3, 6, 8]) {
    m.push({ id: `estante-${dx}`, type: 'DOUBLE_BOOKSHELF', dx, dy: 2 });
  }
  m.push({ id: 'planta-1', type: 'PLANT', dx: 0, dy: 5 });
  m.push({ id: 'planta-2', type: 'PLANT_2', dx: 9, dy: 5 });
  return { muebles: m, puertas: [4, 5] };
}

/**
 * Contratistas: cabina de los otros motores (Codex, Pi, Antigravity). Cuatro escritorios con silla; no son sesiones de
 * Claude, así que nadie tiene puesto acá: el webview dibuja a cada uno en su silla con lo que dice Orca
 * (webview-ui/src/personal/contratistas.ts).
 */
function contratistas(): Contenido {
  const m: MuebleRelativo[] = [];
  for (const dy of [0, 3]) {
    for (const dx of [0, 4]) {
      const k = `${dy}-${dx}`;
      m.push({ id: `escritorio-${k}`, type: 'DESK_FRONT', dx, dy });
      m.push({ id: `pc-${k}`, type: 'PC_FRONT_OFF', dx: dx + 1, dy });
      m.push({ id: `silla-${k}`, type: 'CUSHIONED_CHAIR_BACK', dx: dx + 1, dy: dy + 2 });
    }
  }
  return { muebles: m, puertas: [3] };
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
 * Presentaciones: dos pantallas (pizarrones) a los costados de la pared, con el nombre de la sala en el medio; el
 * escenario libre en el centro (quien presenta se para en la fila ESCENARIO_FILA, mirando al público, con su tarjeta
 * dentro de la sala) y una fila de sillas abajo mirando hacia adelante. Se "prende" con el aviso por voz.
 */
function presentaciones(): Contenido {
  const m: MuebleRelativo[] = [];
  m.push({ id: 'pantalla-1', type: 'WHITEBOARD', dx: 0, dy: PARED_ARRIBA });
  m.push({ id: 'pantalla-2', type: 'WHITEBOARD', dx: 7, dy: PARED_ARRIBA });
  // Una fila de sillas (el respaldo ocupa la fila de arriba del asiento): el público se sienta en la última fila.
  const dy = ESCENARIO_FILA + 2;
  for (const dx of [0, 1, 2, 3, 5, 6, 7, 8]) {
    m.push({ id: `silla-${dy}-${dx}`, type: 'WOODEN_CHAIR_BACK', dx, dy });
  }
  return { muebles: m, puertas: [3, 5] };
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
    case 'contratistas':
      return contratistas();
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
    comun('contratistas', SALA_CONTRATISTAS, 8),
    comun('biblioteca', SALA_BIBLIOTECA, 11),
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
  const alfombra: Array<Omit<Alfombra, 'dx' | 'dy' | 'w' | 'h'> | null> = new Array(
    cols * rows,
  ).fill(null);
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
      const { muebles, puertas, alfombras = [] } = contenido(p);
      const piso = pisoDe(p.tipo);
      for (let c = x; c < x + p.ancho; c++) poner(c, filaPared, pared);
      for (let r = filaPared + 1; r <= filaPared + INTERIOR; r++) {
        poner(x, r, pared);
        for (let c = x + 1; c < x + p.ancho; c++) poner(c, r, piso, p.sala.nombre);
      }
      // Puertas desde el pasillo de arriba (la primera franja no tiene pasillo arriba: se entra por abajo).
      if (b > 0) for (const dx of puertas) poner(x + 1 + dx, filaPared, piso);
      for (const { dx, dy, w, h, ...a } of alfombras) {
        for (let r = dy; r < dy + h; r++) {
          for (let c = dx; c < dx + w; c++) alfombra[(filaPared + 1 + r) * cols + x + 1 + c] = a;
        }
      }
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
    ...(alfombra.some(Boolean) ? { carpetTiles: alfombra } : {}),
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

/** Proyectos (Orca y carpetas ya agregadas) en el orden de siempre: el que usa la primera ocupación de las oficinas. */
export function proyectosDisponibles(proyectos = leerProyectos()): string[] {
  return asignables(salasDesde(proyectos).salas.map((s) => s.nombre));
}

/** Lo que se puede poner en una oficina (menú "Asignar proyecto"): Orca, carpetas agregadas y las de IA Tools. */
export function disponiblesDe(lista: Candidato[]): string[] {
  return asignables(lista.map((c) => c.nombre));
}

/** Ocupación actual: la guardada o, la primera vez, la del plano que ya está en ~/.pixel-agents/layout.json. */
export function ocupacionActual(disponibles: string[]): Ocupacion {
  return leerOcupacion(disponibles, rutaOcupacion(), () => {
    const areas = (readLayoutFromFile() as { areas?: Array<{ label?: unknown }> } | null)?.areas;
    return Array.isArray(areas)
      ? ocupacionDelPlano(
          areas.map((a) => a.label).filter((l): l is string => typeof l === 'string'),
        )
      : null;
  });
}

/** Estado de las oficinas para el webview: qué hay en cada lugar y qué proyectos se pueden asignar. */
export function mensajeOficinas(lista: Candidato[] = candidatosFrescos()): Record<string, unknown> {
  const disponibles = disponiblesDe(lista);
  const o = ocupacionActual(proyectosDisponibles());
  return {
    type: 'oficinasEstado',
    lugares: o.map((p, i) => ({ sala: salaDelLugar(o, i), proyecto: p })),
    disponibles,
    candidatos: lista
      .filter((c) => disponibles.includes(c.nombre))
      .map((c) => ({
        nombre: c.nombre,
        ruta: c.ruta,
        origen: c.origen,
        modificado: Math.round(c.modificado),
      })),
  };
}

/**
 * Vuelve a leer los proyectos de Orca y regenera el plano con las oficinas en su lugar fijo, cada una con el proyecto
 * que Juan le asignó (ocupacion.ts; `ocupacion` la pisa al asignar), y las asignaciones carpeta → sala (con copia de lo
 * anterior). Un proyecto nuevo de Orca no suma una oficina: queda disponible para asignar y mientras tanto va a
 * "Otros". No reinicia el servidor: los clientes recargan la página y reciben todo de nuevo.
 */
export function recargarOficina(
  original: Record<string, unknown>,
  ocupacion?: Ocupacion,
): ResultadoRecarga {
  const deOrca = salasDesde(leerProyectos());
  const o = ocupacion ?? ocupacionActual(asignables(deOrca.salas.map((s) => s.nombre)));
  guardarOcupacion(o);
  const reglas = deOrca.reglas;
  const salas = salasConOcupacion(o, deOrca.salas);
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
    (f) =>
      /CHAIR|BENCH/.test(f.type) &&
      !esAsientoReservado(f.uid) &&
      !esSalaComun(areaTiles[(f.row + 1) * cols + f.col]),
  ).length;
  return { salas: salas.map((s) => s.nombre), puestos };
}

/** Al arrancar: carga las reglas de los proyectos nuevos de Orca sin tocar el plano. */
export function cargarReglasOrca(): void {
  setReglasExtra(salasDesde(leerProyectos()).reglas);
}
