/**
 * Personal (copia de juanfrunegro): qué señales de la tanda 2 lleva la tarjeta de cada agente (SenalesTarjeta.tsx) y
 * el sprite pixelado como imagen para mostrarlo en el DOM.
 */
import type { SpriteData } from '../office/types.js';
import { deployDe, humoDe } from './personal.js';

const cache = new Map<SpriteData, string>();

/** Sprite a data URL (pixelado, escala entera). En tests sin canvas devuelve ''. */
export function spriteUrl(sprite: SpriteData, escala = 3): string {
  const hecho = cache.get(sprite);
  if (hecho !== undefined) return hecho;
  let url = '';
  try {
    const c = document.createElement('canvas');
    c.width = (sprite[0]?.length ?? 0) * escala;
    c.height = sprite.length * escala;
    const ctx = c.getContext('2d');
    if (ctx) {
      sprite.forEach((fila, y) =>
        fila.forEach((color, x) => {
          if (!color) return;
          ctx.fillStyle = color;
          ctx.fillRect(x * escala, y * escala, escala, escala);
        }),
      );
      url = c.toDataURL();
    }
  } catch {
    url = '';
  }
  cache.set(sprite, url);
  return url;
}

export interface Senal {
  clave: 'permiso' | 'humo' | 'deploy';
  titulo: string;
}

/** Qué señales lleva la tarjeta de este agente, en orden de importancia. */
export function senalesDe(id: number, permiso: boolean, ahora = Date.now()): Senal[] {
  const out: Senal[] = [];
  if (permiso) out.push({ clave: 'permiso', titulo: 'Esperando tu permiso' });
  if (humoDe(id, ahora)) out.push({ clave: 'humo', titulo: 'Varios errores seguidos' });
  if (deployDe(id, ahora)) out.push({ clave: 'deploy', titulo: 'Deployando' });
  return out;
}
