/**
 * Personal (copia de juanfrunegro), tanda 3: pizarra del Brain y menú de cada oficina.
 * - Pizarra: en la pared del Brain (muebles "brain-pizarra-*" del plano), una fila por proyecto con su color, cuántos
 *   pendientes abiertos tiene (los PENDIENTES.md que lee el radar; el servidor los da en GET /pizarra) y un punto
 *   amarillo por cada agente suyo trabajando ahora. Clic en la pizarra → panel legible con el detalle.
 * - Menú de oficina: clic en el piso o el nombre de una oficina de proyecto → "Abrir carpeta" / "Abrir en VS Code" y,
 *   tanda 5, "Asignar proyecto ▸" / "Dejar vacía" (server/src/personal/ocupacion.ts). Una oficina libre solo asigna.
 * Estado chico con useSyncExternalStore, como filtro.ts.
 */
import { useSyncExternalStore } from 'react';

import { esSalaComun, SALA_PRESENTACIONES } from '../../../core/src/salasComunes.js';
import type { PlacedFurniture } from '../office/types.js';
import { TILE_SIZE } from '../office/types.js';
import {
  COLOR_PIZARRA_BORDE,
  COLOR_PIZARRA_FONDO,
  COLOR_PIZARRA_GENTE,
  COLOR_PIZARRA_TEXTO,
} from './colores.js';

export interface FilaPizarra {
  sala: string;
  archivo: string | null;
  abiertos: number;
  ideas: number;
  hechos: number;
  primeros: string[];
}

/** Prefijo del uid de los pizarrones que forman la pizarra (server/src/personal/oficina.ts, sala Brain). */
export const PREFIJO_PIZARRA = 'brain-pizarra';
/** Cada cuánto se vuelven a pedir los pendientes. */
export const REFRESCO_MS = 60_000;

interface Marco {
  col: number;
  row: number;
  w: number;
  h: number;
}

interface Estado {
  filas: FilaPizarra[];
  error: string | null;
  /** Sala (proyecto) → ids de sus agentes trabajando ahora. */
  gente: Map<string, number[]>;
  abierta: boolean;
  menu: { sala: string; x: number; y: number } | null;
  /** Oficinas asignables y su proyecto (null = libre), y los proyectos de Orca que se pueden poner (oficinasEstado). */
  oficinas: Array<{ sala: string; proyecto: string | null }>;
  disponibles: string[];
  /** Lo mismo que disponibles con su carpeta y de dónde sale (Orca, IA Tools, agregada a mano). */
  candidatos: CandidatoOficina[];
  /** Panel de la sala de comunicaciones (clic en Presentaciones): interruptor de voz de cada sesión. */
  comunicaciones: boolean;
  /** Proyectos con "Avisame por WhatsApp cuando termine este proyecto" prendido (whatsappProyectos). */
  whatsapp: ReadonlySet<string>;
  version: number;
}

const estado: Estado = {
  filas: [],
  error: null,
  gente: new Map(),
  abierta: false,
  menu: null,
  oficinas: [],
  disponibles: [],
  candidatos: [],
  comunicaciones: false,
  whatsapp: new Set(),
  version: 0,
};
const oyentes = new Set<() => void>();
function avisar(): void {
  estado.version++;
  oyentes.forEach((f) => f());
}

/** El estado sin suscribirse (tests y código fuera de React). */
export function estadoPizarra(): Readonly<Estado> {
  return estado;
}

export function usePizarra(): Estado {
  useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estado.version,
  );
  return estado;
}

export function setFilasPizarra(filas: FilaPizarra[], error: string | null = null): void {
  estado.filas = filas;
  estado.error = error;
  avisar();
}

export interface CandidatoOficina {
  nombre: string;
  ruta: string;
  /** orca = proyecto de Orca, carpeta = subcarpeta de IA Tools, otra = agregada a mano ("Otra carpeta…"). */
  origen: 'orca' | 'carpeta' | 'otra';
  modificado: number;
}

/** Mensaje oficinasEstado del servidor. */
export function setOficinas(
  oficinas: Array<{ sala: string; proyecto: string | null }>,
  disponibles: string[],
  candidatos: CandidatoOficina[] = [],
): void {
  estado.oficinas = oficinas;
  estado.disponibles = disponibles;
  estado.candidatos = Array.isArray(candidatos) ? candidatos : [];
  avisar();
}

/** Mensaje whatsappProyectos del servidor. */
export function setWhatsappProyectos(proyectos: unknown): void {
  estado.whatsapp = new Set(
    Array.isArray(proyectos) ? proyectos.filter((p): p is string => typeof p === 'string') : [],
  );
  avisar();
}

/** Prendió el aviso por WhatsApp de ese proyecto (para el cartel de su oficina). */
export function whatsappProyecto(proyecto: string): boolean {
  return estado.whatsapp.has(proyecto);
}

export interface OpcionAsignar {
  proyecto: string;
  /** Ya está en otra oficina: al elegirlo se intercambian. */
  intercambia: boolean;
  /** De dónde sale (sin dato: lista vieja del servidor, solo nombres). */
  origen?: CandidatoOficina['origen'];
  ruta?: string;
}

/** Etiqueta corta del origen para el menú. */
export const ORIGEN_TEXTO: Record<CandidatoOficina['origen'], string> = {
  orca: 'Orca',
  carpeta: 'IA Tools',
  otra: 'agregada',
};

/** Proyectos para "Asignar proyecto ▸" en la oficina `sala` (sin el que ya tiene). */
export function opcionesAsignar(
  sala: string,
  oficinas: Array<{ sala: string; proyecto: string | null }>,
  disponibles: string[],
  candidatos: CandidatoOficina[] = [],
): OpcionAsignar[] {
  const actual = oficinas.find((o) => o.sala === sala)?.proyecto ?? null;
  const ubicados = new Set(oficinas.map((o) => o.proyecto).filter((p): p is string => !!p));
  const datos = new Map(candidatos.map((c) => [c.nombre, c]));
  // Con datos del servidor: la carpeta tocada más recientemente primero; sin datos, por nombre. Las que ya tienen
  // oficina (se intercambian) siempre al final.
  return disponibles
    .filter((p) => p !== actual)
    .map((p): OpcionAsignar => {
      const c = datos.get(p);
      return {
        proyecto: p,
        intercambia: ubicados.has(p),
        ...(c ? { origen: c.origen, ruta: c.ruta } : {}),
      };
    })
    .sort(
      (a, b) =>
        Number(a.intercambia) - Number(b.intercambia) ||
        (datos.get(b.proyecto)?.modificado ?? 0) - (datos.get(a.proyecto)?.modificado ?? 0) ||
        a.proyecto.localeCompare(b.proyecto),
    );
}

/** Pide los pendientes al servidor (con el token de la URL). */
export async function cargarPizarra(
  pedir: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (u) => fetch(u),
): Promise<void> {
  try {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    const r = await pedir(`/pizarra?token=${encodeURIComponent(token)}`);
    if (!r.ok) throw new Error('sin permiso');
    const j = (await r.json()) as { proyectos?: FilaPizarra[] };
    setFilasPizarra(Array.isArray(j.proyectos) ? j.proyectos : []);
  } catch (err) {
    setFilasPizarra(estado.filas, `No se pudieron leer los pendientes (${String(err)}).`);
  }
}

// ── Lo que hay en el plano ──────────────────────────────────────

let marco: Marco | null = null;
let marcoDe: unknown = null;

/** Dónde está la pizarra (la caja que cubren los pizarrones "brain-pizarra-*"), con caché por plano. */
export function marcoPizarra(
  furniture: PlacedFurniture[],
  huella: (tipo: string) => { w: number; h: number } | undefined,
): Marco | null {
  if (marcoDe === furniture) return marco;
  let m: Marco | null = null;
  for (const f of furniture) {
    if (!f.uid.startsWith(PREFIJO_PIZARRA)) continue;
    const h = huella(f.type) ?? { w: 2, h: 2 };
    if (!m) m = { col: f.col, row: f.row, w: h.w, h: h.h };
    else {
      const c1 = Math.min(m.col, f.col);
      const r1 = Math.min(m.row, f.row);
      const c2 = Math.max(m.col + m.w, f.col + h.w);
      const r2 = Math.max(m.row + m.h, f.row + h.h);
      m = { col: c1, row: r1, w: c2 - c1, h: r2 - r1 };
    }
  }
  marco = m;
  marcoDe = furniture;
  return m;
}

/** Cada cuadro (ambiente.ts): quién trabaja en cada proyecto. Solo avisa si cambió. */
export function setGentePizarra(gente: Map<string, number[]>): void {
  const igual =
    gente.size === estado.gente.size &&
    [...gente].every(([k, v]) => estado.gente.get(k)?.join(',') === v.join(','));
  if (igual) return;
  estado.gente = gente;
  avisar();
}

export function enPizarra(col: number, row: number): boolean {
  return (
    !!marco &&
    col >= marco.col &&
    col < marco.col + marco.w &&
    row >= marco.row &&
    row < marco.row + marco.h
  );
}

// ── Clics ───────────────────────────────────────────────────────

export function abrirPizarra(): void {
  estado.abierta = true;
  estado.menu = null;
  estado.comunicaciones = false;
  avisar();
}

export function cerrarPizarra(): void {
  estado.abierta = false;
  avisar();
}

export function abrirMenuSala(sala: string, x: number, y: number): void {
  estado.menu = { sala, x, y };
  estado.abierta = false;
  estado.comunicaciones = false;
  avisar();
}

export function abrirComunicaciones(): void {
  estado.comunicaciones = true;
  estado.abierta = false;
  estado.menu = null;
  avisar();
}

export function cerrarComunicaciones(): void {
  if (!estado.comunicaciones) return;
  estado.comunicaciones = false;
  avisar();
}

export function cerrarMenuSala(): void {
  if (!estado.menu) return;
  estado.menu = null;
  avisar();
}

/**
 * Sala de oficina de proyecto en ese tile (el piso, o el nombre pintado en la pared de arriba), o null si es una sala
 * compartida, "Otros", el pasillo o una pared. Las oficinas libres ("Libre 3") sí cuentan: su menú solo asigna.
 */
export function oficinaEn(
  areaTiles: Array<string | null> | undefined,
  cols: number,
  col: number,
  row: number,
): string | null {
  const en = (c: number, r: number) => (r >= 0 ? (areaTiles?.[r * cols + c] ?? null) : null);
  const sala = en(col, row) ?? en(col, row + 1);
  if (!sala || esSalaComun(sala) || sala === 'Otros') return null;
  return sala;
}

/** El tile es de la sala de Presentaciones (el piso o su nombre en la pared). */
export function enComunicaciones(
  areaTiles: Array<string | null> | undefined,
  cols: number,
  col: number,
  row: number,
): boolean {
  const en = (c: number, r: number) => (r >= 0 ? (areaTiles?.[r * cols + c] ?? null) : null);
  return (en(col, row) ?? en(col, row + 1)) === SALA_PRESENTACIONES;
}

/**
 * Clic sin agente elegido (OfficeCanvas): pizarra → panel; Presentaciones → sala de comunicaciones (tanda 5); oficina
 * de proyecto → menú. Devuelve true si lo usó.
 */
export function clicPersonal(
  plano: { cols: number; areaTiles?: Array<string | null> },
  tile: { col: number; row: number },
  x: number,
  y: number,
): boolean {
  if (enPizarra(tile.col, tile.row)) {
    abrirPizarra();
    return true;
  }
  if (enComunicaciones(plano.areaTiles, plano.cols, tile.col, tile.row)) {
    abrirComunicaciones();
    return true;
  }
  const sala = oficinaEn(plano.areaTiles, plano.cols, tile.col, tile.row);
  if (!sala) return false;
  abrirMenuSala(sala, x, y);
  return true;
}

// ── Dibujo ──────────────────────────────────────────────────────

/** Columnas y filas de la grilla de la pizarra para n proyectos: hasta 3 en una columna; si son más, en dos filas. */
export function grilla(n: number): { columnas: number; filas: number } {
  if (n <= 3) return { columnas: 1, filas: Math.max(1, n) };
  return { columnas: Math.ceil(n / 2), filas: 2 };
}

/** Dibuja la pizarra encima de los pizarrones del Brain: color del proyecto, pendientes abiertos y gente trabajando. */
export function renderPizarra(
  ctx: CanvasRenderingContext2D,
  areas: Array<{ label: string; color: string }> | undefined,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (!marco) return;
  const px = zoom; // un pixel del sprite
  const x0 = offsetX + marco.col * TILE_SIZE * zoom;
  const y0 = offsetY + marco.row * TILE_SIZE * zoom;
  const w = marco.w * TILE_SIZE * zoom;
  const h = marco.h * TILE_SIZE * zoom;
  ctx.save();
  // Marco de madera y fondo de pizarrón, dejando un pixel de aire arriba (como los pizarrones del original).
  ctx.fillStyle = COLOR_PIZARRA_BORDE;
  ctx.fillRect(x0 + px, y0 + 3 * px, w - 2 * px, h - 4 * px);
  ctx.fillStyle = COLOR_PIZARRA_FONDO;
  ctx.fillRect(x0 + 3 * px, y0 + 5 * px, w - 6 * px, h - 8 * px);

  const filas = estado.filas;
  const ix = x0 + 5 * px;
  const iy = y0 + 7 * px;
  const iw = w - 10 * px;
  const ih = h - 12 * px;
  if (filas.length === 0) {
    ctx.fillStyle = COLOR_PIZARRA_TEXTO;
    ctx.font = `${Math.max(8, 5 * px)}px 'FS Pixel Sans', monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Pendientes…', ix, iy + ih / 2);
    ctx.restore();
    return;
  }
  const colores = new Map((areas ?? []).map((a) => [a.label, a.color]));
  const g = grilla(filas.length);
  const cw = iw / g.columnas;
  const ch = ih / g.filas;
  // Cada celda: el cuadrado del color del proyecto y su número de pendientes, lo más grande que entre; arriba a la
  // derecha, un punto por cada agente suyo trabajando (hasta 3). El nombre de cada proyecto está en el panel.
  let fuente = Math.min(ch * 0.8, 9 * px);
  ctx.font = `bold ${fuente}px 'FS Pixel Sans', monospace`;
  const lado = (f: number) => Math.round(f * 0.6);
  const anchoNum = Math.max(...filas.map((f) => ctx.measureText(String(f.abiertos)).width));
  const disponible = cw - 4 * px; // margen derecho para los puntos de gente
  const necesario = lado(fuente) + 2 * px + anchoNum;
  if (necesario > disponible) fuente = Math.max(6, fuente * (disponible / necesario));
  ctx.font = `bold ${fuente}px 'FS Pixel Sans', monospace`;
  ctx.textBaseline = 'middle';
  filas.forEach((f, i) => {
    const cx = ix + (i % g.columnas) * cw;
    const cy = iy + Math.floor(i / g.columnas) * ch + ch / 2;
    const l = lado(fuente);
    ctx.fillStyle = colores.get(f.sala) ?? COLOR_PIZARRA_TEXTO;
    ctx.fillRect(Math.round(cx), Math.round(cy - l / 2), l, l);
    ctx.fillStyle = COLOR_PIZARRA_TEXTO;
    ctx.fillText(String(f.abiertos), Math.round(cx + l + 2 * px), Math.round(cy));
    const gente = estado.gente.get(f.sala)?.length ?? 0;
    ctx.fillStyle = COLOR_PIZARRA_GENTE;
    for (let k = 0; k < Math.min(gente, 3); k++) {
      ctx.fillRect(Math.round(cx + cw - 3 * px), Math.round(cy - ch / 2 + px + k * 2 * px), px, px);
    }
  });
  ctx.restore();
}
