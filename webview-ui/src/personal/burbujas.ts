/**
 * Personal (copia de juanfrunegro): lo que se dibuja encima de los personajes además de las burbujas del original.
 * - "Zzz" cuando la sesión se quedó sin tokens (dormidoDe).
 * - Burbujas de diálogo cuando un agente lanza un sub-agente y cuando el sub-agente le devuelve el resultado.
 * - Etiqueta "WSL" al costado de los agentes que corren en WSL (otra cuenta), para distinguirlos de un vistazo.
 * El original solo llama a renderBurbujasPersonales() después de sus propias burbujas.
 */
import {
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_PX,
} from '../constants.js';
import { getCachedSprite } from '../office/sprites/spriteCache.js';
import type { Character, SpriteData } from '../office/types.js';
import { CharacterState } from '../office/types.js';
import {
  COLOR_BURBUJA_BORDE,
  COLOR_BURBUJA_FONDO,
  COLOR_BURBUJA_TEXTO,
  COLOR_ETIQUETA_TEXTO,
  COLOR_WSL,
  COLOR_ZZZ,
} from './colores.js';
import { dormidoDe, esWsl } from './personal.js';

const _ = '';
const Z = COLOR_ZZZ;
const B = COLOR_BURBUJA_BORDE;
const F = COLOR_BURBUJA_FONDO;
const L = COLOR_BURBUJA_TEXTO;
const V = COLOR_WSL;
const T = COLOR_ETIQUETA_TEXTO;

function sprite(filas: string[], colores: Record<string, string>): SpriteData {
  return filas.map((f) => [...f].map((c) => (c === '.' ? _ : colores[c])));
}

/** Una "z" de 5x5. Se dibujan tres que suben y se desvanecen. */
export const LETRA_Z: SpriteData = sprite(['ZZZZZ', '...Z.', '..Z..', '.Z...', 'ZZZZZ'], { Z });

/** Burbuja de diálogo (11x13, mismo formato que las del original): renglones de texto. */
export const BURBUJA_HABLA: SpriteData = sprite(
  [
    '.BBBBBBBBB.',
    'BFFFFFFFFFB',
    'BFLLLLLLFFB',
    'BFFFFFFFFFB',
    'BFLLLLFLLFB',
    'BFFFFFFFFFB',
    'BFLLLLLFFFB',
    'BFFFFFFFFFB',
    '.BBBBBBBBB.',
    '..BBB......',
    '..B........',
    '...........',
    '...........',
  ],
  { B, F, L },
);

/** Etiqueta "WSL" (15x7): fondo verde agua y letras blancas. */
export const ETIQUETA_WSL: SpriteData = sprite(
  [
    'VVVVVVVVVVVVVVV',
    'VTVVVTVTTTVTVVV',
    'VTVVVTVTVVVTVVV',
    'VTVTVTVTTTVTVVV',
    'VTTVTTVVVTVTVVV',
    'VTVVVTVTTTVTTTV',
    'VVVVVVVVVVVVVVV',
  ],
  { V, T },
);

// ── Conversaciones ──────────────────────────────────────────────

interface Conversacion {
  turnos: number[]; // ids de personaje, en orden: cada uno "habla" durante TURNO_SEG
  inicio: number; // ms
}

export const TURNO_SEG = 1.1;
let conversaciones: Conversacion[] = [];

/** Arranca una conversación: cada id del arreglo muestra la burbuja de diálogo durante un turno, en orden. */
export function conversar(turnos: number[], ahora = Date.now()): void {
  conversaciones.push({ turnos, inicio: ahora });
}

/** Quién está hablando ahora (ids). De paso descarta las conversaciones terminadas. */
export function hablando(ahora = Date.now()): Set<number> {
  const set = new Set<number>();
  conversaciones = conversaciones.filter((c) => {
    const turno = Math.floor((ahora - c.inicio) / (TURNO_SEG * 1000));
    if (turno >= c.turnos.length) return false;
    if (turno >= 0) set.add(c.turnos[turno]);
    return true;
  });
  return set;
}

/** Solo para tests. */
export function _reiniciarConversaciones(): void {
  conversaciones = [];
}

/** Lanzó un sub-agente: el que lo lanza explica, el sub-agente contesta, y otra vez. */
export function alLanzarSub(padre: number, sub: number, ahora = Date.now()): void {
  conversar([padre, sub, padre, sub], ahora);
}

/**
 * El sub-agente terminó: le cuenta al que lo lanzó mientras se desvanece (el efecto dura 0,3 s, por eso su turno
 * arranca "empezado") y después habla el que lo lanzó.
 */
export function alTerminarSub(padre: number, sub: number, ahora = Date.now()): void {
  conversar([sub, padre, padre], ahora - (TURNO_SEG - 0.3) * 1000);
}

// ── Dibujo ──────────────────────────────────────────────────────

export function renderBurbujasPersonales(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  ahora = Date.now(),
): void {
  const quienes = hablando(ahora);
  for (const ch of characters) {
    if (ch.isGreeter) continue;
    const sentado = ch.state === CharacterState.TYPE;
    const sittingOff = sentado ? BUBBLE_SITTING_OFFSET_PX : 0;
    const cabezaY = ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX;

    if (esWsl(ch.id) && ch.matrixEffect === null) {
      // Al costado izquierdo, a la altura del hombro: no pisa las burbujas, que van centradas arriba.
      const tag = getCachedSprite(ETIQUETA_WSL, zoom);
      const sentadoOff = sentado ? CHARACTER_SITTING_OFFSET_PX : 0;
      ctx.drawImage(
        tag,
        Math.round(offsetX + (ch.x - 20) * zoom),
        Math.round(offsetY + (ch.y + sentadoOff - 22) * zoom),
      );
    }

    if (dormidoDe(ch.id, ahora)) {
      // Tres "z" que suben en diagonal desde la cabeza, desfasadas, y se desvanecen.
      const z = getCachedSprite(LETRA_Z, zoom);
      for (let i = 0; i < 3; i++) {
        const t = (((ahora / 2400 + i / 3) % 1) + 1) % 1; // 0→1
        const x = offsetX + (ch.x + 3 + t * 8) * zoom;
        const y = offsetY + (cabezaY + 10 - t * 12) * zoom;
        ctx.save();
        ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const escala = 0.6 + t * 0.6;
        ctx.drawImage(
          z,
          Math.round(x),
          Math.round(y),
          Math.round(z.width * escala),
          Math.round(z.height * escala),
        );
        ctx.restore();
      }
      continue;
    }

    // La burbuja del original (permiso / listo) tiene prioridad.
    if (ch.bubbleType && !(ch.bubbleType === 'waiting' && ch.waitingAwaitingInput)) continue;
    if (!quienes.has(ch.id)) continue;
    const cached = getCachedSprite(BURBUJA_HABLA, zoom);
    ctx.save();
    if (ch.matrixEffect === 'despawn') ctx.globalAlpha = 0.8;
    ctx.drawImage(
      cached,
      Math.round(offsetX + ch.x * zoom - cached.width / 2),
      Math.round(offsetY + cabezaY * zoom - cached.height - 1 * zoom),
    );
    ctx.restore();
  }
}
