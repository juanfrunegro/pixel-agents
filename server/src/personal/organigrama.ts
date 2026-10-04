/**
 * Personal (copia de juanfrunegro): organigrama en vivo en GET /organigrama?token=…, armado con nombres.json, la
 * definición de cada agente y el registro de rendimiento (~/.claude/logs). Siempre al día: no hay página que mantener.
 */
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { aspectoDePersona, personaDe } from '../../../core/src/aspectoPersonal.js';
import { skinDeNombre, SKINS_MARVEL } from '../../../core/src/skinsMarvel.js';
import { PALETTE_COUNT } from '../constants.js';
import type { Definicion, Nombres } from './personal.js';
import { definiciones, esDeWsl, leerNombres, ordenPersonas } from './personal.js';

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

/** Proyectos que corren en WSL (otra cuenta, Max): sus agentes llevan la etiqueta "WSL". */
const PROYECTOS_WSL = new Set(['ERP']);
const COLOR_WSL = '#14b8a6';

/** Áreas de la empresa por defecto (se pisan con "areas" en nombres.json: { "Área": ["Persona", …] }). */
const AREAS: Record<string, string[]> = {
  Ingeniería: ['Pepe', 'Tomo', 'Gibi'],
  Diseño: ['Murga'],
  Operaciones: ['Maxi', 'Vincho'],
  Finanzas: ['Nico', 'Jere'],
  Comercial: ['Fran', 'Cami'],
  Conocimiento: ['Lucho', 'Santi'],
};

/** Personaje pixelado de la persona: el mismo sprite (y tono) que tiene en la oficina. */
function avatar(persona: string, orden: string[], grande = false): string {
  // tanda 5: una persona que se llama como un personaje de Marvel con skin (Hulk, Thor…) lleva su skin
  const skin = skinDeNombre(persona);
  if (skin) {
    return `<span class="av${grande ? ' g' : ''}" style="background-image:url(/assets/marvel/${skin}.png)" aria-hidden="true"></span>`;
  }
  const a = aspectoDePersona(persona, orden, PALETTE_COUNT) ?? { palette: 0, hueShift: 0 };
  const filtro = a.hueShift ? `;filter:hue-rotate(${a.hueShift}deg)` : '';
  return `<span class="av${grande ? ' g' : ''}" style="background-image:url(/assets/characters/char_${a.palette}.png)${filtro}" aria-hidden="true"></span>`;
}

/** Puestos de los externos de Marvel (solo estética: siempre en el organigrama, tengan o no un agente hoy). */
const PUESTOS_MARVEL: Record<string, string> = {
  hulk: 'Refactors de fuerza bruta',
  spiderman: 'Telarañas de dependencias',
  ironman: 'Arquitectura e infra',
  thor: 'Deploys con martillo',
  deadpool: 'QA de cuarta pared',
};

/**
 * Clave de localStorage donde la oficina (mismo origen) publica qué skins de Marvel hay en pantalla ahora; la página
 * la lee para marcar "en la oficina". Ver webview-ui/src/personal/skins.ts (publicarMarvelActivos).
 */
export const CLAVE_MARVEL_ACTIVOS = 'pixel.marvelActivos';

function seccionExternos(orden: string[]): string {
  const tarjetas = SKINS_MARVEL.map(
    (s) =>
      `<div class="mv" data-skin="${s.id}">${avatar(s.nombre, orden, true)}<div><b>${esc(s.nombre)}</b><span class="rol">${esc(PUESTOS_MARVEL[s.id])}</span><span class="est">disponible</span></div></div>`,
  ).join('');
  return `<section class="externos"><h2>Externos · tercerizados</h2><p class="rol">Consultores de Marvel: solo estética. Un agente con su nombre trabaja con su skin; el resto del tiempo esperan que los llamen.</p><div class="mvs">${tarjetas}</div></section>
<script>(function(){function ver(){var a=[];try{var d=JSON.parse(localStorage.getItem('${CLAVE_MARVEL_ACTIVOS}')||'null');if(d&&Date.now()-d.t<20000)a=d.ids||[]}catch(e){}
document.querySelectorAll('.mv').forEach(function(el){var on=a.indexOf(el.getAttribute('data-skin'))>=0;el.classList.toggle('on',on);el.querySelector('.est').textContent=on?'en la oficina':'disponible'})}
ver();setInterval(ver,3000);window.addEventListener('storage',ver)})();</script>`;
}

interface Datos {
  nombres: Nombres;
  defs: Map<string, Definicion>;
  uso: Map<string, Uso>;
}

export function htmlOrganigrama(
  datos: Datos = { nombres: leerNombres(), defs: definiciones(), uso: usoPorAgente() },
): string {
  const { nombres: n, defs, uso } = datos;
  const roles = (n.roles ?? {}) as Record<string, string>;
  const externos = (n.externos ?? {}) as Record<string, string>;
  const orden = ordenPersonas(n);
  const ceo = personaDe(n.ceo);

  // Persona → sus agentes (internos definidos y externos).
  const equipo = new Map<string, string[]>();
  for (const p of orden) equipo.set(p, []);
  const sinNombre: string[] = [];
  for (const interno of defs.keys()) {
    const nombre = n.agentes[interno];
    if (!nombre) sinNombre.push(interno);
    else equipo.set(personaDe(nombre), [...(equipo.get(personaDe(nombre)) ?? []), interno]);
  }
  for (const [clave, nombre] of Object.entries(externos)) {
    equipo.set(personaDe(nombre), [...(equipo.get(personaDe(nombre)) ?? []), `externo:${clave}`]);
  }

  // Área → personas. Las que no están en ninguna área van a "Otros puestos".
  const areasConfig =
    n.areas && typeof n.areas === 'object' ? (n.areas as Record<string, string[]>) : AREAS;
  const areas = new Map<string, string[]>();
  // Managers de proyecto (`manager-<proyecto>`): van en su propia capa, entre el CEO y las áreas.
  const managers = [...defs.keys()].filter((k) => k.startsWith('manager-')).sort();
  const personaDeAgente = (interno: string): string =>
    n.agentes[interno] ? personaDe(n.agentes[interno]) : '';
  const ubicadas = new Set<string>([ceo, ...managers.map(personaDeAgente).filter(Boolean)]);
  for (const [area, personas] of Object.entries(areasConfig)) {
    const hay = (Array.isArray(personas) ? personas : []).filter((p) => equipo.has(p));
    hay.forEach((p) => ubicadas.add(p));
    if (hay.length) areas.set(area, hay);
  }
  const resto = [...equipo.keys()].filter((p) => !ubicadas.has(p));
  if (resto.length) areas.set('Otros puestos', resto);

  const agente = (interno: string, persona: string): string => {
    if (interno.startsWith('externo:')) {
      const k = interno.slice(8);
      const puesto = externos[k].split(' · ').slice(1).join(' · ') || k;
      return `<li class="ag ext">${avatar(persona, orden)}<div><b>${esc(puesto)}</b><span class="int">fuera de Claude Code · no aparece en la oficina</span></div></li>`;
    }
    const d = defs.get(interno)!;
    const u = uso.get(interno);
    const nombre = n.agentes[interno] ?? interno;
    const puesto = nombre.split(' · ').slice(1).join(' · ') || interno;
    const rinde = u
      ? `${u.veces} ${u.veces === 1 ? 'vez' : 'veces'} · US$ ${(u.costo / u.veces).toFixed(2)} promedio · notas ${u.bien} bien / ${u.mal} mal · última ${esc(u.ultima)}`
      : 'sin uso registrado todavía';
    return `<li class="ag" style="border-left-color:${color(d.modelo)}">${avatar(persona, orden)}<div>
      <b>${esc(puesto)}</b> <span class="chip" style="background:${color(d.modelo)}">${esc(d.modelo ?? 'hereda')}${d.esfuerzo ? ' · ' + esc(d.esfuerzo) : ''}</span>${PROYECTOS_WSL.has(d.proyecto) || esDeWsl(d.archivo) ? ' <span class="chip wsl">WSL</span>' : ''}
      <span class="int">${esc(interno)} · ${esc(d.proyecto)}</span>
      <p>${esc((d.descripcion ?? '').slice(0, 200))}</p><span class="uso">${rinde}</span></div></li>`;
  };

  const puesto = (p: string): string => {
    const internos = equipo.get(p) ?? [];
    return `<div class="puesto"><div class="jefe">${avatar(p, orden, true)}<div><b>${esc(p)}</b><span class="rol">${esc(roles[p] ?? '')}</span></div></div>
      ${internos.length ? `<ul>${internos.map((i) => agente(i, p)).join('')}</ul>` : '<p class="vac">Puesto sin agente todavía</p>'}</div>`;
  };

  const miembro = (interno: string): string => {
    const d = defs.get(interno);
    const nombre = n.agentes[interno] ?? interno;
    const p = personaDeAgente(interno);
    const origen = !d
      ? 'no está definido'
      : d.proyecto === 'Todos'
        ? 'global'
        : `propio · ${d.proyecto}`;
    return `<li class="mi">${p ? avatar(p, orden) : ''}<div><b>${esc(nombre)}</b><span class="int">${esc(interno)} · ${esc(origen)}</span></div></li>`;
  };
  const proyectos = managers.length
    ? `<section class="proyectos"><h2>Proyectos</h2><p class="rol">Cada manager reparte el trabajo de su proyecto, revisa con evidencia y responde ante el CEO. Su equipo sale de la línea <code>tools: Agent(…)</code> de su archivo: solo puede lanzar a esos.</p><div class="pys">${managers
        .map((m) => {
          const d = defs.get(m)!;
          const p = personaDeAgente(m);
          const equipoM = d.equipo ?? [];
          return `<div class="py"><h3>${esc(d.proyecto)}</h3><ul>${agente(m, p)}</ul>${
            equipoM.length
              ? `<ul class="eq">${equipoM.map(miembro).join('')}</ul>`
              : '<p class="vac">Sin equipo: le falta Agent(…) en tools</p>'
          }</div>`;
        })
        .join('')}</div></section>`
    : '';

  const bloques = [...areas.entries()]
    .map(
      ([area, personas]) =>
        `<section class="area"><h2>${esc(area)}</h2>${personas.map(puesto).join('')}</section>`,
    )
    .join('');
  const sin = sinNombre.length
    ? `<section class="area"><h2>Sin nombre</h2><p class="rol">Agentes definidos sin nombre de fantasía en nombres.json</p><ul>${sinNombre
        .map((i) => agente(i, ''))
        .join('')}</ul></section>`
    : '';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Organigrama de agentes</title><style>
*{box-sizing:border-box}
body{margin:0;background:#16181f;color:#e7e9ee;font:15px/1.45 system-ui,sans-serif;padding:24px 16px 48px}
h1{margin:0 0 4px;font-size:26px}.sub{color:#9ba2b0;margin:0 0 16px;max-width:75ch}
.ley{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:24px;font-size:13px;color:#9ba2b0}.ley i{display:inline-block;width:10px;height:10px;margin-right:5px}
.av{flex:none;width:32px;height:64px;background-size:224px 192px;background-position:-32px 0;image-rendering:pixelated;margin:-14px 0 -6px}
.av.g{width:48px;height:96px;background-size:336px 288px;background-position:-48px 0;margin:-22px 0 -8px}
.ceo{display:flex;justify-content:center;position:relative;padding-bottom:28px}
.ceo .tarjeta{display:flex;gap:12px;align-items:center;background:#262a35;border:2px solid #e8832a;border-radius:6px;padding:14px 20px 10px}
.ceo .tarjeta b{font-size:22px;display:block}
.ceo:after{content:"";position:absolute;bottom:0;left:50%;height:28px;border-left:2px solid #3a4050}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;border-top:2px solid #3a4050;padding-top:20px}
.area{background:#1f222b;border:1px solid #2f3440;border-radius:6px;padding:12px;display:grid;gap:12px;align-content:start;position:relative}
.area:before{content:"";position:absolute;top:-21px;left:50%;height:20px;border-left:2px solid #3a4050}
h2{margin:0;font-size:19px;letter-spacing:.02em}
.puesto{display:grid;gap:6px}
.jefe{display:flex;gap:10px;align-items:center;padding-top:14px}.jefe b{font-size:17px;display:block}
.rol{color:#9ba2b0;font-size:13px}
ul{list-style:none;margin:0 0 0 22px;padding:0 0 0 12px;border-left:2px solid #3a4050;display:grid;gap:6px}
.ag{display:flex;gap:8px;align-items:flex-start;border-left:4px solid #555;padding:14px 10px 6px 6px;background:#262a35;border-radius:3px}
.ag div{display:grid;gap:2px;min-width:0}.ag.ext{border-left-style:dashed}
.ag p{margin:0;font-size:13px;color:#c9cdd6}.int{font:12px ui-monospace,monospace;color:#9ba2b0;overflow-wrap:anywhere}.uso{font-size:12px;color:#9ba2b0}
.externos{margin-top:22px;background:#1f222b;border:1px dashed #4a5163;border-radius:6px;padding:14px 12px}
.mvs{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:10px}
.mv{display:flex;gap:10px;align-items:center;background:#262a35;border-left:4px dashed #6b7385;border-radius:3px;padding:18px 10px 8px}
.mv div{display:grid;gap:2px}.mv b{font-size:16px}
.est{font-size:11px;font-weight:700;justify-self:start;padding:0 6px;border-radius:3px;background:#3a4050;color:#c9cdd6}
.mv.on{border-left:4px solid #4cb36a}.mv.on .est{background:#4cb36a;color:#111}
.proyectos{margin:0 0 28px;background:#1f222b;border:1px solid #e8832a55;border-radius:6px;padding:14px 12px;position:relative}
.proyectos:after{content:"";position:absolute;bottom:-29px;left:50%;height:28px;border-left:2px solid #3a4050}
.pys{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;margin-top:10px}
.py{display:grid;gap:8px;align-content:start}.py h3{margin:0;font-size:17px}
.mi{display:flex;gap:8px;align-items:center;padding:12px 8px 4px 6px;background:#262a35;border-radius:3px}.mi div{display:grid;gap:2px;min-width:0}
.chip{font-size:11px;font-weight:700;color:#111;padding:0 6px;border-radius:3px;white-space:nowrap}.chip.wsl{background:${COLOR_WSL};color:#fff}.vac{margin:0 0 0 34px;color:#9ba2b0;font-size:13px}
</style></head><body><h1>Organigrama de agentes</h1>
<p class="sub">Armado en vivo con nombres.json, la definición de cada agente y el registro de rendimiento. Cada persona tiene su personaje, el mismo que usa en la oficina. Para cambiar un nombre: ficha del agente en la oficina o ~/.claude/agents/nombres.json (ahí también se cambian las áreas, con la clave "areas").</p>
<div class="ley"><span><i style="background:#e8832a"></i>Opus</span><span><i style="background:#3b9bd6"></i>Sonnet</span><span><i style="background:#a463e0"></i>Fable</span><span><i style="background:#4cb36a"></i>Haiku</span><span><i style="background:#9aa0ab"></i>hereda del que lo lanza</span><span><i style="background:${COLOR_WSL}"></i>WSL: corre en WSL con la cuenta Max (el resto, en Windows con la Pro)</span></div>
<div class="ceo"><div class="tarjeta">${avatar(ceo, orden, true)}<div><b>${esc(n.ceo)}</b><span class="rol">${esc(roles[ceo] ?? 'CEO')}</span><br><span class="int">sesión principal · en la oficina cada sesión tiene su propio personaje</span></div></div></div>
${proyectos}<main>${bloques}${sin}</main>${seccionExternos(orden)}</body></html>`;
}

/** Ruta GET /organigrama: solo con el token de la oficina (muestra información de los negocios). */
export function registrarOrganigrama(app: FastifyInstance, token: string): void {
  app.get('/organigrama', async (request, reply) => {
    const dado = new URL(request.url, 'http://localhost').searchParams.get('token') ?? '';
    if (!token || dado !== token) return reply.code(403).send('Falta el token de la oficina.');
    return reply.type('text/html; charset=utf-8').send(htmlOrganigrama());
  });
}
