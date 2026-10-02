/**
 * Personal (copia de juanfrunegro): nombres de fantasía, definición de cada agente (modelo/esfuerzo) y costo por
 * sesión. Todo lo propio vive acá para que sumar novedades del original choque lo menos posible: el resto del código
 * solo tiene llamadas de una línea a este módulo.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { personaDe } from '../../../core/src/aspectoPersonal.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { AgentState } from '../types.js';

// Rutas calculadas al usarlas (no al importar): los tests del original simulan os.homedir().
const claude = (): string => path.join(os.homedir() || '.', '.claude');
const rutaNombres = (): string => path.join(claude(), 'agents', 'nombres.json');

/** Separador invisible: el status de un sub-agente lleva `⁣{json}` con su tipo/modelo/esfuerzo. */
export const SEPARADOR_META = '⁣';

export interface Nombres {
  ceo: string;
  agentes: Record<string, string>;
  descartables: string[];
  roles?: Record<string, string>;
  [k: string]: unknown;
}

export function leerNombres(): Nombres {
  try {
    const j = JSON.parse(fs.readFileSync(rutaNombres(), 'utf8')) as Partial<Nombres>;
    return {
      ...j,
      ceo: typeof j.ceo === 'string' ? j.ceo : 'CEO',
      agentes: j.agentes && typeof j.agentes === 'object' ? j.agentes : {},
      descartables: Array.isArray(j.descartables) ? j.descartables : [],
    } as Nombres;
  } catch {
    return { ceo: 'CEO', agentes: {}, descartables: [] };
  }
}

/** Guarda un nombre ("ceo" = sesión principal). Nombre vacío = vuelve al nombre por defecto. */
export function guardarNombre(clave: string, nombre: string): Nombres {
  const n = leerNombres();
  const limpio = nombre.trim().slice(0, 60);
  if (clave === 'ceo') {
    n.ceo = limpio || 'CEO';
  } else if (limpio) {
    n.agentes[clave] = limpio;
  } else {
    delete n.agentes[clave];
  }
  const tmp = rutaNombres() + '.tmp';
  fs.mkdirSync(path.dirname(rutaNombres()), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(n, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, rutaNombres());
  return n;
}

/** Personas del organigrama en orden (el CEO primero): fija el personaje de cada una (core/src/aspectoPersonal). */
export function ordenPersonas(n: Nombres = leerNombres()): string[] {
  return [...new Set([personaDe(n.ceo), ...Object.keys(n.roles ?? {})])];
}

export function mensajeNombres(n: Nombres = leerNombres()): Record<string, unknown> {
  return {
    type: 'agentNamesLoaded',
    ceo: n.ceo,
    agentes: n.agentes,
    descartables: n.descartables,
    orden: ordenPersonas(n),
  };
}

// ── Proyecto de cada agente (áreas de la oficina) y sesiones de WSL ──────────

/** Reglas carpeta → proyecto. Sirve para la ruta real (cwd) y para la codificada de ~/.claude/projects. */
const PROYECTOS: Array<[RegExp, string]> = [
  [/documents-chaina/, 'Chaina'],
  [/poker-app/, 'Poker'],
  [/finanzas-personales/, 'Finanzas'],
  [/projects-erp/, 'ERP'],
  [/analisis-qf/, 'QF'],
  [/pixel-agents/, 'Pixel'],
  [/claude-brain|-claude$/, 'Brain'],
  [/(^|-)ev(-|$)/, 'Pruebas'],
];

/** Nombres que devuelven las reglas fijas (para mandar a "Otros" los que no tienen sala propia). */
export const PROYECTOS_CONOCIDOS = [...new Set(PROYECTOS.map(([, p]) => p))];

export const normalizarCarpeta = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Reglas de los proyectos de Orca que no están en PROYECTOS (oficina.ts las carga al arrancar y al recargar). */
let reglasExtra: Array<[RegExp, string]> = [];
export function setReglasExtra(reglas: Array<[string, string]>): void {
  // Las claves vienen de normalizarCarpeta: solo [a-z0-9-], no hace falta escaparlas.
  reglasExtra = reglas.map(([clave, nombre]) => [new RegExp(`(^|-)${clave}(-|$)`), nombre]);
}

/** Resolver de carpeta para las Áreas: un agente en un workspace de Orca o en WSL cae en el área de su proyecto. */
export function proyectoDe(
  ctx: { cwd?: string; projectDir?: string },
  conExtra = true,
): string | undefined {
  const reglas = conExtra ? [...PROYECTOS, ...reglasExtra] : PROYECTOS;
  for (const fuente of [ctx.cwd, ctx.projectDir ? path.basename(ctx.projectDir) : undefined]) {
    if (!fuente) continue;
    const s = normalizarCarpeta(fuente);
    const hit = reglas.find(([re]) => re.test(s));
    if (hit) return hit[1];
  }
  return undefined;
}

/** Sesiones de Claude Code en WSL, leídas desde Windows: así una sola oficina muestra Windows y WSL. */
export function raicesWsl(): string[] {
  if (process.platform !== 'win32') return [];
  const raiz =
    process.env.PIXEL_WSL_PROJECTS ?? '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\.claude\\projects';
  try {
    return fs.existsSync(raiz) ? [raiz] : [];
  } catch {
    return [];
  }
}

// ── Definición de cada agente (frontmatter de su .md) ─────────────────────────

export interface Definicion {
  modelo?: string;
  esfuerzo?: string;
  descripcion?: string;
  archivo: string;
  proyecto: string;
}

let indice: Map<string, Definicion> | null = null;
let indiceHecho = 0;

/** Dónde viven los agentes: globales, de proyecto (agents-proyectos/<p>) y los de cada repo de IA Tools. */
export function carpetasDeAgentes(): Array<{ dir: string; proyecto: string }> {
  const dirs = [{ dir: path.join(claude(), 'agents'), proyecto: 'Todos' }];
  const sub = (base: string, conAgents: boolean, nombre: (d: string) => string) => {
    try {
      for (const d of fs.readdirSync(base)) {
        dirs.push({
          dir: conAgents ? path.join(base, d, '.claude', 'agents') : path.join(base, d),
          proyecto: nombre(d),
        });
      }
    } catch {
      /* no existe */
    }
  };
  sub(path.join(claude(), 'agents-proyectos'), false, (d) =>
    d === 'erp' ? 'ERP' : d[0].toUpperCase() + d.slice(1),
  );
  sub(path.join(os.homedir() || '.', 'Documents', 'IA Tools'), true, (d) => d.replace(/_/g, ' '));
  return dirs;
}

function campo(frontmatter: string, nombre: string): string | undefined {
  const m = new RegExp(`^${nombre}:\\s*(.+?)\\s*$`, 'm').exec(frontmatter);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : undefined;
}

/** Índice name → definición, rehecho como mucho cada 30 s (se crean agentes nuevos). */
export function definiciones(): Map<string, Definicion> {
  if (indice && Date.now() - indiceHecho < 30_000) return indice;
  const nuevo = new Map<string, Definicion>();
  for (const { dir, proyecto } of carpetasDeAgentes()) {
    let archivos: string[] = [];
    try {
      archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of archivos) {
      try {
        const texto = fs.readFileSync(path.join(dir, f), 'utf8');
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto)?.[1];
        const nombre = fm && campo(fm, 'name');
        if (!nombre) continue;
        nuevo.set(nombre, {
          modelo: campo(fm, 'model'),
          esfuerzo: campo(fm, 'effort'),
          descripcion: campo(fm, 'description'),
          archivo: path.join(dir, f),
          proyecto,
        });
      } catch {
        /* archivo ilegible: se ignora */
      }
    }
  }
  indice = nuevo;
  indiceHecho = Date.now();
  return nuevo;
}

/** Sufijo que se agrega al status "Subtask: …" con el tipo, modelo y esfuerzo del sub-agente. */
export function metaDeSubagente(input: Record<string, unknown>): string {
  const tipo =
    typeof input.subagent_type === 'string' && input.subagent_type
      ? input.subagent_type
      : 'general-purpose';
  const def = definiciones().get(tipo);
  const modelo =
    typeof input.model === 'string' && input.model ? input.model : def?.modelo || 'hereda';
  return SEPARADOR_META + JSON.stringify({ t: tipo, m: modelo, e: def?.esfuerzo ?? null });
}

// ── Modelo y costo por sesión ─────────────────────────────────────────────────

/** US$ por millón: entrada, escritura caché 5 min, escritura caché 1 h, lectura caché, salida (docs de Anthropic, 1/10/2026). */
const PRECIOS: Array<[string, [number, number, number, number, number]]> = [
  ['fable-5-1', [10, 12.5, 20, 0.25, 50]],
  ['fable-5', [10, 12.5, 20, 1, 50]],
  ['opus-5-5', [4, 5, 8, 0.2, 20]],
  ['opus', [5, 6.25, 10, 0.5, 25]],
  ['sonnet-5', [2, 2.5, 4, 0.2, 10]],
  ['sonnet', [3, 3.75, 6, 0.3, 15]],
  ['haiku', [1, 1.25, 2, 0.1, 5]],
];

interface Uso {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}

export function costoUsd(modelo: string | undefined, u: Uso): number {
  const p = PRECIOS.find(([clave]) => (modelo || '').toLowerCase().includes(clave))?.[1];
  if (!p) return 0;
  const cc = u.cache_creation;
  const w1h = cc?.ephemeral_1h_input_tokens ?? 0;
  const w5m = cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
  return (
    ((u.input_tokens ?? 0) * p[0] +
      w5m * p[1] +
      w1h * p[2] +
      (u.cache_read_input_tokens ?? 0) * p[3] +
      (u.output_tokens ?? 0) * p[4]) /
    1e6
  );
}

interface InfoSesion {
  modelo?: string;
  costo: number;
  vistos: Set<string>;
}

const sesiones = new WeakMap<AgentState, InfoSesion>();

interface Registro {
  uuid?: string;
  requestId?: string;
  message?: { id?: string; model?: string; usage?: Uso };
}

function sumar(info: InfoSesion, r: Registro): boolean {
  const u = r.message?.usage;
  if (!u) return false;
  const clave = r.message?.id || r.requestId || r.uuid;
  if (!clave || info.vistos.has(clave)) return false;
  info.vistos.add(clave);
  if (r.message?.model && r.message.model !== '<synthetic>') info.modelo = r.message.model;
  info.costo += costoUsd(r.message?.model, u);
  return true;
}

/** La primera vez lee el transcript completo (el original solo lee la cola), después suma registro a registro. */
function infoDe(agent: AgentState): InfoSesion {
  let info = sesiones.get(agent);
  if (info) return info;
  info = { costo: 0, vistos: new Set() };
  sesiones.set(agent, info);
  try {
    for (const linea of fs.readFileSync(agent.jsonlFile, 'utf8').split('\n')) {
      if (!linea.includes('"usage"')) continue;
      try {
        sumar(info, JSON.parse(linea) as Registro);
      } catch {
        /* línea a medio escribir */
      }
    }
  } catch {
    /* transcript no disponible */
  }
  return info;
}

export function mensajeInfo(agentId: number, agent: AgentState): Record<string, unknown> | null {
  const info = infoDe(agent);
  if (!info.modelo && info.costo === 0) return null;
  return {
    type: 'agentInfo',
    id: agentId,
    model: info.modelo,
    costUsd: Math.round(info.costo * 10000) / 10000,
  };
}

/** Llamado por cada registro del transcript (desde updateContextUsage). */
export function registrarUso(
  agentId: number,
  agent: AgentState,
  store: AgentStateStore,
  record: unknown,
): void {
  const primera = !sesiones.has(agent);
  const info = infoDe(agent);
  if (sumar(info, record as Registro) || primera) {
    const msg = mensajeInfo(agentId, agent);
    if (msg) store.broadcast(msg as never);
  }
}
