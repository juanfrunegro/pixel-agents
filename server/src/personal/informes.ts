/**
 * Personal (copia de juanfrunegro): el último informe de cada manager (manager-erp, manager-chaina…) en GET
 * /informes?token=…, para la placa de su escritorio (clic → panel) y el semáforo del CEO (parpadea si un manager
 * escaló o pidió una decisión). Fuente: los transcripts de sub-agentes de ~/.claude/projects en Windows y en WSL
 * (<sesión>/subagents/agent-*.jsonl, con el tipo en el .meta.json): el último mensaje del asistente que trae
 * "## Informe de manager-…" (el formato fijo de los managers: Estado, Resultado, Decisión que necesito del CEO…).
 */
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { timingSafeStringEqual } from '../httpServer.js';
import { raicesWsl } from './personal.js';

export interface Informe {
  /** Tipo del agente: "manager-erp". */
  tipo: string;
  /** El pedido, tal como lo puso el manager en el título. */
  titulo: string;
  /** Cuándo lo entregó (ms). */
  fecha: number;
  estado: string;
  resultado: string;
  decision: string;
  /** Escaló o pidió una decisión al CEO: la placa del CEO parpadea hasta que se lee. */
  necesitaCeo: boolean;
  /** El informe completo, sin el formato de negrita. */
  texto: string;
}

const ENCABEZADO = /^#{1,3}\s*Informe de (manager-[\w-]+)\s*(?:[—–-]\s*(.*))?$/m;
/** Una etiqueta del informe ("Estado: …"); las viñetas ("- Implementadas: …") son parte del campo de arriba. */
const ETIQUETA = /^([A-ZÁÉÍÓÚ][^:\n]{1,40}):\s*(.*)$/;

const sinNegrita = (s: string) => s.replace(/\*\*/g, '');

/** Valor de una etiqueta del informe ("Estado:"), con las líneas que siguen hasta la próxima etiqueta o un blanco. */
function campo(lineas: string[], nombre: RegExp): string {
  const i = lineas.findIndex((l) => {
    const m = ETIQUETA.exec(l);
    return !!m && nombre.test(m[1]);
  });
  if (i < 0) return '';
  const partes = [ETIQUETA.exec(lineas[i])![2].trim()];
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j];
    if (!l.trim()) {
      if (partes.some(Boolean)) break;
      continue;
    }
    if (ETIQUETA.test(l) || /^#/.test(l)) break;
    partes.push(l.trim());
  }
  return partes.filter(Boolean).join('\n');
}

/** Lee un informe de manager de un texto; null si no tiene el encabezado. */
export function parsearInforme(texto: string, fecha = 0): Informe | null {
  const limpio = sinNegrita(texto);
  const m = ENCABEZADO.exec(limpio);
  if (!m) return null;
  const cuerpo = limpio.slice(m.index);
  const lineas = cuerpo.split(/\r?\n/).slice(1);
  const estado = campo(lineas, /^Estado$/i);
  const decision = campo(lineas, /^Decisi[oó]n que necesito/i);
  const pide = !!decision && !/^(ninguna|ninguno|no|nada|—|-)\b/i.test(decision.trim());
  return {
    tipo: m[1],
    titulo: (m[2] ?? '').trim(),
    fecha,
    estado,
    resultado: campo(lineas, /^Resultado$/i),
    decision,
    necesitaCeo: /ESCALADO/i.test(estado) || pide,
    texto: cuerpo.trim(),
  };
}

/** El último informe de un transcript de sub-agente (jsonl). */
export function ultimoInforme(jsonl: string): Informe | null {
  const lineas = jsonl.split('\n');
  for (let i = lineas.length - 1; i >= 0; i--) {
    if (!lineas[i].includes('Informe de manager-')) continue;
    try {
      const r = JSON.parse(lineas[i]) as {
        type?: string;
        timestamp?: string;
        message?: { content?: unknown };
      };
      if (r.type !== 'assistant' || !Array.isArray(r.message?.content)) continue;
      const texto = (r.message.content as Array<{ type?: string; text?: unknown }>)
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n');
      const inf = parsearInforme(texto, Date.parse(r.timestamp ?? '') || 0);
      if (inf) return inf;
    } catch {
      /* línea cortada: la anterior */
    }
  }
  return null;
}

// ── Buscar los transcripts ───────────────────────────────────────

/** Tipo de cada .meta.json ya leído (no cambia) y el informe de cada transcript por mtime+tamaño. */
const tipos = new Map<string, string | null>();
const memo = new Map<string, { clave: string; informe: Informe | null }>();

/** El último informe de cada manager (el más nuevo si hay varios del mismo tipo), del más nuevo al más viejo. */
export async function informesAsync(
  raices: string[] = [path.join(os.homedir() || '.', '.claude', 'projects'), ...raicesWsl()],
): Promise<Informe[]> {
  const fsp = fs.promises;
  const listar = async (dir: string) => {
    try {
      return await fsp.readdir(dir);
    } catch {
      return [];
    }
  };
  const tipoDe = async (meta: string): Promise<string | null> => {
    if (tipos.has(meta)) return tipos.get(meta)!;
    let tipo: string | null = null;
    try {
      const t = (JSON.parse(await fsp.readFile(meta, 'utf8')) as { agentType?: unknown }).agentType;
      if (typeof t === 'string' && t.startsWith('manager-')) tipo = t;
    } catch {
      /* sin meta: no es de un manager */
    }
    tipos.set(meta, tipo);
    return tipo;
  };
  const candidatos: Array<{ archivo: string; mtime: number; size: number }> = [];
  for (const raiz of raices) {
    for (const dir of await listar(raiz)) {
      const carpeta = path.join(raiz, dir);
      await Promise.all(
        (await listar(carpeta))
          .filter((f) => !f.endsWith('.jsonl'))
          .map(async (sesion) => {
            const subs = path.join(carpeta, sesion, 'subagents');
            for (const s of await listar(subs)) {
              if (!s.endsWith('.meta.json')) continue;
              if (!(await tipoDe(path.join(subs, s)))) continue;
              const archivo = path.join(subs, s.replace(/\.meta\.json$/, '.jsonl'));
              try {
                const st = await fsp.stat(archivo);
                candidatos.push({ archivo, mtime: st.mtimeMs, size: st.size });
              } catch {
                /* sin transcript todavía */
              }
            }
          }),
      );
    }
  }
  const porTipo = new Map<string, Informe>();
  for (const c of candidatos.sort((a, b) => b.mtime - a.mtime)) {
    const clave = `${c.mtime}:${c.size}`;
    let previo = memo.get(c.archivo);
    if (previo?.clave !== clave) {
      let informe: Informe | null = null;
      try {
        informe = ultimoInforme(await fsp.readFile(c.archivo, 'utf8'));
      } catch {
        /* no se pudo leer: sin informe */
      }
      previo = { clave, informe };
      memo.set(c.archivo, previo);
    }
    const inf = previo.informe;
    if (!inf) continue;
    const ya = porTipo.get(inf.tipo);
    if (!ya || inf.fecha > ya.fecha) porTipo.set(inf.tipo, inf);
  }
  return [...porTipo.values()].sort((a, b) => b.fecha - a.fecha);
}

const VIGENCIA_MS = 30_000;
let cache: { hecho: number; informes: Informe[] } | null = null;
let enCurso: Promise<Informe[]> | null = null;

async function informesVigentes(ahora = Date.now()): Promise<Informe[]> {
  if (cache && ahora - cache.hecho < VIGENCIA_MS) return cache.informes;
  enCurso ??= informesAsync()
    .then((informes) => {
      cache = { hecho: Date.now(), informes };
      return informes;
    })
    .finally(() => {
      enCurso = null;
    });
  return cache?.informes ?? enCurso;
}

/** GET /informes (último informe de cada manager): solo con el token de la oficina. */
export function registrarInformes(app: FastifyInstance, token: string): void {
  app.get('/informes', async (request, reply) => {
    const dado = new URL(request.url, 'http://localhost').searchParams.get('token') ?? '';
    if (!token || !timingSafeStringEqual(dado, token))
      return reply.code(403).send({ error: 'Falta el token de la oficina.' });
    return reply.send({ informes: await informesVigentes() });
  });
}
