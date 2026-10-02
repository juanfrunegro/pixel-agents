/**
 * Personal (copia de juanfrunegro), tanda 5: skins de Marvel, solo estética (core/src/skinsMarvel.ts). Un agente que se
 * llama como uno de los cinco se dibuja con su skin en vez de su personaje; no cambia nada más. El servidor manda los
 * sprites (skinsPersonalesLoaded) con el mismo formato que los personajes del original.
 */
import { skinDeNombre, type SkinMarvel } from '../../../core/src/skinsMarvel.js';
import {
  type CharacterSprites,
  charSpritesFrom,
  type LoadedCharacterData,
} from '../office/sprites/spriteData.js';
import type { Character } from '../office/types.js';
import { nombreDe } from './personal.js';

let sprites = new Map<string, CharacterSprites>();

export function setSkins(raw: unknown): void {
  const m = new Map<string, CharacterSprites>();
  if (raw && typeof raw === 'object') {
    for (const [id, data] of Object.entries(raw as Record<string, LoadedCharacterData>)) {
      if (data?.down?.length && data.up?.length && data.right?.length)
        m.set(id, charSpritesFrom(data));
    }
  }
  sprites = m;
}

const memo = new Map<string, SkinMarvel | null>();

/** Skin del personaje según su nombre de fantasía (el mismo que muestra la ficha), o null. */
export function skinDe(ch: Pick<Character, 'id' | 'agentName'>): SkinMarvel | null {
  const nombre = ch.agentName || nombreDe(ch.id);
  let s = memo.get(nombre);
  if (s === undefined) {
    s = skinDeNombre(nombre);
    if (memo.size > 500) memo.clear();
    memo.set(nombre, s);
  }
  return s;
}

/** Sprites de la skin del personaje (renderer.ts), o null para dibujarlo con su personaje de siempre. */
export function spritesDeSkin(ch: Pick<Character, 'id' | 'agentName'>): CharacterSprites | null {
  if (sprites.size === 0) return null;
  const s = skinDe(ch);
  return s ? (sprites.get(s) ?? null) : null;
}

let ultimaPublicacion = 0;
let publicado = '';

/**
 * Publica en localStorage qué skins de Marvel hay ahora en la oficina, para que el organigrama (misma origen, otra
 * pestaña) marque a esos externos "en la oficina". Barato: como mucho cada 2 s y solo escribe si cambió (o para
 * refrescar la marca de tiempo cada 10 s). Clave: CLAVE_MARVEL_ACTIVOS en server/src/personal/organigrama.ts.
 */
export function publicarMarvelActivos(
  chars: Iterable<Pick<Character, 'id' | 'agentName' | 'matrixEffect'>>,
  ahora = Date.now(),
): void {
  if (ahora - ultimaPublicacion < 2000) return;
  const ids = new Set<string>();
  for (const ch of chars) {
    if (ch.matrixEffect === 'despawn') continue;
    const s = skinDe(ch);
    if (s) ids.add(s);
  }
  const lista = [...ids].sort().join(',');
  if (lista === publicado && ahora - ultimaPublicacion < 10000) return;
  ultimaPublicacion = ahora;
  publicado = lista;
  try {
    localStorage.setItem('pixel.marvelActivos', JSON.stringify({ ids: [...ids].sort(), t: ahora }));
  } catch {
    // sin almacenamiento (modo privado, bloqueado): el organigrama los muestra "disponible"
  }
}
