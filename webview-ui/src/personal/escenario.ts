/**
 * Personal (copia de juanfrunegro): el escenario de Presentaciones. Una tarima de madera frente a las pantallas, con un
 * micrófono al centro (donde se para el que dice su aviso por voz, ver puntosDePresentacion) y dos pies de micrófono a
 * los costados. Se dibuja en el canvas (no hay sprites de escenario): la tarima debajo de los personajes y el micrófono
 * del centro encima, para que quede delante del que habla.
 */
import { ESCENARIO_FILA, SALA_PRESENTACIONES } from '../../../core/src/salasComunes.js';
import { TILE_SIZE } from '../constants.js';
import { salasDelPlano } from './carteles.js';
import {
  ESCENARIO_BORDE,
  ESCENARIO_BRILLO,
  ESCENARIO_MADERA,
  MIC_CABEZA,
  MIC_PIE,
} from './colores.js';

/** Medio ancho de la tarima en tiles (a cada lado del centro) y su alto. */
const MEDIO_ANCHO = 3;
const ALTO = 2;

export interface Escenario {
  /** Tile donde se para el que habla (el centro de la fila del escenario). */
  col: number;
  row: number;
  c0: number;
  c1: number;
}

/** Dónde va el escenario según el plano (null si no hay sala de Presentaciones). */
export function escenarioDe(
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
): Escenario | null {
  if (!areaTiles || cols <= 0) return null;
  const sala = salasDelPlano(areaTiles, cols, rows).find((s) => s.label === SALA_PRESENTACIONES);
  if (!sala) return null;
  const col = Math.floor((sala.minCol + sala.maxCol) / 2);
  return {
    col,
    row: sala.minRow + ESCENARIO_FILA,
    c0: Math.max(sala.minCol, col - MEDIO_ANCHO),
    c1: Math.min(sala.maxCol, col + MEDIO_ANCHO),
  };
}

function pieDeMicrofono(
  ctx: CanvasRenderingContext2D,
  x: number,
  yPiso: number,
  zoom: number,
  alto: number,
): void {
  const g = Math.max(1, Math.round(zoom));
  ctx.fillStyle = MIC_PIE;
  ctx.fillRect(x - 2 * g, yPiso - g, 5 * g, g); // base
  ctx.fillRect(x, yPiso - alto, g, alto); // caño
  ctx.fillStyle = MIC_CABEZA;
  ctx.fillRect(x - g, yPiso - alto - 2 * g, 3 * g, 3 * g); // cabeza
}

/** La tarima y los micrófonos de los costados: debajo de los personajes. */
export function renderEscenario(
  ctx: CanvasRenderingContext2D,
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const e = escenarioDe(areaTiles, cols, rows);
  if (!e) return;
  const s = TILE_SIZE * zoom;
  const x = offsetX + e.c0 * s;
  const ancho = (e.c1 - e.c0 + 1) * s;
  const y = offsetY + (e.row - ALTO + 1) * s;
  const alto = ALTO * s;
  const g = Math.max(1, Math.round(zoom));
  ctx.save();
  ctx.fillStyle = ESCENARIO_MADERA;
  ctx.fillRect(x, y, ancho, alto);
  // Tablas: una línea cada medio tile.
  ctx.fillStyle = ESCENARIO_BORDE;
  for (let yy = y + s / 2; yy < y + alto - s / 4; yy += s / 2)
    ctx.fillRect(x, Math.round(yy), ancho, g);
  ctx.fillStyle = ESCENARIO_BRILLO;
  ctx.fillRect(x, y, ancho, g);
  // Frente de la tarima (el borde que se ve desde el público).
  ctx.fillStyle = ESCENARIO_BORDE;
  ctx.fillRect(x, y + alto - Math.round(s / 4), ancho, Math.round(s / 4));
  // Micrófonos de los costados.
  const piso = y + alto - Math.round(s / 4);
  for (const c of [e.col - 2, e.col + 2]) {
    if (c < e.c0 || c > e.c1) continue;
    pieDeMicrofono(ctx, Math.round(offsetX + (c + 0.5) * s), piso, zoom, Math.round(s * 0.8));
  }
  ctx.restore();
}

/** El micrófono del centro: encima de los personajes, delante del que habla. */
export function renderMicrofonoCentral(
  ctx: CanvasRenderingContext2D,
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const e = escenarioDe(areaTiles, cols, rows);
  if (!e) return;
  const s = TILE_SIZE * zoom;
  ctx.save();
  pieDeMicrofono(
    ctx,
    Math.round(offsetX + (e.col + 0.5) * s + s * 0.3),
    Math.round(offsetY + (e.row + 1) * s - s / 4),
    zoom,
    Math.round(s * 0.75),
  );
  ctx.restore();
}
