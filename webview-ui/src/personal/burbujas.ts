/**
 * Personal (copia de juanfrunegro): lo que se dibuja encima de los personajes además de las burbujas del original.
 * - "Zzz" cuando la sesión se quedó sin tokens (dormidoDe).
 * El original solo llama a renderBurbujasPersonales() después de sus propias burbujas.
 */
import { BUBBLE_SITTING_OFFSET_PX, BUBBLE_VERTICAL_OFFSET_PX } from '../constants.js';
import { getCachedSprite } from '../office/sprites/spriteCache.js';
import type { Character, SpriteData } from '../office/types.js';
import { CharacterState } from '../office/types.js';
import { COLOR_ZZZ } from './colores.js';
import { dormidoDe } from './personal.js';

const _ = '';
const Z = COLOR_ZZZ;

function sprite(filas: string[], colores: Record<string, string>): SpriteData {
  return filas.map((f) => [...f].map((c) => (c === '.' ? _ : colores[c])));
}

/** Una "z" de 5x5. Se dibujan tres que suben y se desvanecen. */
export const LETRA_Z: SpriteData = sprite(['ZZZZZ', '...Z.', '..Z..', '.Z...', 'ZZZZZ'], { Z });

// ── Dibujo ──────────────────────────────────────────────────────

export function renderBurbujasPersonales(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  ahora = Date.now(),
): void {
  for (const ch of characters) {
    if (ch.isGreeter) continue;
    const sentado = ch.state === CharacterState.TYPE;
    const sittingOff = sentado ? BUBBLE_SITTING_OFFSET_PX : 0;
    const cabezaY = ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX;

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
    }
  }
}
