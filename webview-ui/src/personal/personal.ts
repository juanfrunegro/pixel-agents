/**
 * Personal (copia de juanfrunegro): nombres de fantasía, modelo y costo por agente, gafete de color por modelo y
 * datos de la ficha. Estado propio, fuera del código del original: él solo llama a alMensaje() y registrarSub().
 */
import { useSyncExternalStore } from 'react';

import { COLOR_FABLE, COLOR_HAIKU, COLOR_OPUS, COLOR_SIN_MODELO, COLOR_SONNET } from './colores.js';

export interface Nombres {
  ceo: string;
  agentes: Record<string, string>;
  descartables: string[];
}

export interface MetaSub {
  t: string; // tipo interno (subagent_type)
  m: string; // modelo pedido o de su definición ('hereda' = el del padre)
  e: string | null; // esfuerzo de su definición
}

interface Estado {
  nombres: Nombres;
  info: Map<number, { model?: string; costUsd?: number }>;
  metaPorTool: Map<string, MetaSub>;
  subs: Map<number, { padre: number; toolId: string }>;
  inicio: Map<number, number>;
  version: number;
}

const SEPARADOR = '⁣';

const estado: Estado = {
  nombres: { ceo: 'CEO', agentes: {}, descartables: [] },
  info: new Map(),
  metaPorTool: new Map(),
  subs: new Map(),
  inicio: new Map(),
  version: 0,
};

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
  if (msg?.type === 'agentNamesLoaded') {
    estado.nombres = {
      ceo: msg.ceo,
      agentes: msg.agentes ?? {},
      descartables: msg.descartables ?? [],
    };
    avisar();
  } else if (msg?.type === 'agentInfo') {
    estado.info.set(msg.id, { model: msg.model, costUsd: msg.costUsd });
    avisar();
  } else if (msg?.type === 'agentCreated' || msg?.type === 'existingAgents') {
    const ids: number[] = msg.type === 'agentCreated' ? [msg.id] : (msg.agents ?? []);
    for (const id of ids) if (!estado.inicio.has(id)) estado.inicio.set(id, Date.now());
  }
}

/** Llamado cuando el original crea el personaje de un sub-agente. */
export function registrarSub(subId: number, padre: number, toolId: string): void {
  estado.subs.set(subId, { padre, toolId });
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
