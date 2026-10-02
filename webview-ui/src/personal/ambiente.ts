/**
 * Personal (copia de juanfrunegro): comportamiento extra de los personajes, un paso por cuadro desde
 * OfficeState.update().
 * - Dormido (sin tokens): vuelve a su silla y se queda quieto, sin teclear ni pasear.
 * - Mientras trabaja, va al lugar de lo que está haciendo (biblioteca, pizarrón, atril, mesa contable; ver lugares.ts) y vuelve a su
 *   escritorio para escribir código. Se queda al menos PERMANENCIA_MS en cada lugar para no ir y venir con cada
 *   herramienta. Al terminar el turno, el original lo devuelve a su silla.
 */
import type { OfficeState } from '../office/engine/officeState.js';
import { getCatalogEntry } from '../office/layout/furnitureCatalog.js';
import { isWalkable } from '../office/layout/tileMap.js';
import type { Character } from '../office/types.js';
import { CharacterState } from '../office/types.js';
import { actividadDe, elegirPunto, type Punto, puntosDeLugares } from './lugares.js';
import { dormidoDe, padreDe, statusDe } from './personal.js';

export const PERMANENCIA_MS = 5000;

let cache: { furniture: unknown; blocked: unknown; puntos: Punto[] } | null = null;

function puntos(os: OfficeState): Punto[] {
  const layout = os.getLayout();
  if (cache && cache.furniture === layout.furniture && cache.blocked === os.blockedTiles) {
    return cache.puntos;
  }
  const p = puntosDeLugares(
    { furniture: layout.furniture, cols: layout.cols, areaTiles: layout.areaTiles },
    (tipo) => {
      const e = getCatalogEntry(tipo);
      return e ? { w: e.footprintW, h: e.footprintH } : undefined;
    },
    (col, row) => isWalkable(col, row, os.tileMap, os.blockedTiles),
  );
  cache = { furniture: layout.furniture, blocked: os.blockedTiles, puntos: p };
  return p;
}

function salaDe(os: OfficeState, ch: Character): string | null {
  if (ch.seatId) return os.seatZone(ch.seatId);
  const l = os.getLayout();
  return l.areaTiles?.[ch.tileRow * l.cols + ch.tileCol] ?? null;
}

/** Decide el lugar de un agente que trabaja. Devuelve true si cambió de lugar. */
export function moverSegunActividad(os: OfficeState, ch: Character, ahora: number): boolean {
  // Sin herramienta (pensando) se queda donde está.
  const padre = padreDe(ch.id);
  const proyecto =
    ch.folderName ?? (padre !== null ? os.characters.get(padre)?.folderName : undefined);
  const deseado = ch.currentTool
    ? actividadDe(ch.currentTool, statusDe(ch.id), proyecto)
    : (ch.lugar ?? null);
  if (deseado === (ch.lugar ?? null)) return false;
  if (ch.lugarDesde !== undefined && ahora - ch.lugarDesde < PERMANENCIA_MS) return false;
  ch.lugar = deseado;
  ch.lugarDesde = ahora;
  if (!deseado) {
    ch.destino = undefined;
    return true;
  }
  const ocupados = new Set<string>();
  for (const otro of os.characters.values()) {
    if (otro !== ch && otro.destino)
      ocupados.add(`${otro.destino.seatCol},${otro.destino.seatRow}`);
  }
  const silla = ch.seatId ? os.seats.get(ch.seatId) : undefined;
  const desde = silla
    ? { col: silla.seatCol, row: silla.seatRow }
    : { col: ch.tileCol, row: ch.tileRow };
  const p = elegirPunto(puntos(os), deseado, salaDe(os, ch), desde, ocupados);
  ch.destino = p ? { seatCol: p.col, seatRow: p.row, facingDir: p.facingDir } : undefined;
  return true;
}

export function tickPersonal(os: OfficeState, ahora = Date.now()): void {
  for (const ch of os.characters.values()) {
    if (ch.matrixEffect) continue;
    if (!ch.isSubagent && dormidoDe(ch.id, ahora)) {
      ch.destino = undefined;
      ch.lugar = null;
      if (ch.state === CharacterState.TYPE) {
        ch.seatTimer = Math.max(ch.seatTimer, 1); // sigue sentado mientras duerma
        ch.frame = 0;
        ch.frameTimer = 0;
      } else if (ch.state === CharacterState.IDLE && ch.seatId) {
        os.sendToSeat(ch.id);
      }
      continue;
    }
    if (!ch.isActive) {
      // Terminó el turno: el original lo lleva a su silla o lo deja pasear.
      ch.destino = undefined;
      ch.lugar = undefined;
      ch.lugarDesde = undefined;
      continue;
    }
    moverSegunActividad(os, ch, ahora);
  }
}
