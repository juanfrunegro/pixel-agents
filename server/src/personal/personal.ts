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
import {
  aplicarSenal,
  archivosVoz,
  duracionDicho,
  escribirOverrideVoz,
  leerOverrideVoz,
  type OverrideVoz,
  resumen,
  type Senales,
  senalesNuevas,
  sesionDe,
  vozActiva,
  vozDicha,
  vozPedida,
} from './senales.js';

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

const NOMBRES_POR_DEFECTO = (): Nombres => ({ ceo: 'CEO', agentes: {}, descartables: [] });

/** Error al leer un nombres.json que existe pero no se puede leer o parsear: no se escribe encima. */
export class NombresIlegibles extends Error {}

/** Como leerNombres, pero si el archivo existe y está roto tira NombresIlegibles (no existe = valores por defecto). */
function leerNombresEstricto(): Nombres {
  let crudo: string;
  try {
    crudo = fs.readFileSync(rutaNombres(), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return NOMBRES_POR_DEFECTO();
    throw new NombresIlegibles(String(e));
  }
  try {
    const j = JSON.parse(crudo) as Partial<Nombres>;
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('no es un objeto');
    return {
      ...j,
      ceo: typeof j.ceo === 'string' ? j.ceo : 'CEO',
      agentes: j.agentes && typeof j.agentes === 'object' ? j.agentes : {},
      descartables: Array.isArray(j.descartables) ? j.descartables : [],
    } as Nombres;
  } catch (e) {
    throw new NombresIlegibles(String(e));
  }
}

export function leerNombres(): Nombres {
  try {
    return leerNombresEstricto();
  } catch {
    return NOMBRES_POR_DEFECTO();
  }
}

/**
 * Guarda un nombre ("ceo" = sesión principal). Nombre vacío = vuelve al nombre por defecto.
 * Si nombres.json existe pero está roto no lo pisa (perdería roles/áreas/externos): lo avisa y devuelve lo que hay.
 * La clave tiene que ser un texto de hasta 80 caracteres.
 */
export function guardarNombre(clave: string, nombre: string): Nombres {
  if (typeof clave !== 'string' || !clave || clave.length > 80) return leerNombres();
  let n: Nombres;
  try {
    n = leerNombresEstricto();
  } catch (e) {
    console.error(`[Pixel Agents] nombres.json ilegible, no se guarda el nombre: ${String(e)}`);
    return leerNombres();
  }
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
  /** Agentes que puede lanzar (de `tools: Agent(a, b)`): el equipo de un manager. */
  equipo?: string[];
  /** Qué puede hacer con sus herramientas (de `tools:`). */
  permiso?: Permiso;
}

/** lee = sin Edit/Write ni MCPs que escriben; escribe = Edit/Write o un MCP que crea/cambia/borra; todo = sin `tools:` (hereda todas). */
export type Permiso = 'lee' | 'escribe' | 'todo';

export function permisoDe(tools: string | undefined): Permiso {
  if (!tools) return 'todo';
  const propias = tools.replace(/Agent\([^)]*\)/, '');
  const archivos = /\b(Edit|Write|NotebookEdit|MultiEdit)\b/.test(propias);
  // Escribir afuera por un MCP (crear o cambiar flujos de n8n, aplicar migraciones…) también es
  // escribir. El verbo tiene que ser una palabra entera: `…_adsets` no es "set".
  const mcp =
    /mcp__[^,\s]*?[_-](create|update|delete|apply|deploy|upsert|merge|send|set)(?=[_,\s]|$)/i.test(
      propias,
    );
  return archivos || mcp ? 'escribe' : 'lee';
}

/** Un perfil de Codex (`~/.claude/codex-perfiles/<nombre>.config.toml`): el "agente" de Codex. */
export interface PerfilCodex {
  modelo?: string;
  esfuerzo?: string;
  permiso: Permiso;
  archivo: string;
}

/** Claves de primer nivel de un TOML simple (antes de la primera [tabla]). */
export function leerPerfilCodex(texto: string, archivo: string): PerfilCodex {
  const base = texto.split(/^\[/m)[0];
  const clave = (k: string) => new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm').exec(base)?.[1];
  const sandbox = clave('sandbox_mode');
  return {
    modelo: clave('model'),
    esfuerzo: clave('model_reasoning_effort'),
    permiso: sandbox === 'read-only' ? 'lee' : sandbox === 'workspace-write' ? 'escribe' : 'todo',
    archivo,
  };
}

export function perfilesCodex(): Map<string, PerfilCodex> {
  const dir = path.join(claude(), 'codex-perfiles');
  const perfiles = new Map<string, PerfilCodex>();
  let archivos: string[] = [];
  try {
    archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.config.toml'));
  } catch {
    return perfiles;
  }
  for (const f of archivos) {
    try {
      const archivo = path.join(dir, f);
      perfiles.set(
        f.replace(/\.config\.toml$/, ''),
        leerPerfilCodex(fs.readFileSync(archivo, 'utf8'), archivo),
      );
    } catch {
      /* ilegible: se ignora */
    }
  }
  return perfiles;
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

/** `Read, Agent(a, b)` → ['a', 'b']; sin `Agent(...)` (o `Agent` a secas) no hay equipo. */
export function equipoDe(tools: string | undefined): string[] | undefined {
  const lista = tools && /Agent\(([^)]*)\)/.exec(tools)?.[1];
  return lista
    ? lista
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;
}
/**
 * Valor de `nombre:` en el frontmatter. Además de `clave: valor` en una línea, entiende el bloque (`>` / `|`: junta las
 * líneas indentadas con espacios) y la lista YAML (`- a` / `- b`: junta los ítems con coma).
 */
function campo(frontmatter: string, nombre: string): string | undefined {
  const m = new RegExp(`^${nombre}:[ \\t]*(.*?)[ \\t]*\\r?$`, 'm').exec(frontmatter);
  if (!m) return undefined;
  const valor = m[1].replace(/^['"]|['"]$/g, '');
  const bloque = /^[>|][+-]?$/.test(valor);
  if (valor && !bloque) return valor;
  // Valor vacío o bloque: las líneas siguientes con sangría (o ítems de lista a la misma altura) son el contenido.
  const resto = frontmatter
    .slice((m.index ?? 0) + m[0].length)
    .split(/\r?\n/)
    .slice(1);
  const lineas: string[] = [];
  for (const l of resto) {
    if (!l.trim()) {
      if (bloque) continue;
      break;
    }
    if (!/^[ \t]/.test(l) && !(!bloque && /^-[ \t]/.test(l))) break;
    lineas.push(l.trim());
  }
  if (bloque) return lineas.join(' ') || undefined;
  const items = lineas
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-[ \t]*/, '').replace(/^['"]|['"]$/g, ''));
  return items.length ? items.join(', ') : undefined;
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
          equipo: equipoDe(campo(fm, 'tools')),
          permiso: permisoDe(campo(fm, 'tools')),
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
  /** Transcript con el que se creó: si el agente cambia de archivo (/clear), la info se rehace. */
  jsonlFile?: string;
  /** Se quedó sin tokens: hasta cuándo (segundos epoch; 0 = sin hora de vuelta). undefined = despierto. */
  dormidoHasta?: number;
  /** Humo y deploy (senales.ts). */
  senales: Senales;
  /** Pidió el aviso por voz y todavía no se dijo. */
  voz: boolean;
  /** Cuándo se dijo el último aviso por voz (ms). */
  presento?: number;
  /** Cuánto dura ese aviso (ms, estimado por el hook en <sesión>.dicho); undefined = no se sabe. */
  presentaMs?: number;
  /** Interruptor puesto desde Pixel (tanda 5): manda sobre el prompt. */
  vozOverride: OverrideVoz;
}

const sesiones = new WeakMap<AgentState, InfoSesion>();

interface Registro {
  type?: string;
  uuid?: string;
  requestId?: string;
  error?: string;
  isApiErrorMessage?: boolean;
  quotaLimits?: { status?: string; resetsAt?: number };
  message?: { id?: string; model?: string; usage?: Uso };
}

/**
 * Dormido o despierto según un registro del transcript. Claude Code escribe un mensaje sintético con
 * `error: 'rate_limit'` ("You've hit your session limit") cuando se acaba la cuota; cualquier respuesta real del modelo
 * después lo despierta. Devuelve null si el registro no dice nada (texto de herramientas incluido: no se mira el texto).
 */
export function limiteDe(
  r: Registro,
): { dormido: true; hasta: number } | { dormido: false } | null {
  if (r.type !== 'assistant') return null;
  if (r.error === 'rate_limit' || (r.isApiErrorMessage && r.quotaLimits?.status === 'rejected')) {
    const hasta = r.quotaLimits?.resetsAt;
    return { dormido: true, hasta: typeof hasta === 'number' && hasta > 0 ? hasta : 0 };
  }
  if (r.message?.model && r.message.model !== '<synthetic>') return { dormido: false };
  return null;
}

function aplicarLimite(info: InfoSesion, r: Registro): boolean {
  const l = limiteDe(r);
  if (!l) return false;
  const antes = info.dormidoHasta;
  info.dormidoHasta = l.dormido ? l.hasta : undefined;
  return antes !== info.dormidoHasta;
}

/**
 * Sin cupo por cuenta (Windows = Pro, WSL = Max), para /hoy.json: la hora de vuelta más tardía entre las sesiones
 * dormidas de esa cuenta (0 = dormida sin hora). Una hora que ya pasó no cuenta. null = esa cuenta tiene cupo.
 */
export function cupoPorCuenta(
  agentes: Iterable<AgentState>,
  ahoraS = Date.now() / 1000,
): { windows: number | null; wsl: number | null } {
  const out: { windows: number | null; wsl: number | null } = { windows: null, wsl: null };
  for (const a of agentes) {
    const hasta = sesiones.get(a)?.dormidoHasta;
    if (hasta === undefined || (hasta > 0 && hasta <= ahoraS)) continue;
    const k = esDeWsl(a.jsonlFile) ? 'wsl' : 'windows';
    out[k] = Math.max(out[k] ?? 0, hasta);
  }
  return out;
}

/** Sesión de WSL leída desde Windows (\\wsl.localhost\… o \\wsl$\…): otra cuenta (Max). */
export function esDeWsl(archivo: string | undefined): boolean {
  return !!archivo && /^[\\/]{2}wsl(\.localhost|\$)[\\/]/i.test(archivo);
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

/** La info guardada del agente, si todavía es de su transcript actual (/clear lo cambia: reassignAgentToFile). */
function vigente(agent: AgentState): InfoSesion | undefined {
  const info = sesiones.get(agent);
  return info && info.jsonlFile === agent.jsonlFile ? info : undefined;
}

/** La primera vez lee el transcript completo (el original solo lee la cola), después suma registro a registro. */
function infoDe(agent: AgentState): InfoSesion {
  let info = vigente(agent);
  if (info) return info;
  info = {
    jsonlFile: agent.jsonlFile,
    costo: 0,
    vistos: new Set(),
    senales: senalesNuevas(),
    voz: false,
    vozOverride: null,
  };
  if (agent.jsonlFile) info.vozOverride = leerOverrideVoz(sesionDe(agent.jsonlFile));
  sesiones.set(agent, info);
  try {
    for (const linea of fs.readFileSync(agent.jsonlFile, 'utf8').split('\n')) {
      if (
        !linea.includes('"usage"') &&
        !linea.includes('"rate_limit"') &&
        !linea.includes('"tool_result"') &&
        !linea.includes('"turn_duration"')
      )
        continue;
      try {
        const r = JSON.parse(linea) as Registro;
        sumar(info, r);
        aplicarLimite(info, r);
        aplicarSenal(info.senales, r as never);
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
  const wsl = esDeWsl(agent.jsonlFile);
  const senales = resumen(info.senales);
  if (
    !info.modelo &&
    info.costo === 0 &&
    !wsl &&
    info.dormidoHasta === undefined &&
    senales.errores === 0 &&
    senales.deployDesde === null &&
    !info.voz &&
    info.presento === undefined &&
    info.vozOverride === null
  )
    return null;
  return {
    type: 'agentInfo',
    id: agentId,
    model: info.modelo,
    costUsd: Math.round(info.costo * 10000) / 10000,
    dormidoHasta: info.dormidoHasta ?? null,
    wsl,
    ...senales,
    voz: info.voz,
    presento: info.presento ?? null,
    presentaMs: info.presentaMs ?? null,
    vozOverride: info.vozOverride,
    vozActiva: vozActiva(info.voz, info.vozOverride),
  };
}

/**
 * Interruptor del aviso por voz de una sesión (mensaje setVozSesion, solo con token): escribe el override que leen los
 * hooks y avisa a los clientes. Devuelve false si el agente no existe o el valor no vale.
 */
export function cambiarVozSesion(
  store: AgentStateStore,
  agentId: unknown,
  valor: unknown,
): boolean {
  if (typeof agentId !== 'number') return false;
  const agent = store.get(agentId);
  if (!agent?.jsonlFile) return false;
  const sesion = sesionDe(agent.jsonlFile);
  if (!escribirOverrideVoz(sesion, valor)) return false;
  const info = infoDe(agent);
  info.vozOverride = valor as OverrideVoz;
  const msg = mensajeInfo(agentId, agent);
  if (msg) store.broadcast(msg as never);
  return true;
}

/** Llamado por cada registro del transcript (desde updateContextUsage). */
export function registrarUso(
  agentId: number,
  agent: AgentState,
  store: AgentStateStore,
  record: unknown,
): void {
  const primera = !vigente(agent);
  const info = infoDe(agent);
  const sumo = sumar(info, record as Registro);
  const cambioLimite = aplicarLimite(info, record as Registro);
  // En la primera lectura infoDe ya contó este registro (está en el transcript): aplicarlo otra vez duplicaría errores.
  const cambioSenal = primera ? false : aplicarSenal(info.senales, record as never);
  if (sumo || cambioLimite || cambioSenal || primera) {
    const msg = mensajeInfo(agentId, agent);
    if (msg) store.broadcast(msg as never);
  }
}

const deployVisto = new WeakMap<AgentState, number | null>();

/**
 * Revisa la marca del aviso por voz de cada sesión (senales.ts) y avisa al webview cuando cambia: al aparecer, la
 * sesión "va a presentar"; al desaparecer (el hook ya habló), queda la hora en que presentó. También re-manda la info
 * de las sesiones con un deploy que venció solo. Lo llama cli.ts cada pocos segundos.
 */
export function revisarSenales(store: AgentStateStore, ahora = Date.now()): void {
  let enCarpeta: Set<string> | null = null; // ~/.pixel-agents/voz, leída una vez por vuelta y solo si hace falta
  for (const [id, agent] of store) {
    if (!agent.jsonlFile) continue;
    const info = sesiones.get(agent);
    if (!info) continue;
    let cambio = false;
    const sesion = sesionDe(agent.jsonlFile);
    const voz = vozPedida(sesion);
    enCarpeta ??= archivosVoz();
    const override = enCarpeta.has(`${sesion}.override`) ? leerOverrideVoz(sesion) : null;
    if (override !== info.vozOverride) {
      info.vozOverride = override;
      cambio = true;
    }
    if (voz !== info.voz) {
      // La marca desaparece cuando el hook terminó el turno: presenta, salvo que el interruptor estuviera apagado
      // (el hook borra la marca sin hablar).
      if (!voz && override !== 'off') {
        info.presento = ahora;
        info.presentaMs = undefined;
      }
      info.voz = voz;
      cambio = true;
    }
    // Un aviso dicho por el interruptor (sin marca del prompt) solo se ve en <sesión>.dicho.
    const dicho = enCarpeta.has(`${sesion}.dicho`) ? vozDicha(sesion) : null;
    if (dicho !== null && dicho > (info.presento ?? 0) + 15_000 && ahora - dicho < 120_000) {
      info.presento = dicho;
      info.presentaMs = undefined;
      cambio = true;
    }
    // Cuánto dura el aviso (para que suba al escenario mientras habla): del .dicho de ese mismo aviso.
    if (
      info.presento !== undefined &&
      info.presentaMs === undefined &&
      dicho !== null &&
      Math.abs(dicho - info.presento) < 15_000
    ) {
      const ms = duracionDicho(sesion);
      if (ms !== null) {
        info.presentaMs = ms;
        cambio = true;
      }
    }
    const r = resumen(info.senales, ahora);
    const ultimo = deployVisto.get(agent);
    if (ultimo !== undefined && ultimo !== r.deployDesde) cambio = true;
    deployVisto.set(agent, r.deployDesde);
    if (cambio) {
      const msg = mensajeInfo(id, agent);
      if (msg) store.broadcast(msg as never);
    }
  }
}
