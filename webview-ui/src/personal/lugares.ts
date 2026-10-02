/**
 * Personal (copia de juanfrunegro): adónde va cada agente según lo que está haciendo. Todo el criterio vive acá.
 *
 *   atril       ← diseño o UI: herramientas de diseño (Artifact, Figma, Canva…), skills de diseño (ui-ux-pro-max,
 *                 frontend-design…) o archivos de estilos/imágenes (.css, .svg, .png…)
 *   contable    ← plata: la tarea (archivo o comando) habla de cobros, pagos, contabilidad, facturas, conciliación,
 *                 finanzas, ingresos, gastos o impuestos; o es el proyecto Finanzas corriendo un comando
 *   biblioteca  ← leer, buscar, investigar en la web (Read, Grep, Glob, WebFetch, WebSearch, consultas de MCP)
 *   pizarrón    ← planificar (TodoWrite, tareas, plan mode, otras skills)
 *   (nada)      ← escribir código o correr comandos (Edit, Write, Bash…): su escritorio, como en el original
 * En ese orden: atril y contable miran de qué se trata la tarea, los otros solo la herramienta.
 * Además, sin depender de la herramienta (ver ambiente.ts): cafetería ← inactivo; reunión ← reunión con otro agente;
 * presentación ← se acaba de decir su aviso por voz (frente a la pantalla de Presentaciones).
 *
 * Biblioteca, atriles, pizarrones (los de Reuniones: planificar es medio reunión), cafetería y reuniones son salas
 * compartidas entre proyectos (core/src/salasComunes.ts); la mesa contable está en la oficina de Finanzas. Los puntos
 * salen de los muebles del plano: el tile libre de adelante de cada biblioteca, atril o pizarrón, y los asientos de la
 * cafetería y de Reuniones. En un plano editado a mano sin esas salas, vale el mueble más cercano de cualquier sala.
 */
import {
  ESCENARIO_FILA,
  SALA_BIBLIOTECA,
  SALA_CAFETERIA,
  SALA_DISENO,
  SALA_PRESENTACIONES,
  SALA_REUNIONES,
} from '../../../core/src/salasComunes.js';
import type { Direction, PlacedFurniture } from '../office/types.js';
import { Direction as Dir } from '../office/types.js';

export type Lugar =
  'biblioteca' | 'pizarron' | 'atril' | 'contable' | 'cafeteria' | 'reunion' | 'presentacion';

/** Sala de cada lugar; null = donde esté el mueble (la mesa contable, en Finanzas). */
export const SALA_DE_LUGAR: Record<Lugar, string | null> = {
  biblioteca: SALA_BIBLIOTECA,
  atril: SALA_DISENO,
  pizarron: SALA_REUNIONES,
  contable: null,
  cafeteria: SALA_CAFETERIA,
  reunion: SALA_REUNIONES,
  presentacion: SALA_PRESENTACIONES,
};

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

const DISENO_TOOL = /artifact|design|figma|canva|excalidraw|image/i;
const DISENO_TEXTO =
  /skill:\s*(ui-ux|frontend-design|artifact-design|artifact-diagramming|dataviz|brand)|\.(css|scss|svg|png|jpe?g|fig)\b/i;
const PLATA =
  /cobr|pagos?\b|pago[-_]|contab|factur|concili|finanz|ingreso|gasto|impuesto|ganancia|binance|tesorer/i;

/**
 * Lugar para lo que está haciendo, o null = su escritorio. `status` es el texto de la herramienta ("Editing
 * cobros.ts", "Running: …", "Skill: ui-ux-pro-max") y `proyecto` la sala del agente.
 */
export function actividadDe(
  tool: string | null | undefined,
  status?: string,
  proyecto?: string,
): Lugar | null {
  if (!tool) return null;
  const texto = status ?? '';
  if (DISENO_TOOL.test(tool) || DISENO_TEXTO.test(texto)) return 'atril';
  if (PLATA.test(texto) || (proyecto === 'Finanzas' && tool === 'Bash')) return 'contable';
  if (BIBLIOTECA.has(tool) || MCP_CONSULTA.test(tool)) return 'biblioteca';
  if (PIZARRON.has(tool)) return 'pizarron';
  return null;
}

/** Mueble → lugar, por el tipo base (sin ":left" ni variantes de estado). */
export function lugarDeMueble(tipo: string): Lugar | null {
  const base = tipo.split(':')[0];
  if (base === 'BOOKSHELF' || base === 'DOUBLE_BOOKSHELF') return 'biblioteca';
  if (base === 'WHITEBOARD') return 'pizarron';
  if (base === 'EASEL') return 'atril';
  if (base === 'MESA_CONTABLE') return 'contable';
  return null;
}

export interface Punto {
  lugar: Lugar;
  col: number;
  row: number;
  facingDir: Direction;
  area: string | null;
  /** Es un asiento (sillón, silla): se sienta. Si no, se queda parado mirando al mueble. */
  sentado?: boolean;
  /** Menor = se elige antes (los asientos de la cafetería antes que el piso). */
  prioridad?: number;
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

/** Puntos de los asientos (sillas, sillones) de una sala: para sentarse en la cafetería o en una reunión. */
export function puntosDeAsientos(
  asientos: Iterable<{
    seatCol: number;
    seatRow: number;
    facingDir: Direction;
    sala: string | null;
  }>,
  sala: string,
  lugar: Lugar,
): Punto[] {
  const out: Punto[] = [];
  for (const a of asientos) {
    if (a.sala !== sala) continue;
    out.push({
      lugar,
      col: a.seatCol,
      row: a.seatRow,
      facingDir: a.facingDir,
      area: sala,
      sentado: true,
      prioridad: 0,
    });
  }
  return out;
}

/**
 * Para cuando se llenan los asientos: el piso libre de la sala (parado). `tiles` son los caminables, ya sin muebles.
 */
export function puntosDePiso(
  tiles: Iterable<{ col: number; row: number }>,
  salaDe: (col: number, row: number) => string | null,
  sala: string,
  lugar: Lugar,
): Punto[] {
  const out: Punto[] = [];
  for (const t of tiles) {
    if (salaDe(t.col, t.row) !== sala) continue;
    out.push({ lugar, col: t.col, row: t.row, facingDir: Dir.DOWN, area: sala, prioridad: 1 });
  }
  return out;
}

/**
 * El punto libre para ese lugar más cercano a `desde`: primero los de su sala (SALA_DE_LUGAR) y, si el plano no la
 * tiene, el mueble más cercano de cualquier sala. Entre los de su sala gana la prioridad y después la distancia. Con
 * `separar` (la cafetería) gana además el que tiene menos vecinos ocupados, para que se repartan en vez de amontonarse
 * en el living más cercano. `ocupados` son los tiles que ya eligieron otros agentes.
 */
export function elegirPunto(
  puntos: Punto[],
  lugar: Lugar,
  desde: { col: number; row: number },
  ocupados: Set<string>,
  separar = false,
): Punto | null {
  const sala = SALA_DE_LUGAR[lugar];
  const delLugar = puntos.filter((p) => p.lugar === lugar);
  const enSala = sala ? delLugar.filter((p) => p.area === sala) : delLugar;
  const candidatos = enSala.length > 0 ? enSala : delLugar;
  let mejor: Punto | null = null;
  let clave = Infinity;
  for (const p of candidatos) {
    if (ocupados.has(`${p.col},${p.row}`)) continue;
    const d = Math.abs(p.col - desde.col) + Math.abs(p.row - desde.row);
    let vecinos = 0;
    if (separar) {
      for (let dc = -1; dc <= 1; dc++)
        for (let dr = -1; dr <= 1; dr++)
          if ((dc || dr) && ocupados.has(`${p.col + dc},${p.row + dr}`)) vecinos++;
    }
    const k = (p.prioridad ?? 0) * 100_000 + vecinos * 1_000 + d;
    if (k < clave) {
      clave = k;
      mejor = p;
    }
  }
  return mejor;
}

/**
 * Lugar de quien presenta: parado en el escenario de Presentaciones, en el centro de la sala y mirando al público
 * (abajo), lo bastante lejos de la pared para que su tarjeta quede dentro de la sala y no tape las pantallas. Si hay
 * más de uno, a los costados del centro; si el escenario se llena (o el plano no lo tiene), las sillas de la sala
 * (`sillas`, con menos prioridad).
 */
export function puntosDePresentacion(
  plano: { cols: number; areaTiles?: Array<string | null> },
  caminable: (col: number, row: number) => boolean,
  sillas: Punto[] = [],
): Punto[] {
  const out: Punto[] = [];
  const tiles = plano.areaTiles ?? [];
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  tiles.forEach((a, i) => {
    if (a !== SALA_PRESENTACIONES) return;
    const col = i % plano.cols;
    const row = Math.floor(i / plano.cols);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
  });
  if (minRow !== Infinity) {
    const centro = Math.floor((minCol + maxCol) / 2);
    const row = minRow + ESCENARIO_FILA;
    // El centro primero (aunque otro lugar quede más cerca de donde viene); los costados, si ya hay alguien.
    for (const [col, prioridad] of [
      [centro, 0],
      [centro - 2, 1],
      [centro + 2, 1],
    ] as const) {
      if (col < minCol || col > maxCol || !caminable(col, row)) continue;
      out.push({
        lugar: 'presentacion',
        col,
        row,
        facingDir: Dir.DOWN,
        area: SALA_PRESENTACIONES,
        prioridad,
      });
    }
  }
  return [...out, ...sillas.map((p) => ({ ...p, lugar: 'presentacion' as const, prioridad: 2 }))];
}
