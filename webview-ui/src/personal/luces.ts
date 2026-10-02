/**
 * Personal (copia de juanfrunegro): luces de las salas (tanda 2).
 * - Deploy: la oficina del proyecto que está deployando parpadea suave en ámbar mientras dure el comando.
 * - Presentaciones: se prende tenue cuando una sesión pidió el aviso por voz ("preparando") y fuerte, con las
 *   pantallas encendidas, mientras alguien presenta (se acaba de decir su aviso).
 * ambiente.ts calcula qué sala se prende en cada cuadro (calcularLuces); el renderer solo dibuja (renderLuces).
 */
import { SALA_PRESENTACIONES } from '../../../core/src/salasComunes.js';
import { TILE_SIZE } from '../office/types.js';
import { COLOR_LUZ_DEPLOY, COLOR_LUZ_PRESENTACION, COLOR_PANTALLA } from './colores.js';

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
