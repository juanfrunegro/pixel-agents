/**
 * Personal (copia de juanfrunegro): nombres de fantasía, modelo y costo por agente, gafete de color por modelo y
 * datos de la ficha. Estado propio, fuera del código del original: él solo llama a alMensaje() y registrarSub().
 */
import { useSyncExternalStore } from 'react';

import { aspectoDePersona, personaDe } from '../../../core/src/aspectoPersonal.js';
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

/** Llamado al principio del manejador de mensajes del original. Limpia el status para que el original no vea la meta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function alMensaje(msg: any): void {
  if (msg && typeof msg.status === 'string' && msg.status.includes(SEPARADOR)) {
    const { texto, meta } = separarStatus(msg.status);
    msg.status = texto;
    if (meta && typeof msg.toolId === 'string') {
      estado.metaPorTool.set(msg.toolId, meta);
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
  } else if (msg?.type === 'subagentToolStart' && typeof msg.status === 'string') {
    for (const [subId, s] of estado.subs) {
      if (s.padre === msg.id && s.toolId === msg.parentToolId) estado.status.set(subId, msg.status);
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
    });
    avisar();
  } else if (msg?.type === 'agentClosed' && typeof msg.id === 'number') {
    // Una sesión cerrada ya no cuenta (por ejemplo, para el cupo de su cuenta).
    estado.info.delete(msg.id);
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

/** Nombre de fantasía: CEO para sesiones, el de nombres.json para agentes definidos, Marvel para descartables. */
export function nombreDe(charId: number): string {
  const s = estado.subs.get(charId);
  if (!s) return estado.nombres.ceo;
  const tipo = estado.metaPorTool.get(s.toolId)?.t;
  if (tipo && estado.nombres.agentes[tipo]) return estado.nombres.agentes[tipo];
  const lista = estado.nombres.descartables;
  return lista.length ? lista[hash(s.toolId) % lista.length] : tipo || 'Sub-agente';
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
/** Tiempo que el agente se queda presentando después de que se dijo el aviso por voz. */
export const PRESENTACION_MS = 60_000;

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

/** La sesión pidió el aviso por voz y todavía no se dijo. */
export function vozDe(charId: number): boolean {
  return !estado.subs.has(charId) && estado.info.get(charId)?.voz === true;
}

/** Se acaba de decir el aviso por voz de esta sesión: está presentando. */
export function presentandoDe(charId: number, ahora = Date.now()): boolean {
  if (estado.subs.has(charId)) return false;
  const p = estado.info.get(charId)?.presento;
  return typeof p === 'number' && ahora - p >= 0 && ahora - p < PRESENTACION_MS;
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
