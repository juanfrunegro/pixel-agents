/**
 * Personal (copia de juanfrunegro): resumen del día en GET /hoy?token=… — por proyecto y por agente, cuánto se trabajó
 * hoy (sesiones, tiempo activo aproximado, herramientas más usadas) y el costo equivalente a precio de API (el mismo
 * cálculo que la ficha y el organigrama: costoUsd). Fuente: los transcripts de hoy de ~/.claude/projects en Windows y
 * en WSL (raicesWsl), sesiones principales y sus sub-agentes (<sesión>/subagents/agent-*.jsonl).
 *
 * Tiempo activo: la suma de los intervalos entre registros seguidos del transcript que no superan PAUSA_MS; una pausa
 * más larga (esperando tu mensaje, almuerzo) no cuenta. Es aproximado: un sub-agente trabaja en paralelo con su
 * sesión, así que el tiempo de los agentes no se suma al del proyecto (ese es el de las sesiones principales).
 */
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { timingSafeStringEqual } from '../httpServer.js';
import { costoUsd, esDeWsl, leerNombres, proyectoDe, raicesWsl } from './personal.js';

export const PAUSA_MS = 5 * 60_000;

export interface Trabajo {
  archivo: string;
  proyecto: string;
  agente: string;
  esSub: boolean;
  wsl: boolean;
  activoMs: number;
  costo: number;
  /** Tokens de hoy: entrada + salida + caché (escritura y lectura). */
  tokens: number;
  herramientas: Map<string, number>;
}

interface Registro {
  timestamp?: string;
  cwd?: string;
  type?: string;
  requestId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: Parameters<typeof costoUsd>[1];
    content?: unknown;
  };
}

/** Lo trabajado hoy (desde `desde`) en un transcript. null si no tiene registros de hoy. */
export function trabajoDe(
  texto: string,
  datos: { archivo: string; proyectoDir: string; agente: string; esSub: boolean; wsl: boolean },
  desde: number,
): Trabajo | null {
  const tiempos: number[] = [];
  const herramientas = new Map<string, number>();
  const vistos = new Set<string>();
  let costo = 0;
  let tokens = 0;
  let cwd: string | undefined;
  for (const linea of texto.split('\n')) {
    if (!linea.trim()) continue;
    let r: Registro;
    try {
      r = JSON.parse(linea) as Registro;
    } catch {
      continue;
    }
    if (!cwd && typeof r.cwd === 'string') cwd = r.cwd;
    const t = r.timestamp ? Date.parse(r.timestamp) : NaN;
    if (!Number.isFinite(t) || t < desde) continue;
    tiempos.push(t);
    if (r.type !== 'assistant' || !r.message) continue;
    const m = r.message;
    const clave = `${m.id ?? ''}:${r.requestId ?? ''}`;
    if (m.usage && !vistos.has(clave)) {
      vistos.add(clave);
      costo += costoUsd(m.model, m.usage);
      const u = m.usage;
      tokens +=
        (u.input_tokens ?? 0) +
        (u.output_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0);
    }
    if (Array.isArray(m.content)) {
      for (const b of m.content as Array<{ type?: string; name?: string }>) {
        if (b?.type === 'tool_use' && typeof b.name === 'string') {
          herramientas.set(b.name, (herramientas.get(b.name) ?? 0) + 1);
        }
      }
    }
  }
  if (tiempos.length === 0) return null;
  tiempos.sort((a, b) => a - b);
  let activoMs = 0;
  for (let i = 1; i < tiempos.length; i++) {
    const d = tiempos[i] - tiempos[i - 1];
    if (d <= PAUSA_MS) activoMs += d;
  }
  return {
    archivo: datos.archivo,
    proyecto: proyectoDe({ cwd, projectDir: datos.proyectoDir }) ?? 'Otros',
    agente: datos.agente,
    esSub: datos.esSub,
    wsl: datos.wsl,
    activoMs,
    costo,
    tokens,
    herramientas,
  };
}

/** Comienzo de hoy (00:00 de la hora de esta PC). */
export function inicioDeHoy(ahora = new Date()): number {
  const d = new Date(ahora);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function listar(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function deHoy(archivo: string, desde: number): boolean {
  try {
    return fs.statSync(archivo).mtimeMs >= desde;
  } catch {
    return false;
  }
}

function tipoDeSub(jsonl: string): string {
  try {
    const meta = JSON.parse(fs.readFileSync(jsonl.replace(/\.jsonl$/, '.meta.json'), 'utf8')) as {
      agentType?: unknown;
    };
    return typeof meta.agentType === 'string' && meta.agentType ? meta.agentType : 'subagente';
  } catch {
    return 'subagente';
  }
}

/** Todos los transcripts tocados hoy, con lo trabajado hoy en cada uno. */
export function trabajosDeHoy(
  raices: string[] = [path.join(os.homedir() || '.', '.claude', 'projects'), ...raicesWsl()],
  desde = inicioDeHoy(),
): Trabajo[] {
  const n = leerNombres();
  const out: Trabajo[] = [];
  const leer = (archivo: string, proyectoDir: string, agente: string, esSub: boolean) => {
    if (!deHoy(archivo, desde)) return;
    let texto: string;
    try {
      texto = fs.readFileSync(archivo, 'utf8');
    } catch {
      return;
    }
    const t = trabajoDe(
      texto,
      { archivo, proyectoDir, agente, esSub, wsl: esDeWsl(archivo) },
      desde,
    );
    if (t) out.push(t);
  };
  for (const raiz of raices) {
    for (const dir of listar(raiz)) {
      const carpeta = path.join(raiz, dir);
      for (const f of listar(carpeta)) {
        const ruta = path.join(carpeta, f);
        if (f.endsWith('.jsonl')) {
          leer(ruta, dir, n.ceo, false);
          continue;
        }
        const subs = path.join(ruta, 'subagents');
        for (const s of listar(subs)) {
          if (!s.endsWith('.jsonl')) continue;
          const archivo = path.join(subs, s);
          if (!deHoy(archivo, desde)) continue;
          const tipo = tipoDeSub(archivo);
          leer(archivo, dir, n.agentes[tipo] ?? tipo, true);
        }
      }
    }
  }
  return out;
}

/**
 * Lo mismo que trabajosDeHoy, sin trabar el server: E/S asíncrona y memoria por archivo (solo se vuelven a leer los
 * transcripts que cambiaron desde la vuelta anterior). La versión sincrónica tardaba ~3,5 s con los transcripts de WSL
 * por \\wsl.localhost y, mientras tanto, el server no atendía a nadie (las pestañas se congelaban).
 */
const memoTrabajos = new Map<string, { clave: string; trabajo: Trabajo | null }>();

export async function trabajosDeHoyAsync(
  raices: string[] = [path.join(os.homedir() || '.', '.claude', 'projects'), ...raicesWsl()],
  desde = inicioDeHoy(),
): Promise<Trabajo[]> {
  const fsp = fs.promises;
  const n = leerNombres();
  const vistos = new Set<string>();
  const out: Trabajo[] = [];
  const listarA = async (dir: string): Promise<string[]> => {
    try {
      return await fsp.readdir(dir);
    } catch {
      return [];
    }
  };
  const statA = async (archivo: string): Promise<fs.Stats | null> => {
    try {
      return await fsp.stat(archivo);
    } catch {
      return null;
    }
  };
  const tipoDeSubA = async (jsonl: string): Promise<string> => {
    try {
      const meta = JSON.parse(
        await fsp.readFile(jsonl.replace(/\.jsonl$/, '.meta.json'), 'utf8'),
      ) as { agentType?: unknown };
      return typeof meta.agentType === 'string' && meta.agentType ? meta.agentType : 'subagente';
    } catch {
      return 'subagente';
    }
  };
  const leer = async (archivo: string, proyectoDir: string, esSub: boolean): Promise<void> => {
    const st = await statA(archivo);
    if (!st || st.mtimeMs < desde) return;
    let agente = n.ceo;
    if (esSub) {
      const tipo = await tipoDeSubA(archivo);
      agente = n.agentes[tipo] ?? tipo;
    }
    const clave = `${desde}:${st.mtimeMs}:${st.size}:${agente}`;
    vistos.add(archivo);
    const previo = memoTrabajos.get(archivo);
    if (previo?.clave === clave) {
      if (previo.trabajo) out.push(previo.trabajo);
      return;
    }
    let texto: string;
    try {
      texto = await fsp.readFile(archivo, 'utf8');
    } catch {
      return;
    }
    const trabajo = trabajoDe(
      texto,
      { archivo, proyectoDir, agente, esSub, wsl: esDeWsl(archivo) },
      desde,
    );
    memoTrabajos.set(archivo, { clave, trabajo });
    if (trabajo) out.push(trabajo);
  };
  for (const raiz of raices) {
    for (const dir of await listarA(raiz)) {
      const carpeta = path.join(raiz, dir);
      const tareas: Array<Promise<void>> = [];
      for (const f of await listarA(carpeta)) {
        const ruta = path.join(carpeta, f);
        if (f.endsWith('.jsonl')) {
          tareas.push(leer(ruta, dir, false));
          continue;
        }
        tareas.push(
          (async () => {
            const subs = path.join(ruta, 'subagents');
            await Promise.all(
              (await listarA(subs))
                .filter((s) => s.endsWith('.jsonl'))
                .map((s) => leer(path.join(subs, s), dir, true)),
            );
          })(),
        );
      }
      await Promise.all(tareas);
    }
  }
  for (const archivo of memoTrabajos.keys()) if (!vistos.has(archivo)) memoTrabajos.delete(archivo);
  return out;
}

export interface FilaAgente {
  agente: string;
  esSub: boolean;
  wsl: boolean;
  sesiones: number;
  activoMs: number;
  costo: number;
  herramientas: Array<[string, number]>;
}

export interface ResumenProyecto {
  proyecto: string;
  sesiones: number;
  activoMs: number;
  costo: number;
  tokens: number;
  agentes: FilaAgente[];
}

const top = (m: Map<string, number>, n = 3): Array<[string, number]> =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

/** Agrupa por proyecto y por agente. Proyectos y agentes ordenados por costo. */
export function resumirDia(trabajos: Trabajo[]): ResumenProyecto[] {
  const proyectos = new Map<
    string,
    { r: ResumenProyecto; agentes: Map<string, FilaAgente & { h: Map<string, number> }> }
  >();
  for (const t of trabajos) {
    let p = proyectos.get(t.proyecto);
    if (!p) {
      p = {
        r: { proyecto: t.proyecto, sesiones: 0, activoMs: 0, costo: 0, tokens: 0, agentes: [] },
        agentes: new Map(),
      };
      proyectos.set(t.proyecto, p);
    }
    p.r.costo += t.costo;
    p.r.tokens += t.tokens ?? 0;
    if (!t.esSub) {
      p.r.sesiones++;
      p.r.activoMs += t.activoMs;
    }
    const clave = `${t.esSub ? 'sub' : 'ses'}:${t.agente}:${t.wsl ? 'wsl' : 'win'}`;
    let a = p.agentes.get(clave);
    if (!a) {
      a = {
        agente: t.agente,
        esSub: t.esSub,
        wsl: t.wsl,
        sesiones: 0,
        activoMs: 0,
        costo: 0,
        herramientas: [],
        h: new Map(),
      };
      p.agentes.set(clave, a);
    }
    a.sesiones++;
    a.activoMs += t.activoMs;
    a.costo += t.costo;
    for (const [k, v] of t.herramientas) a.h.set(k, (a.h.get(k) ?? 0) + v);
  }
  return [...proyectos.values()]
    .map(({ r, agentes }) => ({
      ...r,
      agentes: [...agentes.values()]
        .map(({ h, ...a }) => ({ ...a, herramientas: top(h) }))
        .sort((x, y) => y.costo - x.costo || y.activoMs - x.activoMs),
    }))
    .sort((x, y) => y.costo - x.costo || y.activoMs - x.activoMs);
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

export function duracion(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

const usd = (n: number): string => `US$ ${n.toFixed(2)}`;
const COLOR_WSL = '#14b8a6';

export function htmlHoy(resumen: ResumenProyecto[], ahora = new Date()): string {
  const total = resumen.reduce(
    (s, p) => ({
      sesiones: s.sesiones + p.sesiones,
      activoMs: s.activoMs + p.activoMs,
      costo: s.costo + p.costo,
    }),
    { sesiones: 0, activoMs: 0, costo: 0 },
  );
  const fecha = ahora.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const filas = (p: ResumenProyecto) =>
    p.agentes
      .map(
        (a) =>
          `<tr><td>${esc(a.agente)}${a.esSub ? '' : ' <span class="tag">sesión</span>'}${
            a.wsl ? ' <span class="tag wsl">WSL</span>' : ''
          }</td><td class="n">${a.sesiones}</td><td class="n">${duracion(a.activoMs)}</td><td>${a.herramientas
            .map(([h, n]) => `${esc(h)} <span class="m">${n}</span>`)
            .join(' · ')}</td><td class="n">${usd(a.costo)}</td></tr>`,
      )
      .join('');
  const bloques = resumen
    .map(
      (p) => `<section><h2>${esc(p.proyecto)} <span class="m">${p.sesiones} ${
        p.sesiones === 1 ? 'sesión' : 'sesiones'
      } · ${duracion(p.activoMs)} activo · ${usd(p.costo)}</span></h2>
<table><thead><tr><th>Agente</th><th class="n">Veces</th><th class="n">Activo</th><th>Herramientas más usadas</th><th class="n">Costo</th></tr></thead><tbody>${filas(p)}</tbody></table></section>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hoy en la oficina</title><style>
*{box-sizing:border-box}
body{margin:0;background:#16181f;color:#e7e9ee;font:15px/1.45 system-ui,sans-serif;padding:24px 16px 48px;max-width:1100px}
h1{margin:0 0 4px;font-size:26px}.sub{color:#9ba2b0;margin:0 0 18px;max-width:75ch}
.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}.kpi{background:#1f222b;border:1px solid #2f3440;border-radius:6px;padding:10px 16px}
.kpi b{display:block;font-size:22px}.kpi span{color:#9ba2b0;font-size:13px}
section{background:#1f222b;border:1px solid #2f3440;border-radius:6px;padding:12px;margin-bottom:14px;overflow-x:auto}
h2{margin:0 0 8px;font-size:19px}.m{color:#9ba2b0;font-weight:400;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:5px 8px;border-top:1px solid #2f3440;vertical-align:top}
th{color:#9ba2b0;font-weight:600;border-top:0}.n{text-align:right;white-space:nowrap}
.tag{font-size:11px;font-weight:700;padding:0 6px;border-radius:3px;background:#3a4050;color:#e7e9ee;white-space:nowrap}.tag.wsl{background:${COLOR_WSL};color:#fff}
.vacio{color:#9ba2b0}
</style></head><body><h1>Hoy en la oficina</h1>
<p class="sub">${esc(fecha)}, hasta las ${esc(hora)}. Sale de los transcripts de hoy (Windows y WSL). El tiempo activo es aproximado: suma los ratos de trabajo y no cuenta pausas de más de 5 minutos. El costo es el equivalente a precio de API, como en la ficha de cada agente.</p>
<div class="kpis"><div class="kpi"><b>${total.sesiones}</b><span>sesiones</span></div><div class="kpi"><b>${duracion(total.activoMs)}</b><span>de trabajo de las sesiones</span></div><div class="kpi"><b>${usd(total.costo)}</b><span>costo equivalente</span></div></div>
${bloques || '<p class="vacio">Todavía no trabajó ningún agente hoy.</p>'}
</body></html>`;
}

// Leer todos los transcripts del día (los de WSL por \\wsl.localhost) tarda: se rehace como mucho cada 2 minutos, en
// segundo plano. Mientras se rehace se sirve el anterior (salvo que sea de otro día), así nadie espera ni se traba.
const VIGENCIA_MS = 2 * 60_000;
type Vigente = { hecho: number; desde: number; resumen: ResumenProyecto[]; html: string };
let cache: Vigente | null = null;
let enCurso: Promise<Vigente> | null = null;

async function resumenVigente(ahora = Date.now()): Promise<Vigente> {
  const desde = inicioDeHoy(new Date(ahora));
  const vencido = !cache || cache.desde !== desde || ahora - cache.hecho > VIGENCIA_MS;
  if (vencido && !enCurso) {
    enCurso = trabajosDeHoyAsync(undefined, desde)
      .then((trabajos) => {
        const resumen = resumirDia(trabajos);
        cache = { hecho: Date.now(), desde, resumen, html: htmlHoy(resumen) };
        return cache;
      })
      .finally(() => {
        enCurso = null;
      });
  }
  if (cache && cache.desde === desde) return cache;
  return enCurso ?? (cache as Vigente);
}

/** Sin cupo por cuenta: hasta cuándo (segundos epoch; 0 = sin hora de vuelta), o null si esa cuenta tiene cupo. */
export interface CupoPorCuenta {
  windows: number | null;
  wsl: number | null;
}

/** Lo mismo que /hoy pero en JSON, para coucou: totales y por proyecto (sin el detalle por agente). */
export function jsonHoy(resumen: ResumenProyecto[], cupo: CupoPorCuenta, ahora = Date.now()) {
  const redondo = (n: number) => Math.round(n * 100) / 100;
  return {
    generado: ahora,
    total: {
      sesiones: resumen.reduce((s, p) => s + p.sesiones, 0),
      activoMs: resumen.reduce((s, p) => s + p.activoMs, 0),
      costo: redondo(resumen.reduce((s, p) => s + p.costo, 0)),
      tokens: resumen.reduce((s, p) => s + p.tokens, 0),
    },
    proyectos: resumen.map((p) => ({
      proyecto: p.proyecto,
      sesiones: p.sesiones,
      activoMs: p.activoMs,
      costo: redondo(p.costo),
      tokens: p.tokens,
      wsl: p.agentes.some((a) => a.wsl),
    })),
    cupo,
  };
}

/**
 * Rutas GET /hoy (resumen del día), GET /hoy.json (lo mismo para coucou, con el cupo por cuenta) y GET /pizarra
 * (pendientes del Brain, JSON): solo con el token de la oficina.
 */
export function registrarHoy(
  app: FastifyInstance,
  token: string,
  pizarra: () => unknown,
  cupo: () => CupoPorCuenta = () => ({ windows: null, wsl: null }),
): void {
  const conToken = (url: string) =>
    !!token &&
    timingSafeStringEqual(new URL(url, 'http://localhost').searchParams.get('token') ?? '', token);
  app.get('/hoy', async (request, reply) => {
    if (!conToken(request.url)) return reply.code(403).send('Falta el token de la oficina.');
    return reply.type('text/html; charset=utf-8').send((await resumenVigente()).html);
  });
  app.get('/hoy.json', async (request, reply) => {
    if (!conToken(request.url))
      return reply.code(403).send({ error: 'Falta el token de la oficina.' });
    return reply.send(jsonHoy((await resumenVigente()).resumen, cupo()));
  });
  app.get('/pizarra', async (request, reply) => {
    if (!conToken(request.url))
      return reply.code(403).send({ error: 'Falta el token de la oficina.' });
    return reply.send({ proyectos: pizarra() });
  });
}
