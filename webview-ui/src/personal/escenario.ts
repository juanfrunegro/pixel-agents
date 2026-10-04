/**
 * Personal (copia de juanfrunegro): el escenario de Presentaciones. Una tarima de madera frente a las pantallas, con un
 * solo micrófono al centro (donde se para el que dice su aviso por voz, de a uno; ver puntosDePresentacion). Se dibuja en el canvas (no hay sprites de escenario): la tarima debajo de los personajes y el micrófono
 * del centro encima, para que quede delante del que habla.
 */
import { ESCENARIO_FILA, SALA_PRESENTACIONES } from '../../../core/src/salasComunes.js';
import { TILE_SIZE } from '../constants.js';
import { salasDelPlano } from './carteles.js';
import {
  ESCENARIO_BORDE,
  ESCENARIO_BRILLO,
  ESCENARIO_MADERA,
  MIC_BRILLO,
  MIC_CABEZA,
  MIC_CANO,
  MIC_MANGO,
  MIC_PIE,
  MIC_REJILLA,
  MIC_SOMBRA,
  PARLANTE_BORDE,
  PARLANTE_CAJA,
  PARLANTE_CENTRO,
  PARLANTE_CONO,
  PARLANTE_ONDA,
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

/** Alto del caño del micrófono, en píxeles del dibujo (a zoom 1). */
const CANO = 5;

/**
 * Micrófono de pie en pixel art. `cx` es el centro exacto (el borde entre las dos columnas del medio: todo el dibujo
 * tiene ancho par para quedar centrado) y `yPiso` la línea donde apoya. Las coordenadas son píxeles del dibujo
 * (cada uno mide `zoom`), con x relativo al centro e y hacia arriba desde el piso.
 */
function pieDeMicrofono(
  ctx: CanvasRenderingContext2D,
  cx: number,
  yPiso: number,
  zoom: number,
): void {
  const g = Math.max(1, Math.round(zoom));
  const px = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(cx + x * g, yPiso - (y + h) * g, w * g, h * g);
  };
  px(-4, 0, 8, 1, MIC_SOMBRA); // sombra sobre la tarima
  // Trípode: dos patas en diagonal hasta el cubo.
  px(-4, 0, 1, 1, MIC_PIE);
  px(3, 0, 1, 1, MIC_PIE);
  px(-3, 1, 1, 1, MIC_PIE);
  px(2, 1, 1, 1, MIC_PIE);
  px(-2, 2, 4, 1, MIC_PIE);
  // Caño: dos columnas, una con luz, para que se lea redondo.
  px(-1, 3, 1, CANO, MIC_PIE);
  px(0, 3, 1, CANO, MIC_CANO);
  const y = 3 + CANO;
  px(-2, y, 4, 1, MIC_PIE); // pinza
  px(-1, y + 1, 2, 2, MIC_MANGO); // mango
  px(-2, y + 3, 4, 1, MIC_REJILLA); // aro
  px(-2, y + 4, 4, 2, MIC_CABEZA); // cabeza
  px(-1, y + 6, 2, 1, MIC_CABEZA); // tope redondeado
  px(-1, y + 5, 1, 2, MIC_BRILLO); // reflejo
}

/** Ancho y alto del parlante en píxeles del dibujo (a zoom 1). */
const PARLANTE_W = 10;
const PARLANTE_H = 16;
/** Cada cuánto avanza una onda (ms) y cuántas se ven a la vez. */
const ONDA_MS = 180;
const ONDAS = 3;

/**
 * Parlante de pie en pixel art: caja oscura con un tweeter arriba y un woofer abajo. `x0` es el borde izquierdo y
 * `yPiso` la línea donde apoya. Si `lado` no es 0, dibuja ondas hacia ese lado (−1 izquierda, 1 derecha) que avanzan con
 * `ahora`: suenan mientras alguien presenta.
 */
function parlante(
  ctx: CanvasRenderingContext2D,
  x0: number,
  yPiso: number,
  zoom: number,
  lado: -1 | 0 | 1,
  ahora: number,
): void {
  const g = Math.max(1, Math.round(zoom));
  const px = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x0 + x * g, yPiso - (y + h) * g, w * g, h * g);
  };
  px(-1, 0, PARLANTE_W + 2, 1, MIC_SOMBRA);
  px(0, 0, PARLANTE_W, PARLANTE_H, PARLANTE_BORDE);
  px(1, 1, PARLANTE_W - 2, PARLANTE_H - 2, PARLANTE_CAJA);
  // Woofer (abajo): un cono redondeado de 6×6; mientras suena, el centro late.
  const late = lado !== 0 && Math.floor(ahora / 90) % 2 === 0;
  px(2, 2, 6, 6, PARLANTE_CONO);
  px(3, 1, 4, 1, PARLANTE_CONO);
  px(3, 8, 4, 1, PARLANTE_CONO);
  px(late ? 3 : 4, late ? 3 : 4, late ? 4 : 2, late ? 4 : 2, PARLANTE_CENTRO);
  // Tweeter (arriba).
  px(4, 11, 2, 2, PARLANTE_CONO);
  px(4, 12, 1, 1, PARLANTE_CENTRO);
  if (lado === 0) return;
  // Ondas: arcos que salen del woofer hacia afuera; la más nueva, más fuerte.
  const fase = Math.floor(ahora / ONDA_MS);
  const cy = 5; // centro del woofer
  for (let k = 0; k < ONDAS; k++) {
    const r = 2 + ((fase + k) % ONDAS) * 2;
    ctx.globalAlpha = 1 - ((fase + k) % ONDAS) / ONDAS;
    const x = lado < 0 ? -1 - r : PARLANTE_W + r;
    px(x, cy - Math.floor(r / 2) + 1, 1, r, PARLANTE_ONDA);
    px(x - lado, cy - Math.floor(r / 2), 1, 1, PARLANTE_ONDA);
    px(x - lado, cy + Math.floor(r / 2) + 1, 1, 1, PARLANTE_ONDA);
  }
  ctx.globalAlpha = 1;
}

/** La tarima: debajo de los personajes. Con `sonando`, los parlantes de las puntas tiran ondas. */
export function renderEscenario(
  ctx: CanvasRenderingContext2D,
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  sonando = false,
  ahora = Date.now(),
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
  // Parlantes en las puntas de atrás de la tarima, apenas adentro del borde.
  const yPiso = Math.round(y + s - g);
  const margen = 2 * g;
  parlante(ctx, Math.round(x + margen), yPiso, zoom, sonando ? -1 : 0, ahora);
  parlante(
    ctx,
    Math.round(x + ancho - margen - PARLANTE_W * g),
    yPiso,
    zoom,
    sonando ? 1 : 0,
    ahora,
  );
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
    Math.round(offsetX + (e.col + 0.5) * s),
    Math.round(offsetY + (e.row + 1) * s - s / 4),
    zoom,
  );
  ctx.restore();
}
