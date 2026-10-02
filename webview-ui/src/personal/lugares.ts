/**
 * Personal (copia de juanfrunegro): adónde va cada agente según lo que está haciendo. Todo el criterio vive acá.
 *
 *   biblioteca  ← leer, buscar, investigar en la web (Read, Grep, Glob, WebFetch, WebSearch, consultas de MCP)
 *   pizarrón    ← planificar (TodoWrite, tareas, plan mode, skills)
 *   (nada)      ← escribir código o correr comandos (Edit, Write, Bash…): su escritorio, como en el original
 *
 * Los lugares salen de los muebles del plano (cualquier plano, también uno editado a mano): el tile libre de adelante de
 * cada biblioteca o pizarrón, dentro de la misma sala que el agente.
 */
import type { Direction, PlacedFurniture } from '../office/types.js';
import { Direction as Dir } from '../office/types.js';

export type Lugar = 'biblioteca' | 'pizarron';

const BIBLIOTECA = new Set([
  'Read',
  'Grep',
  'Glob',
  'LS',
  'WebFetch',
  'WebSearch',
  'NotebookRead',
  'ToolSearch',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
]);
const PIZARRON = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'EnterPlanMode',
  'ExitPlanMode',
  'Planning', // status "Planning" de un sub-agente
  'Skill',
]);
/** Herramientas de MCP que solo consultan (supabase list_tables, github search_code, etc.). */
const MCP_CONSULTA = /^mcp__.+__(search|list|get|read|query|fetch|describe|explain)/i;

/** Lugar para una herramienta, o null = su escritorio. */
export function actividadDe(tool: string | null | undefined): Lugar | null {
  if (!tool) return null;
  if (BIBLIOTECA.has(tool) || MCP_CONSULTA.test(tool)) return 'biblioteca';
  if (PIZARRON.has(tool)) return 'pizarron';
  return null;
}

/** Mueble → lugar, por el tipo base (sin ":left" ni variantes de estado). */
export function lugarDeMueble(tipo: string): Lugar | null {
  const base = tipo.split(':')[0];
  if (base === 'BOOKSHELF' || base === 'DOUBLE_BOOKSHELF') return 'biblioteca';
  if (base === 'WHITEBOARD') return 'pizarron';
  return null;
}

export interface Punto {
  lugar: Lugar;
  col: number;
  row: number;
  facingDir: Direction;
  area: string | null;
}

export interface Plano {
  furniture: PlacedFurniture[];
  cols: number;
  areaTiles?: Array<string | null>;
}

/**
 * Los puntos donde se para un agente para usar cada mueble: los tiles caminables justo debajo de su huella (mirando
 * para arriba, hacia el mueble); si no hay ninguno, los de los costados de su última fila.
 */
export function puntosDeLugares(
  plano: Plano,
  huella: (tipo: string) => { w: number; h: number } | undefined,
  caminable: (col: number, row: number) => boolean,
): Punto[] {
  const puntos: Punto[] = [];
  const vistos = new Set<string>();
  const agregar = (lugar: Lugar, col: number, row: number, facingDir: Direction) => {
    const k = `${col},${row}`;
    if (vistos.has(k) || !caminable(col, row)) return false;
    vistos.add(k);
    puntos.push({
      lugar,
      col,
      row,
      facingDir,
      area: plano.areaTiles?.[row * plano.cols + col] ?? null,
    });
    return true;
  };
  for (const f of plano.furniture) {
    const lugar = lugarDeMueble(f.type);
    const h = lugar && huella(f.type);
    if (!lugar || !h) continue;
    let alguno = false;
    for (let dc = 0; dc < h.w; dc++)
      alguno = agregar(lugar, f.col + dc, f.row + h.h, Dir.UP) || alguno;
    if (!alguno) {
      agregar(lugar, f.col - 1, f.row + h.h - 1, Dir.RIGHT);
      agregar(lugar, f.col + h.w, f.row + h.h - 1, Dir.LEFT);
    }
  }
  return puntos;
}

/**
 * El punto libre más cercano a `desde` para ese lugar, en la misma sala (si el agente tiene sala). `ocupados` son los
 * tiles que ya eligieron otros agentes.
 */
export function elegirPunto(
  puntos: Punto[],
  lugar: Lugar,
  area: string | null,
  desde: { col: number; row: number },
  ocupados: Set<string>,
): Punto | null {
  let mejor: Punto | null = null;
  let dist = Infinity;
  for (const p of puntos) {
    if (p.lugar !== lugar || p.area !== area || ocupados.has(`${p.col},${p.row}`)) continue;
    const d = Math.abs(p.col - desde.col) + Math.abs(p.row - desde.row);
    if (d < dist) {
      dist = d;
      mejor = p;
    }
  }
  return mejor;
}
