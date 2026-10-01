/**
 * Personal (copia de juanfrunegro): organigrama en vivo en GET /organigrama?token=…, armado con nombres.json, la
 * definición de cada agente y el registro de rendimiento (~/.claude/logs). Siempre al día: no hay página que mantener.
 */
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { definiciones, leerNombres } from './personal.js';

interface Uso {
  veces: number;
  costo: number;
  bien: number;
  mal: number;
  ultima?: string;
}

function leerJsonl(ruta: string): Array<Record<string, unknown>> {
  try {
    return fs
      .readFileSync(ruta, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function usoPorAgente(): Map<string, Uso> {
  const logs = path.join(os.homedir() || '.', '.claude', 'logs');
  const notas = new Map(
    leerJsonl(path.join(logs, 'rendimiento-notas.jsonl')).map((n) => [n.agent_id, n.veredicto]),
  );
  const uso = new Map<string, Uso>();
  for (const f of leerJsonl(path.join(logs, 'rendimiento-agentes.jsonl'))) {
    const u = uso.get(String(f.agente)) ?? { veces: 0, costo: 0, bien: 0, mal: 0 };
    u.veces++;
    u.costo += Number(f.costo_usd) || 0;
    if (notas.get(f.agent_id) === 'bien') u.bien++;
    if (notas.get(f.agent_id) === 'mal') u.mal++;
    u.ultima = String(f.fecha).slice(0, 10);
    uso.set(String(f.agente), u);
  }
  return uso;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

function color(m?: string): string {
  const x = (m || '').toLowerCase();
  if (x.includes('opus')) return '#e8832a';
  if (x.includes('sonnet')) return '#3b9bd6';
  if (x.includes('fable')) return '#a463e0';
  if (x.includes('haiku')) return '#4cb36a';
  return '#9aa0ab';
}

export function htmlOrganigrama(): string {
  const n = leerNombres();
  const roles = (n.roles ?? {}) as Record<string, string>;
  const externos = (n.externos ?? {}) as Record<string, string>;
  const defs = definiciones();
  const uso = usoPorAgente();
  const persona = (nombre: string) => nombre.split(' · ')[0].trim();
  const grupos = new Map<string, string[]>();
  for (const p of Object.keys(roles)) grupos.set(p, []);
  const sinNombre: string[] = [];
  for (const interno of defs.keys()) {
    const nombre = n.agentes[interno];
    if (!nombre) sinNombre.push(interno);
    else grupos.set(persona(nombre), [...(grupos.get(persona(nombre)) ?? []), interno]);
  }
  for (const [clave, nombre] of Object.entries(externos)) {
    grupos.set(persona(nombre), [...(grupos.get(persona(nombre)) ?? []), `externo:${clave}`]);
  }

  const tarjeta = (interno: string): string => {
    if (interno.startsWith('externo:')) {
      const k = interno.slice(8);
      return `<div class="ag"><b>${esc(externos[k])}</b><span class="int">${esc(k)} · fuera de Claude Code (no aparece en la oficina)</span></div>`;
    }
    const d = defs.get(interno)!;
    const u = uso.get(interno);
    const nombre = n.agentes[interno] ?? interno;
    const rinde = u
      ? `${u.veces} ${u.veces === 1 ? 'vez' : 'veces'} · US$ ${(u.costo / u.veces).toFixed(2)} promedio · notas ${u.bien} bien / ${u.mal} mal · última ${esc(u.ultima)}`
      : 'sin uso registrado todavía';
    return `<div class="ag" style="border-left-color:${color(d.modelo)}">
      <b>${esc(nombre)}</b><span class="int">${esc(interno)} · ${esc(d.proyecto)}</span>
      <span class="chip" style="background:${color(d.modelo)}">${esc(d.modelo ?? 'hereda')}${d.esfuerzo ? ' · ' + esc(d.esfuerzo) : ''}</span>
      <p>${esc((d.descripcion ?? '').slice(0, 260))}</p><span class="uso">${rinde}</span></div>`;
  };

  const bloques = [...grupos.entries()]
    .sort(([a], [b]) => (a === persona(n.ceo) ? -1 : b === persona(n.ceo) ? 1 : a.localeCompare(b)))
    .map(([p, internos]) => {
      const esCeo = p === persona(n.ceo);
      const cuerpo = esCeo
        ? '<div class="ag" style="border-left-color:#e8832a"><b>' +
          esc(n.ceo) +
          '</b><span class="int">sesión principal · Windows: Sonnet + asesor Opus · WSL: Opus + asesor Fable</span></div>'
        : internos.length
          ? internos.map(tarjeta).join('')
          : '<div class="ag vac">Puesto sin agente todavía</div>';
      return `<section><h2>${esc(p)}</h2><p class="rol">${esc(roles[p] ?? '')}</p>${cuerpo}</section>`;
    })
    .join('');
  const sin = sinNombre.length
    ? `<section><h2>Sin nombre</h2><p class="rol">Agentes definidos sin nombre de fantasía en nombres.json</p>${sinNombre.map(tarjeta).join('')}</section>`
    : '';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Organigrama de agentes</title><style>
body{margin:0;background:#16181f;color:#e7e9ee;font:15px/1.45 system-ui,sans-serif;padding:24px 16px 48px}
h1{margin:0 0 4px;font-size:26px}.sub{color:#9ba2b0;margin:0 0 20px;max-width:70ch}
.ley{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:20px;font-size:13px;color:#9ba2b0}.ley i{display:inline-block;width:10px;height:10px;margin-right:5px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
section{background:#1f222b;border:1px solid #2f3440;border-radius:6px;padding:14px;display:grid;gap:8px;align-content:start}
h2{margin:0;font-size:20px}.rol{margin:0;color:#9ba2b0;font-size:13px}
.ag{border-left:4px solid #555;padding:6px 10px;background:#262a35;border-radius:3px;display:grid;gap:3px}
.ag p{margin:0;font-size:13px;color:#c9cdd6}.int{font:12px ui-monospace,monospace;color:#9ba2b0}.uso{font-size:12px;color:#9ba2b0}
.chip{justify-self:start;font-size:11px;font-weight:700;color:#111;padding:0 6px;border-radius:3px}.vac{color:#9ba2b0;border-left-style:dashed}
</style></head><body><h1>Organigrama de agentes</h1>
<p class="sub">Armado en vivo con nombres.json, la definición de cada agente y el registro de rendimiento. Para cambiar un nombre: ficha del agente en la oficina o el archivo ~/.claude/agents/nombres.json.</p>
<div class="ley"><span><i style="background:#e8832a"></i>Opus</span><span><i style="background:#3b9bd6"></i>Sonnet</span><span><i style="background:#a463e0"></i>Fable</span><span><i style="background:#4cb36a"></i>Haiku</span><span><i style="background:#9aa0ab"></i>hereda del que lo lanza</span></div>
<main>${bloques}${sin}</main></body></html>`;
}

/** Ruta GET /organigrama: solo con el token de la oficina (muestra información de los negocios). */
export function registrarOrganigrama(app: FastifyInstance, token: string): void {
  app.get('/organigrama', async (request, reply) => {
    const dado = new URL(request.url, 'http://localhost').searchParams.get('token') ?? '';
    if (!token || dado !== token) return reply.code(403).send('Falta el token de la oficina.');
    return reply.type('text/html; charset=utf-8').send(htmlOrganigrama());
  });
}
