/**
 * Personal (copia de juanfrunegro), tanda 5: carga los PNG de las skins de Marvel (core/src/skinsMarvel.ts) con el mismo
 * decodificador que los personajes del original y los manda al webview (skinsPersonalesLoaded) al conectar.
 */
import * as fs from 'fs';
import * as path from 'path';

import { decodeCharacterPng } from '../../../core/src/assets/pngDecoder.js';
import type { CharacterDirectionSprites } from '../../../core/src/assets/types.js';
import { SKINS_MARVEL } from '../../../core/src/skinsMarvel.js';

let cargadas: Record<string, CharacterDirectionSprites> = {};

/** Lee <assetsRoot>/assets/marvel/<id>.png. Una skin que falta o no se puede leer se saltea (sin skin = personaje normal). */
export function cargarSkins(assetsRoot: string): Record<string, CharacterDirectionSprites> {
  const skins: Record<string, CharacterDirectionSprites> = {};
  for (const s of SKINS_MARVEL) {
    try {
      skins[s.id] = decodeCharacterPng(
        fs.readFileSync(path.join(assetsRoot, 'assets', 'marvel', `${s.id}.png`)),
      );
    } catch {
      /* sin esa skin */
    }
  }
  cargadas = skins;
  return skins;
}

export function mensajeSkins(): Record<string, unknown> | null {
  return Object.keys(cargadas).length ? { type: 'skinsPersonalesLoaded', skins: cargadas } : null;
}
