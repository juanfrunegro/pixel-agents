import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { htmlOrganigrama, registrarOrganigrama } from '../src/personal/organigrama.js';
import {
  costoUsd,
  esDeWsl,
  limiteDe,
  metaDeSubagente,
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
