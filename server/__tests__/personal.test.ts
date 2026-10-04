import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { COLOR_CODEX, htmlOrganigrama, registrarOrganigrama } from '../src/personal/organigrama.js';
import {
  costoUsd,
  equipoDe,
  esDeWsl,
  leerPerfilCodex,
  limiteDe,
  metaDeSubagente,
  permisoDe,
  proyectoDe,
  SEPARADOR_META,
} from '../src/personal/personal.js';

describe('personal: proyecto de cada agente (áreas)', () => {
  it.each([
    [{ cwd: 'C:\\Users\\juanf\\.claude\\brain' }, 'Brain'],
    [{ cwd: 'C:\\Users\\juanf\\.claude' }, 'Brain'],
    [{ projectDir: 'C:\\Users\\juanf\\.claude\\projects\\C--Users-juanf--claude-brain' }, 'Brain'],
    [{ cwd: 'C:\\Users\\juanf\\Documents\\Chaina\\Centro de control' }, 'Chaina'],
    [{ cwd: 'C:\\Users\\juanf\\Documents\\IA Tools\\Poker_App' }, 'Poker'],
    [{ cwd: 'C:\\Users\\juanf\\orca\\workspaces\\Poker_App\\tests-deudas' }, 'Poker'],
    [
      { projectDir: 'x\\projects\\C--Users-juanf-Documents-IA-Tools-Finanzas-personales' },
      'Finanzas',
    ],
    [{ cwd: '/home/juanf/Documents/Claude/Projects/ERP/.claude/worktrees/cobros' }, 'ERP'],
    [{ projectDir: '/x/-home-juanf-Documents-Claude-Projects-ERP' }, 'ERP'],
    [{ cwd: 'C:\\Users\\juanf\\ev\\circuito\\opus' }, 'Pruebas'],
  ])('%o → %s', (ctx, esperado) => {
    expect(proyectoDe(ctx)).toBe(esperado);
  });
  it('carpeta desconocida: sin proyecto (queda el comportamiento original)', () => {
    expect(proyectoDe({ cwd: 'D:\\otra\\cosa' })).toBeUndefined();
  });
});

describe('personal: organigrama', () => {
  it('capa de proyectos: cada manager con su equipo sacado de tools: Agent(…), fuera de las áreas', () => {
    const html = htmlOrganigrama({
      nombres: {
        ceo: 'Juan',
        roles: { Juan: 'CEO', Rulo: 'Manager del ERP', Jere: 'Contabilidad' },
        agentes: {
          'manager-erp': 'Rulo · manager ERP',
          'conciliador-cobros': 'Jere · cobros',
          verificador: 'Pepe · verificador',
        },
        descartables: [],
      },
      defs: new Map([
        [
          'manager-erp',
          {
            modelo: 'sonnet',
            archivo: 'm.md',
            proyecto: 'ERP',
            equipo: equipoDe('Read, Grep, Agent(conciliador-cobros, verificador, fantasma)'),
          },
        ],
        ['conciliador-cobros', { modelo: 'sonnet', archivo: 'b.md', proyecto: 'ERP' }],
        ['verificador', { modelo: 'sonnet', archivo: 'v.md', proyecto: 'Todos' }],
      ]),
      uso: new Map(),
    });
    const pos = (t: string) => html.indexOf(t);
    const capa = html.slice(
      pos('<section class="proyectos">'),
      pos('<section class="compartidos">'),
    );
    expect(pos('<section class="proyectos">')).toBeGreaterThan(pos('class="ceo"'));
    expect(capa).toContain('<h3>ERP</h3>');
    expect(capa).toContain('<b>manager ERP</b>');
    expect(capa).toContain('<b>Jere · cobros</b>');
    expect(capa).toContain('conciliador-cobros · propio · ERP');
    // Los globales no se repiten como tarjeta: van como fichas de "puede llamar".
    expect(capa).toContain('<span class="ch">Pepe · verificador</span>');
    expect(capa).not.toContain('<b>verificador</b>');
    expect(capa).toContain('fantasma · no está definido');
    expect(capa).toContain('class="roja"');
    // El global aparece una sola vez, en servicios compartidos.
    const compartidos = html.slice(pos('<section class="compartidos">'), pos('<details'));
    expect(compartidos).toContain('<b>verificador</b>');
    // La persona del manager no se repite en las áreas.
    expect(html.slice(pos('<main>'))).not.toContain('<b>Rulo</b>');
  });
  it('contratistas: Codex con sus perfiles, quién los lanza y el permiso de datos', () => {
    const html = htmlOrganigrama({
      nombres: {
        ceo: 'Juan',
        roles: { Juan: 'CEO', Pepe: 'Revisa código', Tomo: 'Escribe código' },
        agentes: {},
        descartables: [],
        externos: { codex: 'Pepe · Codex (GPT-6)', pi: 'Tomo · Pi (DeepSeek)' },
      },
      defs: new Map(),
      uso: new Map(),
      codex: new Map([
        [
          'revisor',
          leerPerfilCodex(
            'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "medium"\nsandbox_mode = "read-only"\n[windows]\nsandbox = "unelevated"\n',
            'r.toml',
          ),
        ],
      ]),
    });
    const pos = (t: string) => html.indexOf(t);
    const ct = html.slice(pos('<section class="contratistas">'), pos('<details'));
    expect(ct).toContain('Codex · OpenAI GPT-6');
    expect(ct).toContain('<b>perfil revisor</b>');
    expect(ct).toContain('gpt-6.1-sol · medium');
    expect(ct).toContain('class="chip per-lee"');
    expect(ct).toContain('datos de terceros: OK (4/10)');
    expect(ct).toContain('Pi · DeepSeek');
    // El perfil de Codex va con el color de Codex.
    expect(ct).toContain(COLOR_CODEX);
  });
  it('permisoDe y leerPerfilCodex: qué puede hacer cada agente', () => {
    expect(permisoDe(undefined)).toBe('todo');
    expect(permisoDe('Read, Grep, Glob, Bash')).toBe('lee');
    expect(permisoDe('Read, Edit, Write')).toBe('escribe');
    // Escribir afuera por un MCP también es escribir (n8n-automatizador); leer por MCP, no.
    expect(
      permisoDe('Read, mcp__n8n-mcp__n8n_get_workflow, mcp__n8n-mcp__n8n_create_workflow'),
    ).toBe('escribe');
    expect(permisoDe('Read, mcp__supabase__apply_migration')).toBe('escribe');
    expect(
      permisoDe('Read, mcp__supabase-lectura__execute_sql, mcp__supabase-lectura__list_tables'),
    ).toBe('lee');
    // Nombres reales de analista-marketing que contienen "set" o "update" sin ser ese verbo.
    expect(
      permisoDe(
        'Read, mcp__meta-ads__ads_get_custom_audience_adsets, mcp__meta-ads__ads_get_ad_account_custom_audiences',
      ),
    ).toBe('lee');
    // Un manager que puede lanzar a un agente que escribe no escribe él.
    expect(permisoDe('Read, Agent(corrector, Write)')).toBe('lee');
    expect(leerPerfilCodex('sandbox_mode = "workspace-write"', 'x').permiso).toBe('escribe');
    expect(leerPerfilCodex('model = "gpt-6-luna"', 'x')).toMatchObject({
      modelo: 'gpt-6-luna',
      permiso: 'todo',
    });
  });
  it('equipoDe: lee la lista de Agent(…) y nada más', () => {
    expect(equipoDe('Read, Agent(a, b ,c)')).toEqual(['a', 'b', 'c']);
    expect(equipoDe('Read, Grep')).toBeUndefined();
    expect(equipoDe(undefined)).toBeUndefined();
  });
  it('arma una página aunque no haya nombres ni agentes', () => {
    expect(htmlOrganigrama()).toContain('<title>Organigrama de agentes</title>');
  });
  it('tipo empresa: CEO arriba, áreas, puestos y agentes con el personaje de su persona', () => {
    const html = htmlOrganigrama({
      nombres: {
        ceo: 'Juan',
        roles: { Juan: 'CEO', Pepe: 'Revisa código', Jere: 'Contabilidad', Zoe: 'Algo nuevo' },
        agentes: { 'buscador-de-bugs': 'Pepe · bugs', 'conciliador-cobros': 'Jere · cobros' },
        descartables: [],
        externos: { pi: 'Pepe · Pi (DeepSeek)' },
      },
      defs: new Map([
        ['buscador-de-bugs', { modelo: 'sonnet', archivo: 'a.md', proyecto: 'Todos' }],
        ['conciliador-cobros', { modelo: 'sonnet', archivo: 'b.md', proyecto: 'ERP' }],
        ['sin-bautizar', { archivo: 'c.md', proyecto: 'Todos' }],
      ]),
      uso: new Map(),
    });
    const pos = (t: string) => html.indexOf(t);
    // Áreas por defecto, en orden, y la persona sin área en "Otros puestos".
    expect(pos('<h2>Ingeniería</h2>')).toBeGreaterThan(0);
    expect(pos('<h2>Finanzas</h2>')).toBeGreaterThan(pos('<h2>Ingeniería</h2>'));
    expect(pos('<h2>Otros puestos</h2>')).toBeGreaterThan(pos('<h2>Finanzas</h2>'));
    expect(pos('<b>Zoe</b>')).toBeGreaterThan(pos('<h2>Otros puestos</h2>'));
    // El agente del ERP corre en WSL: lleva la etiqueta; el global no.
    const cobros = html.slice(pos('<b>cobros</b>'), pos('<b>cobros</b>') + 400);
    expect(cobros).toContain('class="chip wsl"');
    const bugs = html.slice(pos('<b>bugs</b>'), pos('<b>bugs</b>') + 400);
    expect(bugs).not.toContain('class="chip wsl"');
    // Puesto del agente = lo que va después de "·"; su avatar es el de la persona (Pepe = 2.º → char_1).
    expect(html).toContain('<b>bugs</b>');
    expect(html).toMatch(/char_1\.png[^>]*><\/span><div>\s*<b>bugs<\/b>/);
    expect(html).toContain('<b>Pi (DeepSeek)</b>');
    expect(html).toContain('<h2>Sin nombre</h2>');
    expect(pos('class="ceo"')).toBeLessThan(pos('<main>'));
  });
  it('sin el token de la oficina responde 403; con el token, la página', async () => {
    const app = Fastify();
    registrarOrganigrama(app, 'secreto');
    expect((await app.inject({ url: '/organigrama' })).statusCode).toBe(403);
    expect((await app.inject({ url: '/organigrama?token=otro' })).statusCode).toBe(403);
    const ok = await app.inject({ url: '/organigrama?token=secreto' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('text/html');
    await app.close();
  });
});

describe('personal: costo equivalente a precio de API', () => {
  it('cobra entrada, caché y salida según el modelo', () => {
    // Sonnet 5.5: 2 entrada · 4 caché 1 h · 0,20 lectura · 10 salida (US$ por millón)
    const u = {
      input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    };
    expect(costoUsd('claude-sonnet-5-5', u)).toBeCloseTo(2 + 4 + 0.2 + 10, 6);
  });
  it('Opus 5.5 y Fable 5.1 tienen su propia lectura de caché', () => {
    expect(costoUsd('claude-opus-5-5', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2, 6);
    expect(costoUsd('claude-fable-5-1', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(
      0.25,
      6,
    );
  });
  it('modelo desconocido no suma', () => {
    expect(costoUsd('<synthetic>', { output_tokens: 1000 })).toBe(0);
  });
});

describe('personal: meta del sub-agente en el status', () => {
  it('lleva tipo y modelo pedido, separados por el carácter invisible', () => {
    const s = metaDeSubagente({ subagent_type: 'tipo-que-no-existe', model: 'opus' });
    expect(s.startsWith(SEPARADOR_META)).toBe(true);
    expect(JSON.parse(s.slice(1))).toEqual({ t: 'tipo-que-no-existe', m: 'opus', e: null });
  });
  it('sin tipo es general-purpose y sin modelo hereda', () => {
    expect(JSON.parse(metaDeSubagente({}).slice(1))).toMatchObject({
      t: 'general-purpose',
      m: 'hereda',
    });
  });
});

describe('personal: dormido cuando se acaba la cuota', () => {
  it('el mensaje sintético de rate_limit lo duerme hasta la hora de vuelta', () => {
    expect(
      limiteDe({
        type: 'assistant',
        error: 'rate_limit',
        isApiErrorMessage: true,
        quotaLimits: { status: 'rejected', resetsAt: 1790873400 },
        message: { model: '<synthetic>' },
      }),
    ).toEqual({ dormido: true, hasta: 1790873400 });
  });
  it('sin hora de vuelta duerme igual (hasta = 0)', () => {
    expect(limiteDe({ type: 'assistant', error: 'rate_limit' })).toEqual({
      dormido: true,
      hasta: 0,
    });
  });
  it('una respuesta real del modelo lo despierta', () => {
    expect(limiteDe({ type: 'assistant', message: { model: 'claude-opus-5-5' } })).toEqual({
      dormido: false,
    });
  });
  it('no mira el texto: una herramienta que imprime "session limit" no lo duerme', () => {
    expect(limiteDe({ type: 'user' })).toBeNull();
    expect(limiteDe({ type: 'assistant', message: { model: '<synthetic>' } })).toBeNull();
  });
});

describe('personal: sesiones de WSL', () => {
  it.each([
    ['\\\\wsl.localhost\\Ubuntu\\home\\juanf\\.claude\\projects\\x\\a.jsonl', true],
    ['\\\\wsl$\\Ubuntu\\home\\juanf\\.claude\\projects\\x\\a.jsonl', true],
    ['//wsl.localhost/Ubuntu/home/juanf/a.jsonl', true],
    ['C:\\Users\\juanf\\.claude\\projects\\x\\a.jsonl', false],
    ['/home/juanf/.claude/projects/x/a.jsonl', false],
  ])('%s → %s', (archivo, esperado) => {
    expect(esDeWsl(archivo)).toBe(esperado);
  });
});
