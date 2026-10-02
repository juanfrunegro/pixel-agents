/**
 * Personal (copia de juanfrunegro): luces de las salas (tanda 2).
 * - Deploy: la oficina del proyecto que está deployando parpadea suave en ámbar mientras dure el comando.
 * - Presentaciones: se prende tenue cuando una sesión pidió el aviso por voz ("preparando") y fuerte, con las
 *   pantallas encendidas, mientras alguien presenta (se acaba de decir su aviso).
 * - Hora del día (tanda 3): de día normal; al atardecer un tono cálido; de noche (20 a 7 h, hora de esta PC) la oficina
 *   se oscurece y solo quedan iluminadas las salas donde alguien trabaja (y las que tienen su luz: deploy,
 *   Presentaciones). Suave, para la segunda pantalla. Con el editor de Layout abierto no se oscurece nada.
 * ambiente.ts calcula qué sala se prende en cada cuadro (calcularLuces, salas con gente trabajando); el renderer solo
 * dibuja (renderNoche, renderLuces).
 */
import { SALA_PRESENTACIONES } from '../../../core/src/salasComunes.js';
import { TILE_SIZE } from '../office/types.js';
import {
  COLOR_CALIDO,
  COLOR_LUZ_DEPLOY,
  COLOR_LUZ_PRESENTACION,
  COLOR_NOCHE,
  COLOR_PANTALLA,
} from './colores.js';

export type Luz = 'deploy' | 'presentando' | 'preparando';

/** Período del parpadeo de deploy (ms). */
export const PARPADEO_MS = 1400;

export interface EstadoLuz {
  sala: string | null; // oficina del agente (la de su silla, o la del padre para un sub-agente)
  deploy: boolean;
  voz: boolean;
  presentando: boolean;
}

/** Qué sala se prende y cómo. Presentaciones: presentando gana sobre preparando. */
export function calcularLuces(agentes: Iterable<EstadoLuz>): Map<string, Luz> {
  const luces = new Map<string, Luz>();
  for (const a of agentes) {
    if (a.deploy && a.sala) luces.set(a.sala, 'deploy');
    if (a.presentando) luces.set(SALA_PRESENTACIONES, 'presentando');
    else if (a.voz && luces.get(SALA_PRESENTACIONES) !== 'presentando')
      luces.set(SALA_PRESENTACIONES, 'preparando');
  }
  return luces;
}

/** Opacidad de la luz en este instante: el deploy late entre 0,08 y 0,28; Presentaciones es fija. */
export function alfaDe(luz: Luz, ahora: number): number {
  if (luz === 'deploy') {
    const fase = (Math.sin(((ahora % PARPADEO_MS) / PARPADEO_MS) * 2 * Math.PI) + 1) / 2;
    return 0.08 + 0.2 * fase;
  }
  return luz === 'presentando' ? 0.2 : 0.13;
}

let actuales = new Map<string, Luz>();
let pantallas: Array<{ col: number; row: number; w: number; h: number }> = [];

export function setLuces(
  luces: Map<string, Luz>,
  pantallasDePresentaciones: Array<{ col: number; row: number; w: number; h: number }>,
): void {
  actuales = luces;
  pantallas = pantallasDePresentaciones;
}

export function lucesActuales(): ReadonlyMap<string, Luz> {
  return actuales;
}

/** Dibuja las luces encima de muebles y personajes (debajo de las burbujas). */
export function renderLuces(
  ctx: CanvasRenderingContext2D,
  areaTiles: Array<string | null> | undefined,
  cols: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  ahora = Date.now(),
): void {
  if (!areaTiles || actuales.size === 0) return;
  const s = TILE_SIZE * zoom;
  ctx.save();
  for (const [sala, luz] of actuales) {
    ctx.globalAlpha = alfaDe(luz, ahora);
    ctx.fillStyle = luz === 'deploy' ? COLOR_LUZ_DEPLOY : COLOR_LUZ_PRESENTACION;
    for (let i = 0; i < areaTiles.length; i++) {
      if (areaTiles[i] !== sala) continue;
      ctx.fillRect(offsetX + (i % cols) * s, offsetY + Math.floor(i / cols) * s, s, s);
    }
  }
  if (actuales.get(SALA_PRESENTACIONES) === 'presentando') {
    // Pantallas encendidas: un brillo sobre cada pizarrón/pantalla de la sala.
    ctx.globalAlpha = 0.55 + 0.1 * Math.sin(ahora / 300);
    ctx.fillStyle = COLOR_PANTALLA;
    for (const p of pantallas) {
      ctx.fillRect(
        offsetX + p.col * s + 2 * zoom,
        offsetY + p.row * s + 2 * zoom,
        p.w * s - 4 * zoom,
        p.h * s - 4 * zoom,
      );
    }
  }
  ctx.restore();
}

// ── Hora del día ────────────────────────────────────────────────

/** Oscuridad de la noche en las salas apagadas (opacidad del velo). */
export const NOCHE = 0.55;
const CALIDO_ATARDECER = 0.12;
const CALIDO_NOCHE = 0.03;

export interface LuzDelDia {
  /** Opacidad del velo oscuro sobre las salas sin nadie trabajando. */
  oscuridad: number;
  /** Opacidad del tono cálido sobre toda la oficina. */
  calidez: number;
}

/**
 * Luz de la oficina a esa hora (decimal, 0–24, hora local). Día (8–18): normal. Atardecer (18–19): se pone cálida;
 * (19–20): se va oscureciendo. Noche (20–7): oscura. Amanecer (7–8): se aclara. Sin saltos entre tramos.
 */
export function luzDelDia(hora: number): LuzDelDia {
  const h = ((hora % 24) + 24) % 24;
  if (h >= 8 && h < 18) return { oscuridad: 0, calidez: 0 };
  if (h >= 18 && h < 19) return { oscuridad: 0, calidez: CALIDO_ATARDECER * (h - 18) };
  if (h >= 19 && h < 20) {
    const t = h - 19;
    return {
      oscuridad: NOCHE * t,
      calidez: CALIDO_ATARDECER - (CALIDO_ATARDECER - CALIDO_NOCHE) * t,
    };
  }
  if (h >= 7 && h < 8) {
    const t = h - 7;
    return { oscuridad: NOCHE * (1 - t), calidez: CALIDO_NOCHE * (1 - t) };
  }
  return { oscuridad: NOCHE, calidez: CALIDO_NOCHE };
}

/**
 * Hora fija para probar cómo se ve (agregar &hora=22 a la URL de la oficina); null = la hora real. No hay ningún botón:
 * solo se usa a propósito, desde la URL.
 */
function horaDeLaUrl(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('hora');
    const h = v === null ? NaN : Number(v);
    return Number.isFinite(h) && h >= 0 && h < 24 ? h : null;
  } catch {
    return null;
  }
}
const HORA_FIJA = horaDeLaUrl();

export function horaLocal(d = new Date()): number {
  return HORA_FIJA ?? d.getHours() + d.getMinutes() / 60;
}

let prendidas: ReadonlySet<string> = new Set();

/** Salas con alguien trabajando (ambiente.ts, cada cuadro): de noche quedan iluminadas. */
export function setSalasPrendidas(salas: ReadonlySet<string>): void {
  prendidas = salas;
}

export function salasPrendidas(): ReadonlySet<string> {
  return prendidas;
}

/** Tramos horizontales [col, hasta) de cada fila que van a oscuras: todo lo que no es una sala prendida. */
export function tramosOscuros(
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
  luz: ReadonlySet<string>,
): Array<{ row: number; col: number; hasta: number }> {
  const out: Array<{ row: number; col: number; hasta: number }> = [];
  for (let r = 0; r < rows; r++) {
    let inicio = -1;
    for (let c = 0; c <= cols; c++) {
      const a = c < cols ? (areaTiles?.[r * cols + c] ?? null) : null;
      const oscuro = c < cols && !(a && luz.has(a));
      if (oscuro && inicio < 0) inicio = c;
      if (!oscuro && inicio >= 0) {
        out.push({ row: r, col: inicio, hasta: c });
        inicio = -1;
      }
    }
  }
  return out;
}

/** Dibuja la luz de la hora: velo oscuro (menos en las salas prendidas) y tono cálido. Debajo de las luces de sala. */
export function renderNoche(
  ctx: CanvasRenderingContext2D,
  areaTiles: Array<string | null> | undefined,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  hora = horaLocal(),
): void {
  const { oscuridad, calidez } = luzDelDia(hora);
  if (oscuridad <= 0 && calidez <= 0) return;
  const s = TILE_SIZE * zoom;
  ctx.save();
  if (oscuridad > 0) {
    const luz = new Set([...prendidas, ...actuales.keys()]);
    ctx.globalAlpha = oscuridad;
    ctx.fillStyle = COLOR_NOCHE;
    for (const t of tramosOscuros(areaTiles, cols, rows, luz)) {
      ctx.fillRect(offsetX + t.col * s, offsetY + t.row * s, (t.hasta - t.col) * s, s);
    }
  }
  if (calidez > 0) {
    ctx.globalAlpha = calidez;
    ctx.fillStyle = COLOR_CALIDO;
    ctx.fillRect(offsetX, offsetY, cols * s, rows * s);
  }
  ctx.restore();
}
