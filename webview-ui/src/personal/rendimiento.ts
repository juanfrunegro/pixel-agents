/**
 * Personal (copia de juanfrunegro): que la oficina pueda quedar abierta todo el día en la segunda pantalla
 * sin gastar CPU de más. El original dibujaba todo a la frecuencia del monitor (60–144 fps), repintaba cada
 * baldosa del piso en cada cuadro y re-renderizaba las tarjetas de React en cada requestAnimationFrame.
 *
 * - fpsObjetivo: 60 mientras la cámara se mueve o se edita el plano; 30 si alguien camina, aparece/desaparece
 *   o el mouse se movió hace poco; 10 en reposo (la animación de tipear cambia cada 0,3 s, así que no se nota).
 * - alDibujar: las tarjetas (ToolOverlay) se actualizan cuando se dibuja un cuadro, no en cada rAF.
 * - PisoCacheado: el piso y las alfombras (que no cambian entre cuadros) se dibujan una vez en un canvas aparte
 *   y después se copian de un solo drawImage. Se rehace al cambiar el plano, los colores, el zoom o al salir
 *   del editor (que modifica los arreglos sin cambiarlos de referencia).
 */
import { CharacterState } from '../office/types.js';

export const FPS_REPOSO = 10;
export const FPS_MOVIMIENTO = 30;
export const FPS_LIBRE = 0; // 0 = sin tope (frecuencia del monitor)
/** Tiempo después de mover el mouse o la rueda en el que se dibuja fluido (hover, tarjetas, cursor). */
export const INTERACCION_MS = 1500;

interface PersonajeMin {
  state: string;
  matrixEffect: unknown;
}

export interface EstadoEscena {
  editando: boolean;
  camaraMoviendose: boolean;
  personajes: Iterable<PersonajeMin>;
  /** Mascotas: caminan o siguen a alguien ('walk' / 'follow'). */
  mascotas?: Iterable<{ state: string }>;
  msDesdeInteraccion: number;
}

export function fpsObjetivo(e: EstadoEscena): number {
  if (e.editando || e.camaraMoviendose) return FPS_LIBRE;
  if (e.msDesdeInteraccion < INTERACCION_MS) return FPS_MOVIMIENTO;
  for (const ch of e.personajes) {
    if (ch.state === CharacterState.WALK || ch.matrixEffect) return FPS_MOVIMIENTO;
  }
  for (const m of e.mascotas ?? []) {
    if (m.state !== 'idle') return FPS_MOVIMIENTO;
  }
  return FPS_REPOSO;
}

/** ¿Toca dibujar este cuadro? (`fps` 0 = siempre). Tolera 2 ms para no saltear un cuadro de más por redondeo. */
export function tocaDibujar(ahora: number, ultimo: number, fps: number): boolean {
  if (fps <= 0 || ultimo === 0) return true;
  return ahora - ultimo >= 1000 / fps - 2;
}

// ── Interacción del usuario ────────────────────────────────────

let ultimaInteraccion = 0;
let escuchando = false;

export function marcarInteraccion(ahora = performance.now()): void {
  ultimaInteraccion = ahora;
}

export function msDesdeInteraccion(ahora = performance.now()): number {
  return ahora - ultimaInteraccion;
}

/** Un solo juego de listeners pasivos para toda la página (idempotente). */
export function escucharInteraccion(): void {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  const marcar = () => marcarInteraccion();
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) {
    window.addEventListener(ev, marcar, { passive: true });
  }
}

// ── Aviso de cuadro dibujado ───────────────────────────────────

const oyentes = new Set<() => void>();

/** Se llama después de cada cuadro dibujado. Devuelve la función para dejar de escuchar. */
export function alDibujar(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

export function avisarDibujado(): void {
  for (const cb of oyentes) cb();
}

export function _cantidadOyentes(): number {
  return oyentes.size;
}

// ── Piso cacheado ──────────────────────────────────────────────

/** Más píxeles que esto (≈ 64 MB de canvas) no se cachea: con mucho zoom conviene dibujar lo visible. */
export const MAX_PX_CACHE = 16_000_000;

export interface ClavePiso {
  tileMap: unknown;
  tileColors: unknown;
  carpetTiles: unknown;
  zoom: number;
  cols: number;
  rows: number;
  spritesListos: string;
}

export function mismaClave(a: ClavePiso | null, b: ClavePiso): boolean {
  return (
    !!a &&
    a.tileMap === b.tileMap &&
    a.tileColors === b.tileColors &&
    a.carpetTiles === b.carpetTiles &&
    a.zoom === b.zoom &&
    a.cols === b.cols &&
    a.rows === b.rows &&
    a.spritesListos === b.spritesListos
  );
}

/**
 * Canvas con el piso ya dibujado en (0, 0). `dibujar` recibe el contexto del canvas aparte y dibuja como si
 * el offset fuera 0. Devuelve null si no conviene cachear (editor, demasiado grande, sin DOM).
 */
export class PisoCacheado {
  private clave: ClavePiso | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sucio = false;

  /** El editor cambia los arreglos en el lugar: al usarlo, la copia deja de valer. */
  invalidar(): void {
    this.sucio = true;
  }

  obtener(
    clave: ClavePiso,
    anchoPx: number,
    altoPx: number,
    dibujar: (ctx: CanvasRenderingContext2D) => void,
  ): HTMLCanvasElement | null {
    if (anchoPx <= 0 || altoPx <= 0 || anchoPx * altoPx > MAX_PX_CACHE) return null;
    if (typeof document === 'undefined') return null;
    if (this.canvas && !this.sucio && mismaClave(this.clave, clave)) return this.canvas;
    const c = this.canvas ?? document.createElement('canvas');
    c.width = anchoPx;
    c.height = altoPx;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, anchoPx, altoPx);
    dibujar(ctx);
    this.canvas = c;
    this.clave = clave;
    this.sucio = false;
    return c;
  }
}
