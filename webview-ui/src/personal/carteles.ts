/**
 * Personal (copia de juanfrunegro): el nombre de cada sala en un cartel sobre su pared de arriba, como la placa de una
 * puerta. Siempre visible pero tenue (sin prender "Mostrar áreas", que además tiñe el piso); al pasar el mouse por la
 * sala, la sala se aclara un poco y su cartel se resalta. En el pasillo no va nada: taparía a los que caminan.
 * Con "Mostrar áreas" prendido no se dibuja (ya están los nombres del original).
 * Si el proyecto tiene prendido "Avisame por WhatsApp cuando termine" (menú de la oficina), el cartel lleva un globito
 * verde a la derecha del nombre.
 */
import { esOficinaLibre } from '../../../core/src/salasComunes.js';
import { TILE_SIZE } from '../constants.js';
import {
  CARTEL_BORDE,
  CARTEL_FONDO,
  CARTEL_TEXTO,
  CARTEL_TEXTO_RESALTADO,
  CARTEL_WHATSAPP,
  SALA_ACLARADO,
} from './colores.js';
import { whatsappProyecto } from './pizarra.js';

interface Sala {
  label: string;
  minCol: number;
  maxCol: number;
  minRow: number;
  /** Tramos horizontales de tiles de la sala (para aclararla sin un fillRect por tile). */
  tramos: Array<{ row: number; c0: number; c1: number }>;
}

let cache: { areaTiles: Array<string | null>; cols: number; salas: Sala[] } | null = null;

/** Las salas del plano con su caja y sus tramos; se recalcula solo si cambia el plano. */
export function salasDelPlano(areaTiles: Array<string | null>, cols: number, rows: number): Sala[] {
  if (cache && cache.areaTiles === areaTiles && cache.cols === cols) return cache.salas;
  const porNombre = new Map<string, Sala>();
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const label = areaTiles[r * cols + c];
      if (!label) {
        c++;
        continue;
      }
      let c1 = c;
      while (c1 + 1 < cols && areaTiles[r * cols + c1 + 1] === label) c1++;
      let s = porNombre.get(label);
      if (!s) {
        s = { label, minCol: c, maxCol: c1, minRow: r, tramos: [] };
        porNombre.set(label, s);
      }
      s.minCol = Math.min(s.minCol, c);
      s.maxCol = Math.max(s.maxCol, c1);
      s.minRow = Math.min(s.minRow, r);
      s.tramos.push({ row: r, c0: c, c1 });
      c = c1 + 1;
    }
  }
  const salas = [...porNombre.values()];
  cache = { areaTiles, cols, salas };
  return salas;
}

/** La sala bajo el mouse (null en el pasillo o fuera del plano). */
export function salaEn(
  areaTiles: Array<string | null> | undefined,
  cols: number,
  tile: { col: number; row: number } | null | undefined,
): string | null {
  if (!areaTiles || !tile || tile.col < 0 || tile.row < 0 || tile.col >= cols) return null;
  return areaTiles[tile.row * cols + tile.col] ?? null;
}

const ALFA_REPOSO = 0.72;

/** Globito de chat con tres puntos (7×7 píxeles): # verde, o blanco, . vacío. */
const GLOBITO = ['.#####.', '#######', '#o#o#o#', '#######', '.#####.', '.##....', '##.....'];

/**
 * El globito al lado de un nombre de sala con "Mostrar áreas" prendido (renderAreaLabels del original): a la derecha del
 * texto, si ese proyecto tiene el aviso por WhatsApp prendido.
 */
export function globitoJuntoAlNombre(
  ctx: CanvasRenderingContext2D,
  label: string,
  derechaDelTexto: number,
  cy: number,
  fuente: number,
): void {
  if (esOficinaLibre(label) || !whatsappProyecto(label)) return;
  const u = Math.max(1, Math.round(fuente / 9));
  ctx.globalAlpha = 1;
  dibujarGlobito(ctx, Math.round(derechaDelTexto + 2 * u), Math.round(cy - 3.5 * u), u);
}

function dibujarGlobito(ctx: CanvasRenderingContext2D, x: number, y: number, u: number): void {
  GLOBITO.forEach((fila, r) => {
    for (let c = 0; c < fila.length; c++) {
      if (fila[c] === '.') continue;
      ctx.fillStyle = fila[c] === '#' ? CARTEL_WHATSAPP : CARTEL_TEXTO_RESALTADO;
      ctx.fillRect(x + c * u, y + r * u, u, u);
    }
  });
}

const ACLARADO = 0.07;

export function renderCarteles(
  ctx: CanvasRenderingContext2D,
  areaTiles: Array<string | null> | undefined,
  areas: Array<{ label: string; color: string }> | undefined,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  hoveredTile: { col: number; row: number } | null | undefined,
): void {
  if (!areaTiles || areaTiles.length === 0 || cols <= 0) return;
  const s = TILE_SIZE * zoom;
  const salas = salasDelPlano(areaTiles, cols, rows);
  const encima = salaEn(areaTiles, cols, hoveredTile);
  const color = new Map((areas ?? []).map((a) => [a.label, a.color]));

  ctx.save();
  // La sala bajo el mouse se aclara un poco.
  const hover = encima ? salas.find((x) => x.label === encima) : undefined;
  if (hover) {
    ctx.globalAlpha = ACLARADO;
    ctx.fillStyle = SALA_ACLARADO;
    for (const t of hover.tramos) {
      ctx.fillRect(offsetX + t.c0 * s, offsetY + t.row * s, (t.c1 - t.c0 + 1) * s, s);
    }
  }

  const fuente = Math.max(Math.round(8 * zoom), 14);
  ctx.font = `${fuente}px 'FS Pixel Sans'`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const borde = Math.max(1, Math.round(zoom / 2));
  for (const sala of salas) {
    if (sala.minRow <= 0) continue; // sin pared arriba
    const libre = esOficinaLibre(sala.label);
    const texto = libre ? 'Libre' : sala.label;
    const resaltado = sala.label === encima;
    const wpp = !libre && whatsappProyecto(sala.label);
    const u = Math.max(1, Math.round(fuente / 9));
    const extra = wpp ? 9 * u : 0; // globito (7) y su espacio (2)
    const ancho = Math.min(
      ctx.measureText(texto).width + fuente + extra,
      (sala.maxCol - sala.minCol + 1) * s,
    );
    const alto = Math.round(fuente * 1.5);
    const cx = Math.round(offsetX + ((sala.minCol + sala.maxCol + 1) / 2) * s);
    // Placa centrada en la pared de arriba de la sala, pegada al piso (no tapa lo que hay arriba en la pared).
    const cy = Math.round(offsetY + sala.minRow * s - alto / 2 - borde);
    const x = Math.round(cx - ancho / 2);
    const y = Math.round(cy - alto / 2);

    ctx.globalAlpha = resaltado ? 1 : ALFA_REPOSO * (libre ? 0.7 : 1);
    ctx.fillStyle = CARTEL_FONDO;
    ctx.fillRect(x, y, ancho, alto);
    ctx.fillStyle = resaltado ? (color.get(sala.label) ?? CARTEL_TEXTO) : CARTEL_BORDE;
    ctx.fillRect(x, y, ancho, borde);
    ctx.fillRect(x, y + alto - borde, ancho, borde);
    ctx.fillRect(x, y, borde, alto);
    ctx.fillRect(x + ancho - borde, y, borde, alto);
    ctx.fillStyle = resaltado ? CARTEL_TEXTO_RESALTADO : CARTEL_TEXTO;
    ctx.fillText(texto, cx - extra / 2, cy + borde / 2, ancho - fuente / 2 - extra);
    if (wpp) {
      ctx.globalAlpha = 1; // el aviso se ve siempre, aunque el cartel esté tenue
      dibujarGlobito(ctx, Math.round(x + ancho - fuente / 2 - 7 * u), Math.round(cy - 3.5 * u), u);
    }
  }
  ctx.restore();
}

/** Solo para tests. */
export function _reiniciarCarteles(): void {
  cache = null;
}
