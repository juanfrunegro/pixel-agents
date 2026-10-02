/**
 * Personal (copia de juanfrunegro): adónde va cada personaje, un paso por cuadro desde OfficeState.update().
 *
 * Regla, en este orden:
 * 1. Sin tokens: se duerme (Zzz) en su escritorio, quieto. No va a la cafetería.
 * 2. Esperando tu PERMISO: no está inactivo, se queda en su escritorio (para que veas quién te necesita).
 * 3. Presentando (se acaba de decir su aviso por voz, ver presentandoDe): va a Presentaciones, frente a la pantalla.
 * 3b. En una reunión (reuniones.ts): va a una silla de Reuniones, al lado del otro, y cuando llegan hablan.
 * 4. Sin uso (terminó el turno, espera tu próximo mensaje, o una sesión restaurada sin nada en curso; ver enUso en
 *    personal.ts): se va a la Cafetería y se sienta; si no hay sillones libres, se queda parado ahí. Vuelve en cuanto
 *    arranca a trabajar. Los sub-agentes no van: desaparecen al terminar.
 * 5. Trabajando: va al lugar de lo que está haciendo (biblioteca, atril, pizarrón, mesa contable; ver lugares.ts) o a
 *    su escritorio para escribir código. Se queda al menos PERMANENCIA_MS en cada lugar para no ir y venir con cada
 *    herramienta. El "escritorio" de un sub-agente es un escritorio libre de la oficina de su proyecto (la de la silla
 *    del que lo lanzó); si no hay, el piso libre más cercano a esa silla.
 * Además, cada cuadro calcula las luces de las salas (luces.ts): deploy y Presentaciones.
 */
import {
  SALA_CAFETERIA,
  SALA_PRESENTACIONES,
  SALA_REUNIONES,
} from '../../../core/src/salasComunes.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { getCatalogEntry } from '../office/layout/furnitureCatalog.js';
import { isWalkable } from '../office/layout/tileMap.js';
import type { Character } from '../office/types.js';
import { CharacterState, Direction } from '../office/types.js';
import { conversar, turnosDe } from './burbujas.js';
import { calcularLuces, type EstadoLuz, setLuces, setSalasPrendidas } from './luces.js';
import {
  actividadDe,
  elegirPunto,
  type Lugar,
  lugarDeMueble,
  type Punto,
  puntosDeAsientos,
  puntosDeLugares,
  puntosDePiso,
  puntosDePresentacion,
} from './lugares.js';
import {
  deployDe,
  dormidoDe,
  enUso,
  padreDe,
  podarPersonal,
  presentandoDe,
  statusDe,
  vozDe,
} from './personal.js';
import { marcoPizarra, setGentePizarra } from './pizarra.js';
import {
  DURACION_PROYECTO_MS,
  ESPERA_LLEGADA_MS,
  limpiarReuniones,
  reunionDe,
  reunionesActivas,
  reunir,
  sesionesQueSeCruzan,
} from './reuniones.js';
import { publicarMarvelActivos } from './skins.js';

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
  const deLugares = puntosDeLugares(
    { furniture: layout.furniture, cols: layout.cols, areaTiles: layout.areaTiles },
    (tipo) => {
      const e = getCatalogEntry(tipo);
      return e ? { w: e.footprintW, h: e.footprintH } : undefined;
    },
    (col, row) => isWalkable(col, row, os.tileMap, os.blockedTiles),
  );
  const p = [
    ...deLugares,
    ...puntosDePresentacion(
      { cols: layout.cols, areaTiles: layout.areaTiles },
      (col, row) => isWalkable(col, row, os.tileMap, os.blockedTiles),
      puntosDeAsientos(asientos, SALA_PRESENTACIONES, 'presentacion'),
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

/**
 * El "escritorio" de cada sub-agente: un escritorio libre de la oficina del que lo lanzó, el más cercano a él. Libre =
 * sin dueño o con su dueño descansando en la cafetería (en una oficina con varias sesiones todos los escritorios tienen
 * dueño, aunque estén vacíos); los sin dueño se eligen antes. Si no queda ninguno, el piso libre más cercano a su silla,
 * sin pegarse a otro sub-agente (al menos un tile de por medio, para que no se pisen ni sus etiquetas).
 * tickPersonal lo revisa: si vuelve el dueño del escritorio prestado, o si quedó en el piso, lo vuelve a calcular.
 */
interface Base {
  col: number;
  row: number;
  facingDir?: Direction;
  sentado?: boolean;
  silla?: string; // uid de la silla que tomó prestada
  hecho: number; // cuándo se calculó (ms)
}
const bases = new Map<number, Base>();

/** Cada cuánto se reintenta un escritorio para un sub-agente que quedó en el piso. */
export const REINTENTO_BASE_MS = 5000;

/** El dueño de esa silla la está usando o va a volver a usarla (no está descansando en la cafetería). */
function duenoLaQuiere(os: OfficeState, silla: string): boolean {
  for (const c of os.characters.values()) {
    if (c.seatId === silla && !c.isSubagent) return c.lugar !== 'cafeteria';
  }
  return false;
}

export function baseDe(os: OfficeState, sub: Character, ahora = Date.now()): Base {
  const padre = sub.parentAgentId !== null ? os.characters.get(sub.parentAgentId) : undefined;
  const silla = padre?.seatId ? os.seats.get(padre.seatId) : undefined;
  if (!padre?.seatId || !silla) return { col: sub.tileCol, row: sub.tileRow, hecho: ahora };
  const oficina = os.seatZone(padre.seatId);
  if (oficina) {
    const prestadas = new Set<string>();
    for (const [id, b] of bases) if (b.silla && id !== sub.id) prestadas.add(b.silla);
    const duenos = new Map<string, Character>();
    for (const c of os.characters.values()) if (c.seatId && !c.isSubagent) duenos.set(c.seatId, c);
    let libre: [string, typeof silla] | null = null;
    let clave = Infinity;
    for (const [uid, s] of os.seats) {
      if (uid === padre.seatId || prestadas.has(uid) || os.seatZone(uid) !== oficina) continue;
      const dueno = duenos.get(uid);
      if (dueno ? dueno.lugar !== 'cafeteria' : s.assigned) continue;
      const d = Math.abs(s.seatCol - silla.seatCol) + Math.abs(s.seatRow - silla.seatRow);
      const k = (dueno ? 1000 : 0) + d;
      if (k < clave) {
        clave = k;
        libre = [uid, s];
      }
    }
    if (libre) {
      const [uid, s] = libre;
      return {
        col: s.seatCol,
        row: s.seatRow,
        facingDir: s.facingDir,
        sentado: true,
        silla: uid,
        hecho: ahora,
      };
    }
  }
  const otras = [...bases.values()];
  const pegado = (t: { col: number; row: number }) =>
    otras.some((b) => Math.max(Math.abs(b.col - t.col), Math.abs(b.row - t.row)) < 2);
  let mejor: Base = { col: sub.tileCol, row: sub.tileRow, hecho: ahora };
  let dist = Infinity;
  for (const t of os.walkableTiles) {
    if (pegado(t)) continue;
    const d = Math.abs(t.col - silla.seatCol) + Math.abs(t.row - silla.seatRow);
    if (d > 0 && d < dist) {
      dist = d;
      mejor = { col: t.col, row: t.row, hecho: ahora };
    }
  }
  return mejor;
}

/** Hay que volver a calcular el lugar del sub-agente: volvió el dueño del escritorio prestado, o quedó en el piso. */
function revisarBase(os: OfficeState, b: Base, ahora: number): boolean {
  if (b.silla) return duenoLaQuiere(os, b.silla);
  return ahora - b.hecho >= REINTENTO_BASE_MS;
}

/** Solo para tests. */
export function _reiniciarBases(): void {
  bases.clear();
}

function alEscritorio(ch: Character): void {
  ch.lugar = undefined;
  ch.lugarDesde = undefined;
  const b = ch.isSubagent ? bases.get(ch.id) : undefined;
  ch.destino = b
    ? {
        seatCol: b.col,
        seatRow: b.row,
        facingDir: b.facingDir ?? ch.dir ?? Direction.DOWN,
        sentado: b.sentado === true,
      }
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
  const p = elegirPunto(puntos(os), lugar, desde, ocupadosPara(os, ch), lugar === 'cafeteria');
  ch.destino = p
    ? {
        seatCol: p.col,
        seatRow: p.row,
        facingDir: p.facingDir,
        sentado: p.sentado === true,
        descanso: lugar === 'cafeteria',
      }
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
    if (ch.isSubagent || !enUso(ch, ahora) || ch.matrixEffect || dormidoDe(ch.id, ahora)) continue;
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

/** Cada cuánto se podan los mapas de personajes que ya no están (personal.ts). */
const PODA_MS = 30_000;
let ultimaPoda = 0;

export function tickPersonal(os: OfficeState, ahora = Date.now()): void {
  tickReuniones(os, ahora);
  publicarMarvelActivos(os.characters.values(), ahora);
  if (ahora - ultimaPoda > PODA_MS) {
    ultimaPoda = ahora;
    podarPersonal((id) => os.characters.has(id), ahora);
  }
  for (const id of bases.keys()) if (!os.characters.has(id)) bases.delete(id);
  for (const ch of os.characters.values()) {
    if (ch.matrixEffect) continue;
    if (ch.isSubagent) {
      const b = bases.get(ch.id);
      if (!b) bases.set(ch.id, baseDe(os, ch, ahora));
      else if (revisarBase(os, b, ahora)) {
        const nueva = baseDe(os, ch, ahora);
        const cambio = nueva.col !== b.col || nueva.row !== b.row;
        bases.set(ch.id, nueva);
        if (cambio && !ch.lugar) alEscritorio(ch); // está en su escritorio: que se mude ya
      }
    }

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

    // 3. Presentando: se acaba de decir su aviso por voz.
    if (!ch.isSubagent && presentandoDe(ch.id, ahora)) {
      if (ch.lugar !== 'presentacion') ir(os, ch, 'presentacion', ahora);
      continue;
    }
    if (ch.lugar === 'presentacion') alEscritorio(ch); // terminó de presentar

    // 3b. Reunión.
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

    // 4. Sin uso (terminó el turno, o restaurada al abrir la página sin nada en curso): a la cafetería.
    if (!enUso(ch, ahora)) {
      if (ch.isSubagent) {
        if (ch.lugar !== undefined) alEscritorio(ch);
        continue;
      }
      if (ch.lugar !== 'cafeteria') ir(os, ch, 'cafeteria', ahora);
      continue;
    }

    // 5. Trabajando.
    if (ch.lugar === 'cafeteria') alEscritorio(ch); // se puso a trabajar: vuelve ya, sin esperar
    if (ch.isSubagent && !ch.destino && !ch.lugar) alEscritorio(ch); // a su lugar al lado del padre, no apilado
    moverSegunActividad(os, ch, ahora);
  }
  tickLuces(os, ahora);
}

// ── Luces ───────────────────────────────────────────────────────

let pantallasCache: {
  furniture: unknown;
  pantallas: Array<{ col: number; row: number; w: number; h: number }>;
} | null = null;

/** Pizarrones/pantallas de Presentaciones (se encienden mientras alguien presenta). */
function pantallas(os: OfficeState): Array<{ col: number; row: number; w: number; h: number }> {
  const layout = os.getLayout();
  if (pantallasCache?.furniture === layout.furniture) return pantallasCache.pantallas;
  const out: Array<{ col: number; row: number; w: number; h: number }> = [];
  for (const f of layout.furniture) {
    if (lugarDeMueble(f.type) !== 'pizarron') continue;
    const e = getCatalogEntry(f.type);
    const w = e?.footprintW ?? 1;
    const h = e?.footprintH ?? 1;
    // El mueble cuenta para la sala del tile de abajo (los de pared están en la fila de la pared).
    const sala =
      layout.areaTiles?.[(f.row + h) * layout.cols + f.col] ??
      layout.areaTiles?.[f.row * layout.cols + f.col];
    if (sala === SALA_PRESENTACIONES) out.push({ col: f.col, row: f.row, w, h });
  }
  pantallasCache = { furniture: layout.furniture, pantallas: out };
  return out;
}

/**
 * Salas con alguien trabajando ahora (de noche quedan iluminadas): la sala del tile donde está cada agente en uso, salvo
 * los que descansan en la cafetería o duermen sin tokens.
 */
export function salasConGente(os: OfficeState, ahora: number): Set<string> {
  const layout = os.getLayout();
  const salas = new Set<string>();
  for (const ch of os.characters.values()) {
    if (ch.matrixEffect === 'despawn' || ch.lugar === 'cafeteria') continue;
    if (!enUso(ch, ahora) || dormidoDe(ch.id, ahora)) continue;
    const sala = layout.areaTiles?.[ch.tileRow * layout.cols + ch.tileCol];
    if (sala) salas.add(sala);
  }
  return salas;
}

/** Para la pizarra del Brain: los agentes (sesiones) de cada proyecto que están trabajando ahora. */
export function gentePorProyecto(os: OfficeState, ahora: number): Map<string, number[]> {
  const gente = new Map<string, number[]>();
  for (const ch of os.characters.values()) {
    if (ch.isSubagent || ch.matrixEffect === 'despawn' || !ch.seatId) continue;
    if (!enUso(ch, ahora) || dormidoDe(ch.id, ahora) || ch.lugar === 'cafeteria') continue;
    const sala = os.seatZone(ch.seatId);
    if (sala) gente.set(sala, [...(gente.get(sala) ?? []), ch.id]);
  }
  for (const ids of gente.values()) ids.sort((a, b) => a - b);
  return gente;
}

function tickLuces(os: OfficeState, ahora: number): void {
  setSalasPrendidas(salasConGente(os, ahora));
  marcoPizarra(os.getLayout().furniture, (tipo) => {
    const e = getCatalogEntry(tipo);
    return e ? { w: e.footprintW, h: e.footprintH } : undefined;
  });
  setGentePizarra(gentePorProyecto(os, ahora));
  const estados: EstadoLuz[] = [];
  for (const ch of os.characters.values()) {
    if (ch.matrixEffect === 'despawn') continue;
    const padre = padreDe(ch.id);
    const jefe = padre !== null ? os.characters.get(padre) : ch;
    estados.push({
      sala: jefe?.seatId ? os.seatZone(jefe.seatId) : null,
      deploy: deployDe(ch.id, ahora),
      voz: vozDe(ch.id),
      presentando: presentandoDe(ch.id, ahora),
    });
  }
  setLuces(calcularLuces(estados), pantallas(os));
}
