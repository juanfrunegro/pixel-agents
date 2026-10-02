/**
 * Personal (copia de juanfrunegro): reuniones en la sala de Reuniones. Dos casos:
 * - Un agente lanza un sub-agente: los dos van a Reuniones y hablan ahí (burbujas) un rato; después cada uno a lo suyo.
 * - Se pone a trabajar una segunda sesión del mismo proyecto mientras otra ya trabaja: reunión corta de las dos.
 * Para que la sala no quede ocupada siempre (ERP tiene varias sesiones a la vez): el mismo par no se reúne más de una
 * vez cada ENFRIAR_PAR_MS y un proyecto no arma más de una reunión cada ENFRIAR_PROYECTO_MS. Cada reunión dura poco.
 * Sin DOM: el movimiento está en ambiente.ts.
 */

// Cruzar la oficina de punta a punta lleva ~15 s (3 tiles por segundo): llegan, hablan un poco y vuelven.
export const DURACION_SUB_MS = 25_000;
export const DURACION_PROYECTO_MS = 30_000;
export const ENFRIAR_PAR_MS = 10 * 60_000;
export const ENFRIAR_PROYECTO_MS = 3 * 60_000;
/** Si alguno no llega (camino largo, se trabó), hablan igual pasado este tiempo. */
export const ESPERA_LLEGADA_MS = 15_000;
/** Al abrir la página aparecen todas las sesiones de golpe: eso no es "ponerse a trabajar". */
export const CALENTAMIENTO_MS = 10_000;

export interface Reunion {
  ids: number[];
  inicio: number;
  hasta: number;
  /** Ya arrancaron a hablar (cuando llegaron todos o pasó ESPERA_LLEGADA_MS). */
  hablaron: boolean;
}

let reuniones: Reunion[] = [];
const ultimaPar = new Map<string, number>();
const ultimaProyecto = new Map<string, number>();

const clavePar = (ids: number[]) => [...ids].sort((a, b) => a - b).join('|');

export function reunionDe(id: number, ahora = Date.now()): Reunion | null {
  return reuniones.find((r) => ahora < r.hasta && r.ids.includes(id)) ?? null;
}

/** Arma una reunión si nadie está ya en otra y no se reunieron hace poco. Devuelve si la armó. */
export function reunir(
  ids: number[],
  duracionMs: number,
  ahora = Date.now(),
  proyecto?: string,
): boolean {
  if (ids.length < 2 || new Set(ids).size !== ids.length) return false;
  if (ids.some((id) => reunionDe(id, ahora))) return false;
  // los enfriamientos vencidos no hacen falta: que los mapas no crezcan todo el día
  for (const [k, t] of ultimaPar) if (ahora - t >= ENFRIAR_PAR_MS) ultimaPar.delete(k);
  for (const [k, t] of ultimaProyecto)
    if (ahora - t >= ENFRIAR_PROYECTO_MS) ultimaProyecto.delete(k);
  const par = clavePar(ids);
  const antes = ultimaPar.get(par);
  if (antes !== undefined && ahora - antes < ENFRIAR_PAR_MS) return false;
  if (proyecto !== undefined) {
    const p = ultimaProyecto.get(proyecto);
    if (p !== undefined && ahora - p < ENFRIAR_PROYECTO_MS) return false;
    ultimaProyecto.set(proyecto, ahora);
  }
  ultimaPar.set(par, ahora);
  reuniones.push({ ids, inicio: ahora, hasta: ahora + duracionMs, hablaron: false });
  return true;
}

/** Saca las reuniones terminadas y las de alguien que ya no está (el sub-agente terminó, se cerró la sesión). */
export function limpiarReuniones(ahora: number, existe: (id: number) => boolean): void {
  reuniones = reuniones.filter((r) => ahora < r.hasta && r.ids.every(existe));
}

export function reunionesActivas(ahora = Date.now()): Reunion[] {
  return reuniones.filter((r) => ahora < r.hasta);
}

// ── Sesiones del mismo proyecto ─────────────────────────────────

let previos: Set<number> | null = null;
let desde = 0;

/**
 * Recibe las sesiones que están trabajando ahora (con su proyecto) y devuelve los pares que hay que reunir: cada sesión
 * que se acaba de poner a trabajar con la que ya trabajaba en su proyecto desde antes (la primera que encuentra).
 */
export function sesionesQueSeCruzan(
  activas: Array<{ id: number; proyecto: string | undefined }>,
  ahora = Date.now(),
): Array<{ ids: [number, number]; proyecto: string }> {
  const ids = new Set(activas.map((a) => a.id));
  if (previos === null) {
    previos = ids;
    desde = ahora;
    return [];
  }
  const antes = previos;
  previos = ids;
  if (ahora - desde < CALENTAMIENTO_MS) return [];
  const pares: Array<{ ids: [number, number]; proyecto: string }> = [];
  for (const nueva of activas) {
    if (antes.has(nueva.id) || !nueva.proyecto) continue;
    const otra = activas.find(
      (a) => a.id !== nueva.id && a.proyecto === nueva.proyecto && antes.has(a.id),
    );
    if (otra) pares.push({ ids: [otra.id, nueva.id], proyecto: nueva.proyecto });
  }
  return pares;
}

/** Solo para tests. */
export function _reiniciarReuniones(): void {
  reuniones = [];
  ultimaPar.clear();
  ultimaProyecto.clear();
  previos = null;
  desde = 0;
}
