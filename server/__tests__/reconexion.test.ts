/**
 * Personal: la pestaña de la oficina quedaba en "Reconnecting…" / "Recargando…" para siempre cuando el server se
 * reiniciaba. Causas: token nuevo en cada arranque (la pestaña vieja quedaba sin permisos y sus pedidos se ignoraban
 * en silencio) y el hook apagaba la oficina por inactividad aunque estuviera abierta.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

let tmpBase: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

const { PixelAgentsServer } = await import('../src/server.js');
const { AgentStateStore } = await import('../src/agentStateStore.js');
const { handleClientMessage, SIN_PERMISO } = await import('../src/clientMessageHandler.js');
const { tokenEstable } = await import('../src/personal/tokenEstable.js');

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-reconexion-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('token estable', () => {
  it('el standalone conserva el token entre reinicios; el embebido sigue con uno nuevo', async () => {
    const a = new PixelAgentsServer();
    const t1 = (await a.start({ embedded: false, store: new AgentStateStore() })).token;
    a.stop();
    const b = new PixelAgentsServer();
    const t2 = (await b.start({ embedded: false, store: new AgentStateStore() })).token;
    b.stop();
    expect(t2).toBe(t1);

    const c = new PixelAgentsServer();
    const t3 = (await c.start({ embedded: true, store: new AgentStateStore() })).token;
    c.stop();
    expect(t3).not.toBe(t1);
  });

  it('la primera vez hereda el token de server.json (pestañas abiertas antes del cambio)', () => {
    const dir = path.join(tmpBase, '.pixel-agents');
    fs.mkdirSync(dir, { recursive: true });
    const viejo = '0f2c4b1e-1111-4222-8333-944455556666';
    fs.writeFileSync(
      path.join(dir, 'server.json'),
      JSON.stringify({ token: viejo, servesSpa: true }),
    );
    expect(tokenEstable(dir)).toBe(viejo);
    expect(fs.readFileSync(path.join(dir, 'token'), 'utf8')).toBe(viejo);
  });

  it('no hereda el token de un server embebido (VS Code)', () => {
    const dir = path.join(tmpBase, '.pixel-agents');
    fs.mkdirSync(dir, { recursive: true });
    const embebido = '0f2c4b1e-1111-4222-8333-944455556666';
    fs.writeFileSync(
      path.join(dir, 'server.json'),
      JSON.stringify({ token: embebido, servesSpa: false }),
    );
    expect(tokenEstable(dir)).not.toBe(embebido);
  });

  it('ignora un archivo de token corrupto y crea uno válido', () => {
    const dir = path.join(tmpBase, '.pixel-agents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'token'), '../../no-es-un-token');
    const t = tokenEstable(dir);
    expect(t).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokenEstable(dir)).toBe(t);
  });
});

describe('/api/health cuenta las pestañas conectadas (el hook no apaga con alguna abierta)', () => {
  it('sube al conectar y baja al cerrar', async () => {
    const server = new PixelAgentsServer();
    const { port } = await server.start({ embedded: false, store: new AgentStateStore() });
    const salud = async () =>
      ((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()) as { clientes: number })
        .clientes;
    try {
      const antes = await salud();
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { Origin: `http://127.0.0.1:${port}` },
      });
      await new Promise((r) => ws.on('open', r));
      await new Promise((r) => setTimeout(r, 100));
      expect(await salud()).toBe(antes + 1);
      ws.close();
      await new Promise((r) => setTimeout(r, 200));
      expect(await salud()).toBe(antes);
    } finally {
      server.stop();
    }
  });
});

describe('pedidos sin token', () => {
  it('Recargar y asignar oficina contestan con error en vez de ignorarse', () => {
    const store = new AgentStateStore();
    const enviados: Array<Record<string, unknown>> = [];
    const ctx = { store, cache: null, privileged: false };
    handleClientMessage({ type: 'recargarOficina' }, (m) => enviados.push(m), ctx);
    handleClientMessage(
      { type: 'asignarOficina', sala: 'X', proyecto: 'Y' },
      (m) => enviados.push(m),
      ctx,
    );
    handleClientMessage(
      { type: 'abrirProyecto', sala: 'X', accion: 'carpeta' },
      (m) => enviados.push(m),
      ctx,
    );
    expect(enviados).toEqual([
      { type: 'oficinaRecargada', error: SIN_PERMISO },
      { type: 'oficinaAsignada', error: SIN_PERMISO },
      { type: 'proyectoAbierto', sala: 'X', accion: 'carpeta', error: SIN_PERMISO },
    ]);
    store.dispose();
  });
});
