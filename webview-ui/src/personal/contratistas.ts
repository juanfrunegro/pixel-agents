/**
 * Personal (copia de juanfrunegro): la cabina de Contratistas de la oficina por niveles. Codex, Pi, Antigravity y los
 * demás motores que no son Claude los ve Orca, no la oficina: el servidor manda la lista (mensaje `contratistas`,
 * server/src/personal/contratistas.ts) y acá se dibuja cada uno sentado en una silla de la cabina, con su persona de
 * nombres.json ("Tomo · Pi"), y un cartel arriba con el proyecto y el estado. No son personajes de la oficina: no
 * caminan, no se seleccionan y no entran en ningún otro cálculo; solo se suman a la lista que se dibuja (renderer.ts).
 */
import { aspectoDePersona, personaDe } from '../../../core/src/aspectoPersonal.js';
import { createCharacter } from '../office/engine/characters.js';
import type { Character, Seat } from '../office/types.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import {
  CARTEL_BORDE,
  CARTEL_FONDO,
  CARTEL_TEXTO,
  CONTRATISTA_ESPERA,
  CONTRATISTA_TRABAJA,
} from './colores.js';
import { nombres } from './personal.js';

export interface Contratista {
  motor: string;
  proyecto: string;
  workspace: string;
  estado: string;
  tarea: string | null;
  desde: number | null;
}

/** Ids de los personajes dibujados (lejos de los de las sesiones y de los sub-agentes). */
const ID_BASE = -900_000;
/** Cada cuánto cambia el cuadro de tipear de los que trabajan. */
const CUADRO_MS = 300;

let lista: Contratista[] = [];
let sillas: Array<[string, Seat]> = [];
let sillasDe: unknown = null;
const personajes = new Map<string, Character>();

/** Llamado con cada mensaje del servidor (useExtensionMessages). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function alMensajeContratistas(msg: any): void {
  if (msg?.type !== 'contratistas' || !Array.isArray(msg.lista)) return;
  lista = msg.lista as Contratista[];
}

export function contratistas(): Contratista[] {
  return lista;
}

/** Las sillas de la cabina (uid `contratistas-silla-*`, server/src/personal/oficina.ts), en orden. Desde ambiente.ts. */
export function setSillasContratistas(seats: Map<string, Seat>): void {
  if (sillasDe === seats) return;
  sillas = [...seats.entries()]
    .filter(([uid]) => uid.startsWith('contratistas-silla'))
    .sort(([, a], [, b]) => a.seatRow - b.seatRow || a.seatCol - b.seatCol);
  sillasDe = seats;
  personajes.clear();
}

/** Clave de nombres.json `externos` para un motor de Orca (Gemini corre como Antigravity). */
export function claveExterno(motor: string): string {
  return motor === 'gemini' ? 'antigravity' : motor;
}

/** "Tomo · Pi" (la persona y el motor, sin el modelo entre paréntesis), o el motor solo si no tiene nombre. */
export function nombreContratista(motor: string): string {
  const n = nombres().externos?.[claveExterno(motor)];
  if (!n) return motor.charAt(0).toUpperCase() + motor.slice(1);
  return n.replace(/\s*\(.*\)\s*$/, '');
}

const trabaja = (c: Contratista) => c.estado === 'working';
const espera = (c: Contratista) => /wait|block|permission|input/i.test(c.estado);

/** Los que entran en la cabina: los que trabajan o esperan primero; los terminados, si sobra lugar. */
function enCabina(): Array<{ c: Contratista; silla: Seat; resto: number }> {
  const orden = [...lista].sort(
    (a, b) => Number(trabaja(b) || espera(b)) - Number(trabaja(a) || espera(a)),
  );
  const n = Math.min(orden.length, sillas.length);
  return orden.slice(0, n).map((c, i) => ({
    c,
    silla: sillas[i][1],
    resto: i === n - 1 ? orden.length - n : 0,
  }));
}

/** Personajes para sumar a la escena: sentados de espaldas frente a su PC; tipean mientras Orca dice que trabajan. */
export function personajesContratistas(ahora = Date.now()): Character[] {
  if (lista.length === 0 || sillas.length === 0) return [];
  const out: Character[] = [];
  const vivos = new Set<string>();
  enCabina().forEach(({ c, silla }, i) => {
    const clave = `${c.motor}|${c.proyecto}|${c.workspace}|${i}`;
    vivos.add(clave);
    let ch = personajes.get(clave);
    if (!ch) {
      const n = nombres();
      const aspecto = aspectoDePersona(personaDe(nombreContratista(c.motor)), n.orden ?? [], 6);
      ch = createCharacter(
        ID_BASE - i,
        aspecto?.palette ?? i % 6,
        null,
        silla,
        aspecto?.hueShift ?? 0,
      );
      ch.state = CharacterState.TYPE;
      personajes.set(clave, ch);
    }
    ch.frame = trabaja(c) ? Math.floor(ahora / CUADRO_MS) % 2 : 0;
    out.push(ch);
  });
  for (const k of personajes.keys()) if (!vivos.has(k)) personajes.delete(k);
  return out;
}

/** El cartel de cada contratista, encima de su cabeza: quién es y, abajo, el proyecto y el estado. */
export function renderCartelesContratistas(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (lista.length === 0 || sillas.length === 0) return;
  const s = TILE_SIZE * zoom;
  const fuente = Math.max(Math.round(6 * zoom), 10);
  const chica = Math.max(Math.round(5 * zoom), 9);
  const borde = Math.max(1, Math.round(zoom / 2));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { c, silla, resto } of enCabina()) {
    const titulo = nombreContratista(c.motor) + (resto > 0 ? `  +${resto}` : '');
    const estado = trabaja(c) ? 'trabaja' : espera(c) ? 'espera' : 'terminó';
    const linea2 = `${c.proyecto} · ${estado}`;
    ctx.font = `${fuente}px 'FS Pixel Sans'`;
    const w1 = ctx.measureText(titulo).width;
    ctx.font = `${chica}px 'FS Pixel Sans'`;
    const w2 = ctx.measureText(linea2).width;
    const ancho = Math.round(Math.max(w1, w2) + fuente);
    const alto = Math.round(fuente * 1.3 + chica * 1.3);
    const cx = Math.round(offsetX + (silla.seatCol + 0.5) * s);
    // Arriba de la cabeza del sentado (el sprite mide dos tiles).
    const y = Math.round(offsetY + (silla.seatRow - 1.3) * s - alto);
    const x = Math.round(cx - ancho / 2);
    ctx.globalAlpha = trabaja(c) || espera(c) ? 0.95 : 0.55;
    ctx.fillStyle = CARTEL_FONDO;
    ctx.fillRect(x, y, ancho, alto);
    ctx.fillStyle = trabaja(c)
      ? CONTRATISTA_TRABAJA
      : espera(c)
        ? CONTRATISTA_ESPERA
        : CARTEL_BORDE;
    ctx.fillRect(x, y, borde * 2, alto);
    ctx.fillStyle = CARTEL_TEXTO;
    ctx.font = `${fuente}px 'FS Pixel Sans'`;
    ctx.fillText(titulo, cx, y + fuente * 0.7);
    ctx.font = `${chica}px 'FS Pixel Sans'`;
    ctx.globalAlpha *= 0.8;
    ctx.fillText(linea2, cx, y + fuente * 1.3 + chica * 0.65);
  }
  ctx.restore();
}

/** Solo para tests. */
export function _reiniciarContratistas(): void {
  lista = [];
  sillas = [];
  sillasDe = null;
  personajes.clear();
}
