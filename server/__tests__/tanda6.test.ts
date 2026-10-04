/**
 * Tanda 6: correcciones de los bugs confirmados del server personal (4/10/2026).
 * HOME y USERPROFILE ya apuntan a una carpeta temporal (__tests__/homeTemporal.ts).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { handleClientMessage } from '../src/clientMessageHandler.js';
import { guardarExtra } from '../src/personal/carpetas.js';
import { PixelAgentsServer } from '../src/server.js';

const home = (): string => os.homedir();
const nombresJson = (): string => path.join(home(), '.claude', 'agents', 'nombres.json');

/** Módulos con estado propio (caché de definiciones, WeakMap de sesiones): uno nuevo por test. */
async function fresco() {
  vi.resetModules();
  return {
    personal: await import('../src/personal/personal.js'),
    org: await import('../src/personal/organigrama.js'),
  };
}

beforeEach(() => {
  if (!home().includes('pxl-home-')) throw new Error(`HOME no es temporal: ${home()}`);
  fs.rmSync(path.join(home(), '.claude'), { recursive: true, force: true });
  fs.rmSync(path.join(home(), '.pixel-agents'), { recursive: true, force: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('renameAgent exige token y limita la clave', () => {
  it('sin privilegio no escribe nombres.json ni emite nada', () => {
    const store = new AgentStateStore();
    const enviados: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m) => enviados.push(m));
    const clave = 'k'.repeat(50_000);
    // ctx SIN privileged (como una pestaña sin ?token=)
    handleClientMessage({ type: 'renameAgent', clave, nombre: 'Intruso' }, () => {}, {
      store,
      cache: null,
    });
    expect(fs.existsSync(nombresJson())).toBe(false);
    expect(enviados.some((m) => m.type === 'agentNamesLoaded')).toBe(false);
  });

  it('con privilegio guarda el nombre, pero una clave de más de 80 caracteres se rechaza', async () => {
    const { personal } = await fresco();
    personal.guardarNombre('k'.repeat(81), 'Intruso');
    expect(fs.existsSync(nombresJson())).toBe(false);
    personal.guardarNombre('foo', 'Pepe');
    expect(JSON.parse(fs.readFileSync(nombresJson(), 'utf8')).agentes.foo).toBe('Pepe');
  });

  it('control: setApagado sin privilegio NO escribe', () => {
    const store = new AgentStateStore();
    handleClientMessage({ type: 'setApagado', opcion: 'nunca' }, () => {}, { store, cache: null });
    expect(fs.existsSync(path.join(home(), '.pixel-agents', 'apagado.json'))).toBe(false);
  });
});

describe('un JSON roto no se pisa con los valores por defecto', () => {
  it('guardarNombre sobre un nombres.json con error de sintaxis lo deja intacto', async () => {
    const { personal } = await fresco();
    fs.mkdirSync(path.dirname(nombresJson()), { recursive: true });
    // Edición a mano con una coma de más: JSON inválido
    const roto =
      '{"ceo":"Jefe","agentes":{},"roles":{"Pepe":"Ingeniería"},"areas":{"X":["Pepe"]},"externos":{"codex":"Tomo"},}';
    fs.writeFileSync(nombresJson(), roto);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    personal.guardarNombre('algo', 'Nuevo');
    expect(fs.readFileSync(nombresJson(), 'utf8')).toBe(roto);
  });

  it('si nombres.json no existe, guardarNombre lo crea con los valores por defecto', async () => {
    const { personal } = await fresco();
    personal.guardarNombre('algo', 'Nuevo');
    const d = JSON.parse(fs.readFileSync(nombresJson(), 'utf8'));
    expect(d.ceo).toBe('CEO');
    expect(d.agentes.algo).toBe('Nuevo');
  });

  it('guardarExtra sobre carpetas.json roto lo deja intacto', () => {
    const ruta = path.join(home(), '.pixel-agents', 'carpetas.json');
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const roto = '{"raiz":"D:\\\\Mis proyectos","extras":[{"nombre":"a","ruta":"C:\\\\a"}],';
    fs.writeFileSync(ruta, roto);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    guardarExtra({ nombre: 'b', ruta: 'C:\\b' }, ruta);
    expect(fs.readFileSync(ruta, 'utf8')).toBe(roto);
  });

  it('si carpetas.json no existe, guardarExtra lo crea', () => {
    const ruta = path.join(home(), '.pixel-agents', 'carpetas.json');
    guardarExtra({ nombre: 'b', ruta: 'C:\\b' }, ruta);
    expect(JSON.parse(fs.readFileSync(ruta, 'utf8')).extras).toEqual([
      { nombre: 'b', ruta: 'C:\\b' },
    ]);
  });
});

describe('leerJsonl salta la línea mala y conserva el resto', () => {
  const log = (): string => path.join(home(), '.claude', 'logs', 'rendimiento-agentes.jsonl');
  const fila = (id: string) =>
    JSON.stringify({ agente: 'foo', costo_usd: 0.5, agent_id: id, fecha: '2026-10-01T00:00:00Z' });
  const preparar = (lineas: string[]) => {
    fs.mkdirSync(path.dirname(log()), { recursive: true });
    fs.writeFileSync(log(), lineas.join('\n') + '\n');
    fs.mkdirSync(path.join(home(), '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(home(), '.claude', 'agents', 'foo.md'),
      '---\nname: foo\ndescription: x\nmodel: sonnet\n---\ncuerpo\n',
    );
    fs.writeFileSync(
      nombresJson(),
      JSON.stringify({ ceo: 'CEO', agentes: { foo: 'Pepe · Dev' }, descartables: [] }),
    );
  };

  it('control: con el log sano el organigrama muestra el uso', async () => {
    const { org } = await fresco();
    preparar([fila('a'), fila('b')]);
    const html = org.htmlOrganigrama();
    expect(html).toContain('2 veces');
  });

  it('con una última línea a medio escribir el uso de las demás se sigue mostrando', async () => {
    const { org } = await fresco();
    preparar([fila('a'), fila('b'), '{"agente":"foo","costo_us']);
    const html = org.htmlOrganigrama();
    expect(html).toContain('2 veces');
  });
});

describe('shutdownServer pasa por la señal de apagado (server.stop)', () => {
  it('emite SIGTERM (lo escucha shutdown() de cli.ts) y deja un process.exit de respaldo', async () => {
    const store = new AgentStateStore();
    const server = new PixelAgentsServer();
    const cfg = await server.start({ store, embedded: false });
    const serverJson = path.join(home(), '.pixel-agents', 'server.json');
    const entrada = path.join(home(), '.pixel-agents', 'servers', `${cfg.pid}-${cfg.port}.json`);
    expect(fs.existsSync(serverJson)).toBe(true);
    expect(fs.existsSync(entrada)).toBe(true);

    const salir = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    // Hace de shutdown() de cli.ts: server.stop() borra los archivos.
    const alSigterm = vi.fn(() => server.stop());
    process.once('SIGTERM', alSigterm);
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    handleClientMessage({ type: 'shutdownServer' }, () => {}, {
      store,
      cache: null,
      privileged: true,
    });
    vi.advanceTimersByTime(300);
    expect(alSigterm).toHaveBeenCalledTimes(1);
    expect(salir).not.toHaveBeenCalled(); // no sale de golpe: primero la señal
    expect(fs.existsSync(serverJson)).toBe(false);
    expect(fs.existsSync(entrada)).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(salir).toHaveBeenCalledWith(0); // respaldo si nada hubiera escuchado
    vi.useRealTimers();
    process.removeListener('SIGTERM', alSigterm);
  });
});

describe('la primera lectura del transcript no cuenta dos veces la señal', () => {
  it('2 errores seguidos en el transcript cuentan 2, no 3', async () => {
    const { personal } = await fresco();
    const error = (id: string) =>
      JSON.stringify({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'boom' }],
        },
      });
    const archivo = path.join(home(), 'sesion-b5.jsonl');
    fs.writeFileSync(archivo, [error('t1'), error('t2')].join('\n') + '\n');
    const agent = { jsonlFile: archivo } as never;
    const store = new AgentStateStore();
    const mensajes: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m) => mensajes.push(m));

    // El watcher lee el archivo y le pasa a registrarUso el registro que acaba de leer (el 2.º, ya presente en el archivo)
    personal.registrarUso(1, agent, store, JSON.parse(error('t2')));

    const info = mensajes.find((m) => m.type === 'agentInfo');
    expect(info).toBeDefined();
    expect(info!.errores).toBe(2);
  });
});

describe('la info de sesión se reinicia al cambiar jsonlFile (/clear)', () => {
  it('tras /clear el costo es el de la sesión nueva sola', async () => {
    const { personal } = await fresco();
    const uso = (msgId: string) =>
      JSON.stringify({
        type: 'assistant',
        requestId: `req-${msgId}`,
        message: {
          id: msgId,
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 1_000_000, output_tokens: 0 },
        },
      });
    const a = path.join(home(), 'sesion-a.jsonl');
    const b = path.join(home(), 'sesion-b.jsonl');
    fs.writeFileSync(a, uso('mA') + '\n');
    fs.writeFileSync(b, uso('mB') + '\n');
    const agent = { jsonlFile: a } as never;
    const store = new AgentStateStore();
    expect(personal.mensajeInfo(1, agent)!.costUsd).toBe(3); // sesión A: 1M tokens de entrada a US$ 3

    (agent as { jsonlFile: string }).jsonlFile = b; // /clear: el agente pasa a otro transcript
    const mensajes: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m) => mensajes.push(m));
    personal.registrarUso(1, agent, store, JSON.parse(uso('mB')));

    const info = mensajes.find((m) => m.type === 'agentInfo');
    expect(info!.costUsd).toBe(3); // sesión B sola
  });
});

describe('campo() entiende listas YAML y bloques plegados', () => {
  const agentes = (): string => path.join(home(), '.claude', 'agents');

  it('tools en lista YAML y description plegada se leen bien', async () => {
    const { personal } = await fresco();
    fs.mkdirSync(agentes(), { recursive: true });
    fs.writeFileSync(
      path.join(agentes(), 'lista.md'),
      '---\nname: lista\ndescription: >\n  Texto largo en\n  varias líneas\ntools:\n  - Read\n  - Write\nmodel: sonnet\n---\ncuerpo\n',
    );
    const d = personal.definiciones().get('lista');
    expect(d).toBeDefined();
    expect(d!.descripcion).toBe('Texto largo en varias líneas');
    expect(d!.permiso).toBe('escribe');
  });

  it('control: el formato de una línea que usan los agentes reales anda', async () => {
    const { personal } = await fresco();
    fs.mkdirSync(agentes(), { recursive: true });
    fs.writeFileSync(
      path.join(agentes(), 'plano.md'),
      '---\nname: plano\ndescription: Hace algo.\ntools: Read, Grep, Write\nmodel: sonnet\n---\ncuerpo\n',
    );
    const d = personal.definiciones().get('plano');
    expect(d!.descripcion).toBe('Hace algo.');
    expect(d!.permiso).toBe('escribe');
  });
});

describe('campo(): un valor vacío no se traga la línea siguiente', () => {
  it('"model:" vacío no toma "tools:" como valor', async () => {
    const { personal } = await fresco();
    const dir = path.join(home(), '.claude', 'agents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'vacio.md'),
      '---\nname: vacio\nmodel:\ntools: Read\n---\ncuerpo\n',
    );
    const d = personal.definiciones().get('vacio');
    expect(d!.modelo).toBeUndefined();
    expect(d!.permiso).toBe('lee');
  });
});
