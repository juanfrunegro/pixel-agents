/**
 * Personal (copia de juanfrunegro): nombres de fantasía, modelo y costo por agente, gafete de color por modelo y
 * datos de la ficha. Estado propio, fuera del código del original: él solo llama a alMensaje() y registrarSub().
 */
import { useSyncExternalStore } from 'react';

import { aspectoDePersona, personaDe } from '../../../core/src/aspectoPersonal.js';
import { NOMBRES_CON_SKIN } from '../../../core/src/skinsMarvel.js';
import { COLOR_FABLE, COLOR_HAIKU, COLOR_OPUS, COLOR_SIN_MODELO, COLOR_SONNET } from './colores.js';

export interface Nombres {
  ceo: string;
  agentes: Record<string, string>;
  descartables: string[];
  orden?: string[]; // personas del organigrama, en orden: fija el personaje de cada una
}

export interface MetaSub {
  t: string; // tipo interno (subagent_type)
  m: string; // modelo pedido o de su definición ('hereda' = el del padre)
  e: string | null; // esfuerzo de su definición
}

interface Estado {
  nombres: Nombres;
  info: Map<
    number,
    {
      model?: string;
      costUsd?: number;
      dormidoHasta?: number | null;
      wsl?: boolean;
      errores?: number;
      ultimoError?: number | null;
      deployDesde?: number | null;
      voz?: boolean;
      presento?: number | null;
      /** Cuánto dura ese aviso (ms, lo estima el hook); null = no se sabe (PRESENTACION_MS). */
      presentaMs?: number | null;
      /** Interruptor puesto desde Pixel (tanda 5): on/off, o null = seguir al prompt. */
      vozOverride?: 'on' | 'off' | null;
      /** Va a avisar por voz al terminar el turno (el interruptor manda sobre el prompt). */
      vozActiva?: boolean;
    }
  >;
  metaPorTool: Map<string, MetaSub>;
  subs: Map<number, { padre: number; toolId: string }>;
  inicio: Map<number, number>;
  status: Map<number, string>;
  /** Último mensaje de trabajo de cada sesión (herramienta, permiso, "active"), en ms. */
  actividad: Map<number, number>;
  version: number;
}

const SEPARADOR = '⁣';

const estado: Estado = {
  nombres: { ceo: 'CEO', agentes: {}, descartables: [] },
  info: new Map(),
  metaPorTool: new Map(),
  subs: new Map(),
  inicio: new Map(),
  status: new Map(),
  actividad: new Map(),
  version: 0,
};

/** Mensajes que dicen "esta sesión está trabajando". */
const DE_TRABAJO = new Set([
  'agentToolStart',
  'agentToolDone',
  'agentToolPermission',
  'subagentToolStart',
  'subagentToolDone',
  'subagentToolPermission',
]);
/**
 * Sin herramienta ni mensaje de trabajo por este tiempo, una sesión cuenta como sin uso aunque el servidor no haya dicho
 * que terminó (al abrir la página, las sesiones restauradas llegan "activas" sin nada en curso).
 */
export const SIN_USO_MS = 120_000;

const oyentes = new Set<() => void>();
function avisar(): void {
  estado.version++;
  oyentes.forEach((f) => f());
}

/** Separa "Subtask: objetivo⁣{json}" en texto visible y meta del sub-agente. */
export function separarStatus(status: string): { texto: string; meta: MetaSub | null } {
  const i = status.indexOf(SEPARADOR);
  if (i < 0) return { texto: status, meta: null };
  try {
    return { texto: status.slice(0, i), meta: JSON.parse(status.slice(i + 1)) as MetaSub };
  } catch {
    return { texto: status.slice(0, i), meta: null };
  }
}

/** Primer status de un sub-agente que todavía no estaba registrado (clave padre|toolId); registrarSub lo aplica. */
const statusPendiente = new Map<string, string>();

/** Llamado al principio del manejador de mensajes del original. Limpia el status para que el original no vea la meta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function alMensaje(msg: any): void {
  if (msg && typeof msg.status === 'string' && msg.status.includes(SEPARADOR)) {
    const { texto, meta } = separarStatus(msg.status);
    msg.status = texto;
    if (meta && typeof msg.toolId === 'string') {
      estado.metaPorTool.set(msg.toolId, meta);
      metaDesde.set(msg.toolId, Date.now());
      avisar();
    }
  }
  if (
    msg &&
    typeof msg.id === 'number' &&
    (DE_TRABAJO.has(msg.type) || (msg.type === 'agentStatus' && msg.status === 'active'))
  ) {
    estado.actividad.set(msg.id, Date.now());
  }
  // Texto de la herramienta en curso de cada personaje (para saber de qué se trata: lugares.ts).
  if (msg?.type === 'agentToolStart' && typeof msg.status === 'string') {
    estado.status.set(msg.id, msg.status);
    anotarHistorial(msg.id, msg.status);
  } else if (msg?.type === 'subagentToolStart' && typeof msg.status === 'string') {
    let encontrado = false;
    for (const [subId, s] of estado.subs) {
      if (s.padre === msg.id && s.toolId === msg.parentToolId) {
        estado.status.set(subId, msg.status);
        anotarHistorial(subId, msg.status);
        encontrado = true;
      }
    }
    // El sub se crea "lazy" justo después de este mensaje: guarda el status para que registrarSub lo aplique.
    if (!encontrado) {
      if (statusPendiente.size >= 50) statusPendiente.clear();
      statusPendiente.set(`${msg.id}|${msg.parentToolId}`, msg.status);
    }
  }
  if (msg?.type === 'agentNamesLoaded') {
    estado.nombres = {
      ceo: msg.ceo,
      agentes: msg.agentes ?? {},
      descartables: msg.descartables ?? [],
      orden: Array.isArray(msg.orden) ? msg.orden : [],
    };
    avisar();
  } else if (msg?.type === 'agentInfo') {
    estado.info.set(msg.id, {
      model: msg.model,
      costUsd: msg.costUsd,
      dormidoHasta: typeof msg.dormidoHasta === 'number' ? msg.dormidoHasta : null,
      wsl: msg.wsl === true,
      errores: typeof msg.errores === 'number' ? msg.errores : 0,
      ultimoError: typeof msg.ultimoError === 'number' ? msg.ultimoError : null,
      deployDesde: typeof msg.deployDesde === 'number' ? msg.deployDesde : null,
      voz: msg.voz === true,
      presento: typeof msg.presento === 'number' ? msg.presento : null,
      presentaMs: typeof msg.presentaMs === 'number' ? msg.presentaMs : null,
      vozOverride: msg.vozOverride === 'on' || msg.vozOverride === 'off' ? msg.vozOverride : null,
      vozActiva: typeof msg.vozActiva === 'boolean' ? msg.vozActiva : msg.voz === true,
    });
    avisar();
  } else if (msg?.type === 'agentClosed' && typeof msg.id === 'number') {
    // Una sesión cerrada ya no cuenta (por ejemplo, para el cupo de su cuenta).
    estado.info.delete(msg.id);
    olvidarPersonaje(msg.id);
    avisar();
  } else if (msg?.type === 'agentCreated' || msg?.type === 'existingAgents') {
    const ids: number[] = msg.type === 'agentCreated' ? [msg.id] : (msg.agents ?? []);
    for (const id of ids) if (!estado.inicio.has(id)) estado.inicio.set(id, Date.now());
  }
}

/**
 * Llamado cuando el original crea el personaje de un sub-agente. Si es un agente con nombre (Pepe, Jere…) le pone el
 * personaje fijo de su persona, el mismo del organigrama, en vez del de su padre.
 */
export function registrarSub(
  subId: number,
  padre: number,
  toolId: string,
  personaje?: { palette: number; hueShift: number },
  paletas = 6,
): void {
  estado.subs.set(subId, { padre, toolId });
  const pendiente = statusPendiente.get(`${padre}|${toolId}`);
  if (pendiente !== undefined) {
    statusPendiente.delete(`${padre}|${toolId}`);
    estado.status.set(subId, pendiente);
    anotarHistorial(subId, pendiente);
  }
  const tipo = estado.metaPorTool.get(toolId)?.t;
  const nombre = tipo ? estado.nombres.agentes[tipo] : undefined;
  const aspecto =
    nombre && aspectoDePersona(personaDe(nombre), estado.nombres.orden ?? [], paletas);
  if (personaje && aspecto) {
    personaje.palette = aspecto.palette;
    personaje.hueShift = aspecto.hueShift;
  }
  if (!estado.inicio.has(subId)) estado.inicio.set(subId, Date.now());
  avisar();
}

// ── Historial reciente de cada personaje (lo muestra la ficha) ──

export interface Paso {
  t: number;
  texto: string;
}
/** Cuántos pasos se guardan por personaje (los últimos). */
export const HISTORIAL_MAX = 12;
const historial = new Map<number, Paso[]>();
/** Nombre de cada agente descartable, fijado la primera vez que se pide (tanda 5: los que tienen skin, primero). */
const nombreDescartable = new Map<number, string>();

export function anotarHistorial(id: number, texto: string, ahora = Date.now()): void {
  const limpio = texto.trim();
  if (!limpio) return;
  const pasos = historial.get(id) ?? [];
  const ultimo = pasos[pasos.length - 1];
  if (ultimo && ultimo.texto === limpio) {
    ultimo.t = ahora; // la misma acción repetida no llena la lista
  } else {
    pasos.push({ t: ahora, texto: limpio });
    if (pasos.length > HISTORIAL_MAX) pasos.splice(0, pasos.length - HISTORIAL_MAX);
  }
  historial.set(id, pasos);
}

/** Últimos pasos, del más nuevo al más viejo. */
export function historialDe(id: number): Paso[] {
  return [...(historial.get(id) ?? [])].reverse();
}

/** Cuándo llegó la meta de cada herramienta (para podar las viejas). */
const metaDesde = new Map<string, number>();
/** Una meta sin sub-agente vivo que la use se descarta pasado este tiempo. */
export const META_VIGENCIA_MS = 30 * 60_000;

/** Ids que faltaban en la poda anterior. */
let faltabanAntes = new Set<number>();

function olvidarPersonaje(id: number): void {
  historial.delete(id);
  nombreDescartable.delete(id);
  estado.subs.delete(id);
  estado.status.delete(id);
  estado.actividad.delete(id);
  estado.inicio.delete(id);
}

/**
 * Los mapas por personaje y por herramienta crecían todo el día (cada sub-agente y cada lanzamiento dejaban su
 * entrada). Se llama cada tanto con los personajes vivos: borra lo de los que ya no están y las metas viejas que
 * ningún sub-agente usa. No toca `info` de las sesiones (eso lo limpia agentClosed).
 */
export function podarPersonal(vivo: (id: number) => boolean, ahora = Date.now()): void {
  // Un id se borra recién si faltaba también en la poda anterior: al abrir la página los mensajes de una sesión
  // pueden llegar antes que su personaje.
  const faltan = new Set<number>();
  const falta = (id: number) => !vivo(id) && !estado.info.has(id);
  for (const m of [
    estado.subs,
    estado.status,
    estado.actividad,
    estado.inicio,
    historial,
    nombreDescartable,
  ]) {
    for (const id of m.keys()) if (falta(id)) faltan.add(id);
  }
  for (const id of faltan) if (faltabanAntes.has(id)) olvidarPersonaje(id);
  faltabanAntes = faltan;
  const usadas = new Set([...estado.subs.values()].map((s) => s.toolId));
  for (const [toolId, t] of metaDesde) {
    if (!usadas.has(toolId) && ahora - t > META_VIGENCIA_MS) {
      metaDesde.delete(toolId);
      estado.metaPorTool.delete(toolId);
    }
  }
}

/** Solo para tests. */
export function _tamanosPersonal(): Record<string, number> {
  return {
    subs: estado.subs.size,
    status: estado.status.size,
    actividad: estado.actividad.size,
    inicio: estado.inicio.size,
    metaPorTool: estado.metaPorTool.size,
    historial: historial.size,
    nombres: nombreDescartable.size,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function metaDe(charId: number): MetaSub | null {
  const s = estado.subs.get(charId);
  return s ? (estado.metaPorTool.get(s.toolId) ?? null) : null;
}

export function padreDe(charId: number): number | null {
  return estado.subs.get(charId)?.padre ?? null;
}

/** Modelo con el que trabaja: el de la sesión (transcript) o el del sub-agente ('hereda' = el del padre). */
export function modeloDe(charId: number): string | undefined {
  const s = estado.subs.get(charId);
  if (!s) return estado.info.get(charId)?.model;
  const m = estado.metaPorTool.get(s.toolId)?.m;
  return !m || m === 'hereda' ? estado.info.get(s.padre)?.model : m;
}

/** Clave para renombrar: "ceo" o el tipo interno del sub-agente. */
export function claveDe(charId: number): string {
  return metaDe(charId)?.t ?? 'ceo';
}

/**
 * Nombre de un descartable: primero los cinco con skin de Marvel (Hulk, Spider-Man…) que estén en la lista y no los
 * tenga ya otro descartable vivo; si están todos ocupados, uno de la lista según la herramienta, evitando repetir.
 */
export function elegirDescartable(lista: string[], usados: Set<string>, semilla: number): string {
  const conSkin = NOMBRES_CON_SKIN.find((n) => lista.includes(n) && !usados.has(n));
  if (conSkin) return conSkin;
  for (let k = 0; k < lista.length; k++) {
    const n = lista[(semilla + k) % lista.length];
    if (!usados.has(n)) return n;
  }
  return lista[semilla % lista.length];
}

/** Nombre de fantasía: CEO para sesiones, el de nombres.json para agentes definidos, Marvel para descartables. */
export function nombreDe(charId: number): string {
  const s = estado.subs.get(charId);
  if (!s) return estado.nombres.ceo;
  const tipo = estado.metaPorTool.get(s.toolId)?.t;
  if (tipo && estado.nombres.agentes[tipo]) return estado.nombres.agentes[tipo];
  const lista = estado.nombres.descartables;
  if (!lista.length) return tipo || 'Sub-agente';
  const ya = nombreDescartable.get(charId);
  if (ya) return ya;
  const usados = new Set<string>();
  for (const [id, n] of nombreDescartable) if (id !== charId && esDescartable(id)) usados.add(n);
  const n = elegirDescartable(lista, usados, hash(s.toolId));
  nombreDescartable.set(charId, n);
  return n;
}

export function esDescartable(charId: number): boolean {
  const tipo = metaDe(charId)?.t;
  return !!estado.subs.get(charId) && !(tipo && estado.nombres.agentes[tipo]);
}

export function costoDe(charId: number): number | undefined {
  return estado.subs.has(charId) ? undefined : estado.info.get(charId)?.costUsd;
}

/** Sesión (o sub-agente de una sesión) que se quedó sin tokens y todavía no le volvió la cuota. */
export function dormidoDe(charId: number, ahora = Date.now()): boolean {
  const s = estado.subs.get(charId);
  const hasta = estado.info.get(s ? s.padre : charId)?.dormidoHasta;
  if (hasta === null || hasta === undefined) return false;
  return hasta === 0 || ahora < hasta * 1000;
}

export type Cuenta = 'windows' | 'wsl';

/**
 * Cupo de cada cuenta (Windows = Pro, WSL = Max). Claude Code no dice cuánto queda: solo avisa cuando ya se acabó
 * (rate_limit con la hora de vuelta). Así que solo hay dos estados: OK, o sin cupo (alguna sesión de esa cuenta está
 * dormida) hasta la hora de vuelta más tardía que se conozca (null = no se sabe).
 */
export function cupoPorCuenta(
  ahora = Date.now(),
): Record<Cuenta, { sinCupo: boolean; hasta: number | null }> {
  const r: Record<Cuenta, { sinCupo: boolean; hasta: number | null }> = {
    windows: { sinCupo: false, hasta: null },
    wsl: { sinCupo: false, hasta: null },
  };
  for (const [id, info] of estado.info) {
    if (estado.subs.has(id)) continue;
    const h = info.dormidoHasta;
    if (h === null || h === undefined || (h !== 0 && ahora >= h * 1000)) continue;
    const c = r[info.wsl ? 'wsl' : 'windows'];
    c.sinCupo = true;
    if (h !== 0) c.hasta = Math.max(c.hasta ?? 0, h * 1000);
  }
  return r;
}

/** Texto del cupo de una cuenta: "OK" o "sin cupo hasta HH:MM" (hora local). */
export function textoCupo(c: { sinCupo: boolean; hasta: number | null }): string {
  if (!c.sinCupo) return 'OK';
  if (!c.hasta) return 'sin cupo';
  const d = new Date(c.hasta);
  return `sin cupo hasta ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Hora (local) en que vuelve la cuota, o null si no se sabe. */
export function despiertaA(charId: number): Date | null {
  const s = estado.subs.get(charId);
  const hasta = estado.info.get(s ? s.padre : charId)?.dormidoHasta;
  return hasta ? new Date(hasta * 1000) : null;
}

// ── Señales (tanda 2): humo, deploy y aviso por voz. El servidor las calcula (server/src/personal/senales.ts). ──

/** Errores de herramienta seguidos para mostrar humo (mismo valor que ERRORES_PARA_HUMO del servidor). */
export const ERRORES_PARA_HUMO = 3;
/** El humo se va solo si el último error tiene más de esto (una sesión vieja que quedó con errores). */
export const HUMO_VIGENTE_MS = 15 * 60_000;
/** Un deploy sin resultado se da por terminado (mismo valor que DEPLOY_MAX_MS del servidor). */
export const DEPLOY_MAX_MS = 20 * 60_000;
/** Cuánto está en el escenario un aviso sin duración (hook viejo); con duración, lo que dure el aviso. */
export const PRESENTACION_MS = 12_000;
/** Tope de un aviso en el escenario (una duración rara no lo deja arriba para siempre). */
export const PRESENTACION_MAX_MS = 90_000;
/** Un aviso que lleva esto esperando turno ya no se cuenta (la fila no crece con avisos viejos). */
const FILA_MAX_MS = 3 * 60_000;

function infoSesion(charId: number) {
  const s = estado.subs.get(charId);
  return estado.info.get(s ? s.padre : charId);
}

/** Errores repetidos: humo sobre la cabeza hasta que una herramienta salga bien. Solo la sesión, no sus sub-agentes. */
export function humoDe(charId: number, ahora = Date.now()): boolean {
  if (estado.subs.has(charId)) return false;
  const i = estado.info.get(charId);
  if (!i || (i.errores ?? 0) < ERRORES_PARA_HUMO || !i.ultimoError) return false;
  return ahora - i.ultimoError < HUMO_VIGENTE_MS;
}

/** La sesión (o la de su padre) está deployando. */
export function deployDe(charId: number, ahora = Date.now()): boolean {
  const d = infoSesion(charId)?.deployDesde;
  return typeof d === 'number' && ahora - d < DEPLOY_MAX_MS;
}

/**
 * La sesión va a avisar por voz al terminar el turno: lo pidió en el prompt y no lo apagaste, o lo prendiste vos desde
 * la sala de comunicaciones o la ficha (tanda 5: el interruptor manda sobre el prompt).
 */
export function vozDe(charId: number): boolean {
  if (estado.subs.has(charId)) return false;
  const i = estado.info.get(charId);
  return i?.vozActiva ?? i?.voz === true;
}

/** La sesión pidió el aviso por voz en el prompt (marca del hook), sin mirar el interruptor. */
export function vozPedidaDe(charId: number): boolean {
  return !estado.subs.has(charId) && estado.info.get(charId)?.voz === true;
}

/** Interruptor puesto desde Pixel para esta sesión, o null si sigue al prompt. */
export function vozOverrideDe(charId: number): 'on' | 'off' | null {
  if (estado.subs.has(charId)) return null;
  return estado.info.get(charId)?.vozOverride ?? null;
}

/**
 * Turnos del escenario de Presentaciones: uno por vez, en orden de llegada. Cada aviso sube cuando le toca y se queda lo
 * que dura (presentaMs, o PRESENTACION_MS si no se sabe); los que llegaron después esperan en la fila.
 */
export function turnosEscenario(
  avisos: Array<{ id: number; desde: number; ms: number | null }>,
  ahora: number,
): Map<number, 'escenario' | 'fila'> {
  const turnos = new Map<number, 'escenario' | 'fila'>();
  let libreDesde = -Infinity;
  for (const a of [...avisos].sort((x, y) => x.desde - y.desde || x.id - y.id)) {
    if (a.desde > ahora) continue;
    const inicio = Math.max(a.desde, libreDesde);
    const fin = inicio + Math.min(a.ms ?? PRESENTACION_MS, PRESENTACION_MAX_MS);
    libreDesde = fin;
    if (ahora >= fin) continue;
    if (ahora >= inicio) turnos.set(a.id, 'escenario');
    else if (ahora - a.desde < FILA_MAX_MS) turnos.set(a.id, 'fila');
  }
  return turnos;
}

let turnosCache: {
  ahora: number;
  version: number;
  turnos: Map<number, 'escenario' | 'fila'>;
} | null = null;
/** Personajes que están en la oficina (lo pone tickPersonal en cada cuadro): solo ellos ocupan el escenario. */
let presentes: Set<number> | null = null;
let versionPresentes = 0;

export function setPresentes(ids: Iterable<number>): void {
  const nuevos = new Set(ids);
  if (presentes && nuevos.size === presentes.size && [...nuevos].every((id) => presentes!.has(id)))
    return;
  presentes = nuevos;
  versionPresentes++;
}

function turnosAhora(ahora: number): Map<number, 'escenario' | 'fila'> {
  const v = estado.version * 1e6 + versionPresentes;
  if (turnosCache && turnosCache.ahora === ahora && turnosCache.version === v)
    return turnosCache.turnos;
  const avisos: Array<{ id: number; desde: number; ms: number | null }> = [];
  for (const [id, i] of estado.info) {
    if (estado.subs.has(id) || typeof i.presento !== 'number') continue;
    if (presentes && !presentes.has(id)) continue;
    if (ahora - i.presento > FILA_MAX_MS + PRESENTACION_MAX_MS) continue;
    avisos.push({ id, desde: i.presento, ms: i.presentaMs ?? null });
  }
  const turnos = turnosEscenario(avisos, ahora);
  turnosCache = { ahora, version: v, turnos };
  return turnos;
}

/** Está en el escenario de Presentaciones: es su turno de decir el aviso por voz. */
export function presentandoDe(charId: number, ahora = Date.now()): boolean {
  if (estado.subs.has(charId)) return false;
  return turnosAhora(ahora).get(charId) === 'escenario';
}

/** Dijo su aviso pero otro está en el escenario: espera su turno sentado en la fila. */
export function enFilaDe(charId: number, ahora = Date.now()): boolean {
  if (estado.subs.has(charId)) return false;
  return turnosAhora(ahora).get(charId) === 'fila';
}

/** Sesión de WSL (otra cuenta): sus sub-agentes también. */
export function esWsl(charId: number): boolean {
  const s = estado.subs.get(charId);
  return estado.info.get(s ? s.padre : charId)?.wsl === true;
}

/**
 * La sesión está en uso: activa y con una herramienta en curso o con trabajo hace menos de SIN_USO_MS. Los
 * sub-agentes, mientras existan y estén activos.
 */
export function enUso(
  ch: { id: number; isActive: boolean; isSubagent: boolean; currentTool: string | null },
  ahora = Date.now(),
): boolean {
  if (!ch.isActive) return false;
  if (ch.isSubagent || ch.currentTool) return true;
  const t = estado.actividad.get(ch.id);
  return t !== undefined && ahora - t < SIN_USO_MS;
}

/** Texto de la última herramienta que arrancó ("Editing cobros.ts"…). */
export function statusDe(charId: number): string | undefined {
  return estado.status.get(charId);
}

export function inicioDe(charId: number): number | undefined {
  return estado.inicio.get(charId);
}

/** "claude-opus-5-5" → "Opus 5.5"; "sonnet" → "Sonnet". */
export function etiquetaModelo(m: string | undefined): string {
  if (!m) return 'sin datos todavía';
  const x = /(opus|sonnet|haiku|fable|mythos)(?:-(\d+)(?:-(\d+))?)?/i.exec(m);
  if (!x) return m;
  const nombre = x[1][0].toUpperCase() + x[1].slice(1).toLowerCase();
  return x[2] && x[2].length < 3
    ? `${nombre} ${x[2]}${x[3] && x[3].length < 3 ? '.' + x[3] : ''}`
    : nombre;
}

/** Color del gafete por modelo (mismos colores que el organigrama). */
export function colorModelo(m: string | undefined): string {
  const x = (m || '').toLowerCase();
  if (x.includes('opus')) return COLOR_OPUS;
  if (x.includes('sonnet')) return COLOR_SONNET;
  if (x.includes('fable') || x.includes('mythos')) return COLOR_FABLE;
  if (x.includes('haiku')) return COLOR_HAIKU;
  return COLOR_SIN_MODELO;
}

export function nombres(): Nombres {
  return estado.nombres;
}

/** Re-render de React cuando cambia algo de este módulo. */
export function usePersonal(): number {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estado.version,
  );
}
