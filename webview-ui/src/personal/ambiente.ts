/**
 * Personal (copia de juanfrunegro): adónde va cada personaje, un paso por cuadro desde OfficeState.update().
 *
 * Regla, en este orden:
 * 1. Sin tokens: se duerme (Zzz) en su escritorio, quieto. No va a la cafetería.
 * 2. Esperando tu PERMISO: no está inactivo, se queda en su escritorio (para que veas quién te necesita).
 * 3. En una reunión (reuniones.ts): va a una silla de Reuniones, al lado del otro, y cuando llegan hablan.
 * 4. Inactivo (terminó el turno, espera tu próximo mensaje): se va a la Cafetería y se sienta; si no hay sillones
 *    libres, se queda parado ahí. Vuelve en cuanto arranca a trabajar. Los sub-agentes no van: desaparecen al terminar.
 * 5. Trabajando: va al lugar de lo que está haciendo (biblioteca, atril, pizarrón, mesa contable; ver lugares.ts) o a
 *    su escritorio para escribir código. Se queda al menos PERMANENCIA_MS en cada lugar para no ir y venir con cada
 *    herramienta. El "escritorio" de un sub-agente es el piso libre más cercano a la silla del que lo lanzó.
 */
import { SALA_CAFETERIA, SALA_REUNIONES } from '../../../core/src/salasComunes.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { getCatalogEntry } from '../office/layout/furnitureCatalog.js';
import { isWalkable } from '../office/layout/tileMap.js';
import type { Character } from '../office/types.js';
import { CharacterState, Direction } from '../office/types.js';
import { conversar, turnosDe } from './burbujas.js';
import {
  actividadDe,
  elegirPunto,
  type Lugar,
  type Punto,
  puntosDeAsientos,
  puntosDeLugares,
  puntosDePiso,
} from './lugares.js';
import { dormidoDe, padreDe, statusDe } from './personal.js';
import {
  DURACION_PROYECTO_MS,
  ESPERA_LLEGADA_MS,
  limpiarReuniones,
  reunionDe,
  reunionesActivas,
  reunir,
  sesionesQueSeCruzan,
} from './reuniones.js';

export const PERMANENCIA_MS = 5000;

let cache: { furniture: unknown; blocked: unknown; seats: unknown; puntos: Punto[] } | null = null;

function puntos(os: OfficeState): Punto[] {
  const layout = os.getLayout();
  if (
    cache &&
    cache.furniture === layout.furniture &&
    cache.blocked === os.blockedTiles &&
    cache.seats === os.seats
  ) {
    return cache.puntos;
  }
  const salaDe = (col: number, row: number) => layout.areaTiles?.[row * layout.cols + col] ?? null;
  const asientos = [...os.seats.entries()].map(([uid, s]) => ({ ...s, sala: os.seatZone(uid) }));
  const p = [
    ...puntosDeLugares(
      { furniture: layout.furniture, cols: layout.cols, areaTiles: layout.areaTiles },
      (tipo) => {
        const e = getCatalogEntry(tipo);
        return e ? { w: e.footprintW, h: e.footprintH } : undefined;
      },
      (col, row) => isWalkable(col, row, os.tileMap, os.blockedTiles),
    ),
    ...puntosDeAsientos(asientos, SALA_CAFETERIA, 'cafeteria'),
    ...puntosDePiso(os.walkableTiles, salaDe, SALA_CAFETERIA, 'cafeteria'),
    ...puntosDeAsientos(asientos, SALA_REUNIONES, 'reunion'),
  ];
  cache = { furniture: layout.furniture, blocked: os.blockedTiles, seats: os.seats, puntos: p };
  return p;
}

/** Tiles que ya eligió otro (destinos) o donde está parado otro personaje. */
function ocupadosPara(os: OfficeState, ch: Character): Set<string> {
  const ocupados = new Set<string>();
  for (const otro of os.characters.values()) {
    if (otro === ch) continue;
    if (otro.destino) ocupados.add(`${otro.destino.seatCol},${otro.destino.seatRow}`);
  }
  return ocupados;
}

// ── El escritorio de cada uno ───────────────────────────────────

/** El "escritorio" de cada sub-agente: el piso libre más cercano a la silla del que lo lanzó. */
const bases = new Map<number, { col: number; row: number }>();

function baseDe(os: OfficeState, sub: Character): { col: number; row: number } {
  const padre = sub.parentAgentId !== null ? os.characters.get(sub.parentAgentId) : undefined;
  const silla = padre?.seatId ? os.seats.get(padre.seatId) : undefined;
  if (!silla) return { col: sub.tileCol, row: sub.tileRow };
  const tomados = new Set([...bases.values()].map((b) => `${b.col},${b.row}`));
  let mejor = { col: sub.tileCol, row: sub.tileRow };
  let dist = Infinity;
  for (const t of os.walkableTiles) {
    if (tomados.has(`${t.col},${t.row}`)) continue;
    const d = Math.abs(t.col - silla.seatCol) + Math.abs(t.row - silla.seatRow);
    if (d > 0 && d < dist) {
      dist = d;
      mejor = t;
    }
  }
  return mejor;
}

function alEscritorio(ch: Character): void {
  ch.lugar = undefined;
  ch.lugarDesde = undefined;
  const b = ch.isSubagent ? bases.get(ch.id) : undefined;
  ch.destino = b
    ? { seatCol: b.col, seatRow: b.row, facingDir: ch.dir ?? Direction.DOWN }
    : undefined;
}

/** Manda al personaje al punto libre de ese lugar más cercano a `cerca` (o a donde está). */
function ir(
  os: OfficeState,
  ch: Character,
  lugar: Lugar,
  ahora: number,
  cerca?: { col: number; row: number },
): void {
  ch.lugar = lugar;
  ch.lugarDesde = ahora;
  const silla = ch.seatId ? os.seats.get(ch.seatId) : undefined;
  const desde =
    cerca ??
    (silla ? { col: silla.seatCol, row: silla.seatRow } : { col: ch.tileCol, row: ch.tileRow });
  const p = elegirPunto(puntos(os), lugar, desde, ocupadosPara(os, ch));
  ch.destino = p
    ? { seatCol: p.col, seatRow: p.row, facingDir: p.facingDir, sentado: p.sentado === true }
    : undefined;
}

/** Decide el lugar de un agente que trabaja. Devuelve true si cambió de lugar. */
export function moverSegunActividad(os: OfficeState, ch: Character, ahora: number): boolean {
  // Sin herramienta (pensando) se queda donde está.
  const padre = padreDe(ch.id);
  const proyecto =
    ch.folderName ?? (padre !== null ? os.characters.get(padre)?.folderName : undefined);
  const deseado: Lugar | null = ch.currentTool
    ? actividadDe(ch.currentTool, statusDe(ch.id), proyecto)
    : ((ch.lugar as Lugar | null | undefined) ?? null);
  if (deseado === (ch.lugar ?? null)) return false;
  if (ch.lugarDesde !== undefined && ahora - ch.lugarDesde < PERMANENCIA_MS) return false;
  if (!deseado) {
    alEscritorio(ch);
    ch.lugar = null;
    ch.lugarDesde = ahora;
    return true;
  }
  ir(os, ch, deseado, ahora);
  return true;
}

// ── Reuniones ───────────────────────────────────────────────────

function proyectoDe(os: OfficeState, ch: Character): string | undefined {
  const padre = padreDe(ch.id);
  return ch.folderName ?? (padre !== null ? os.characters.get(padre)?.folderName : undefined);
}

function llego(ch: Character): boolean {
  return !!ch.destino && ch.tileCol === ch.destino.seatCol && ch.tileRow === ch.destino.seatRow;
}

/** Arma las reuniones de sesiones del mismo proyecto y hace hablar a los que ya llegaron. */
function tickReuniones(os: OfficeState, ahora: number): void {
  limpiarReuniones(ahora, (id) => {
    const ch = os.characters.get(id);
    return !!ch && ch.matrixEffect !== 'despawn';
  });
  const activas: Array<{ id: number; proyecto: string | undefined }> = [];
  for (const ch of os.characters.values()) {
    if (ch.isSubagent || !ch.isActive || ch.matrixEffect || dormidoDe(ch.id, ahora)) continue;
    activas.push({ id: ch.id, proyecto: proyectoDe(os, ch) });
  }
  for (const { ids, proyecto } of sesionesQueSeCruzan(activas, ahora)) {
    reunir(ids, DURACION_PROYECTO_MS, ahora, proyecto);
  }
  for (const r of reunionesActivas(ahora)) {
    if (r.hablaron) continue;
    const miembros = r.ids.map((id) => os.characters.get(id));
    const todos = miembros.every((m) => m && m.lugar === 'reunion' && llego(m));
    if (todos || ahora - r.inicio >= ESPERA_LLEGADA_MS) {
      r.hablaron = true;
      conversar(turnosDe(r.ids), ahora);
    }
  }
}

// ── Paso por cuadro ─────────────────────────────────────────────

export function tickPersonal(os: OfficeState, ahora = Date.now()): void {
  tickReuniones(os, ahora);
  for (const id of bases.keys()) if (!os.characters.has(id)) bases.delete(id);
  for (const ch of os.characters.values()) {
    if (ch.matrixEffect) continue;
    if (ch.isSubagent && !bases.has(ch.id)) bases.set(ch.id, baseDe(os, ch));

    // 1. Dormido (sin tokens): en su silla, quieto.
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

    // 2. Esperando tu permiso: en su escritorio.
    if (ch.bubbleType === 'permission') {
      if (ch.lugar !== undefined || ch.destino) alEscritorio(ch);
      continue;
    }

    // 3. Reunión.
    const r = reunionDe(ch.id, ahora);
    if (r) {
      if (ch.lugar !== 'reunion') {
        const otro = r.ids.map((id) => os.characters.get(id)).find((o) => o && o !== ch);
        const cerca =
          otro?.lugar === 'reunion' && otro.destino
            ? { col: otro.destino.seatCol, row: otro.destino.seatRow }
            : undefined;
        ir(os, ch, 'reunion', ahora, cerca);
      }
      continue;
    }
    if (ch.lugar === 'reunion') alEscritorio(ch); // terminó la reunión: cada uno a lo suyo

    // 4. Inactivo: a la cafetería.
    if (!ch.isActive) {
      if (ch.isSubagent) {
        if (ch.lugar !== undefined) alEscritorio(ch);
        continue;
      }
      if (ch.lugar !== 'cafeteria') ir(os, ch, 'cafeteria', ahora);
      continue;
    }

    // 5. Trabajando.
    if (ch.lugar === 'cafeteria') alEscritorio(ch); // se puso a trabajar: vuelve ya, sin esperar
    moverSegunActividad(os, ch, ahora);
  }
}
