import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ESCENARIO_FILA, SALA_PRESENTACIONES } from '../../core/src/salasComunes.js';
import { abrirProyecto, type Comando, comandoPara, rutaWsl } from '../src/personal/abrir.js';
import {
  duracion,
  htmlHoy,
  inicioDeHoy,
  PAUSA_MS,
  resumirDia,
  trabajoDe,
  trabajosDeHoy,
  trabajosDeHoyAsync,
} from '../src/personal/hoy.js';
import { generarLayout, proyectosPorSala, salasDesde } from '../src/personal/oficina.js';
import { filasPizarra, parsearPendientes, tituloCorto } from '../src/personal/pizarra.js';

const ORCA = [
  {
    nombre: 'ERP',
    ruta: '\\\\wsl.localhost\\Ubuntu\\home\\juanf\\Documents\\Claude\\Projects\\ERP',
  },
  { nombre: 'Centro de control', ruta: 'C:\\Users\\juanf\\Documents\\Chaina\\Centro de control' },
  { nombre: 'brain', ruta: 'C:\\Users\\juanf\\.claude\\brain' },
  { nombre: 'Trading Bot', ruta: 'C:\\Users\\juanf\\Documents\\IA Tools\\Trading Bot' },
];

describe('tanda 3: abrir el proyecto de una oficina', () => {
  it('cada sala sabe cuál es su proyecto de Orca (los conocidos con su nombre de siempre)', () => {
    const m = proyectosPorSala(ORCA);
    expect([...m.keys()]).toEqual(['ERP', 'Chaina', 'Brain', 'Trading Bot']);
    expect(m.get('Chaina')?.ruta).toContain('Centro de control');
  });

  it('reconoce las rutas de WSL vistas desde Windows', () => {
    expect(rutaWsl('\\\\wsl.localhost\\Ubuntu\\home\\juanf\\ERP')).toEqual({
      distro: 'Ubuntu',
      linux: '/home/juanf/ERP',
    });
    expect(rutaWsl('\\\\wsl$\\Debian\\srv\\app\\')).toEqual({
      distro: 'Debian',
      linux: '/srv/app',
    });
    expect(rutaWsl('C:\\Users\\juanf')).toBeNull();
  });

  it('comandos fijos: Explorador para la carpeta, VS Code (con --remote para WSL) para el código', () => {
    const code = () => 'C:\\VSCode\\Code.exe';
    expect(comandoPara('carpeta', 'C:/Users/juanf/Documents/IA Tools/Poker_App')).toEqual({
      exe: 'explorer.exe',
      args: ['C:\\Users\\juanf\\Documents\\IA Tools\\Poker_App'],
    });
    expect(comandoPara('vscode', 'C:\\Users\\juanf\\.claude\\brain', {}, code)).toEqual({
      exe: 'C:\\VSCode\\Code.exe',
      args: ['C:\\Users\\juanf\\.claude\\brain'],
    });
    expect(comandoPara('vscode', ORCA[0].ruta, {}, code)).toEqual({
      exe: 'C:\\VSCode\\Code.exe',
      args: ['--remote', 'wsl+Ubuntu', '/home/juanf/Documents/Claude/Projects/ERP'],
    });
  });

  it('solo abre la ruta de Orca de esa sala: nunca una que mande el cliente', () => {
    const lanzados: Comando[] = [];
    const lanzar = (c: Comando) => lanzados.push(c);
    const m = proyectosPorSala(ORCA);
    expect(abrirProyecto('Brain', 'carpeta', m, lanzar)).toBeNull();
    expect(lanzados[0]).toEqual({
      exe: 'explorer.exe',
      args: ['C:\\Users\\juanf\\.claude\\brain'],
    });
    // Una ruta en lugar de una sala, una sala sin proyecto o una acción inventada no lanzan nada.
    expect(abrirProyecto('C:\\Windows\\System32', 'carpeta', m, lanzar)).toMatch(/no tiene/);
    expect(abrirProyecto('Cafetería', 'vscode', m, lanzar)).toMatch(/no tiene/);
    expect(abrirProyecto('Brain', 'cmd /c calc', m, lanzar)).toBe('Pedido inválido.');
    expect(abrirProyecto(42, 'carpeta', m, lanzar)).toBe('Pedido inválido.');
    expect(lanzados).toHaveLength(1);
  });
});

describe('tanda 3: pizarra de pendientes', () => {
  const MD = [
    '# Pendientes',
    '- [ ] **Telegram: los pasos 4 a 11 del plan** (plans/telegram-modelos.md). Hecho: paso 1',
    '- [ ] Prender el aviso a los brokers. La llave está apagada a propósito.',
    '- [x] Algo hecho',
    '* [ ] Tercero',
    '- [ ] Cuarto',
    '## Ideas',
    '- [ ] Una idea con casilla',
    '- Otra idea suelta',
    '- [x] Idea hecha',
    '## Hechos',
    '- [X] Otro hecho',
  ].join('\n');

  it('lee el PENDIENTES.md igual que el radar (abiertos, ideas, hechos)', () => {
    const p = parsearPendientes(MD);
    expect(p.abiertos).toHaveLength(4);
    expect(p.abiertos[0]).toBe(
      'Telegram: los pasos 4 a 11 del plan (plans/telegram-modelos.md). Hecho: paso 1',
    );
    expect(p.ideas).toEqual(['Una idea con casilla', 'Otra idea suelta']);
    expect(p.hechos).toBe(3);
  });

  it('título corto: hasta el primer punto o paréntesis, sin cortar los muy cortos', () => {
    expect(tituloCorto('Telegram: los pasos 4 a 11 del plan (plans/x.md). Hecho')).toBe(
      'Telegram: los pasos 4 a 11 del plan',
    );
    expect(tituloCorto('Prender el aviso a los brokers. La llave')).toBe(
      'Prender el aviso a los brokers',
    );
    expect(tituloCorto('A. b')).toBe('A. b');
    expect(tituloCorto('x'.repeat(200))).toHaveLength(120);
  });

  it('una fila por sala con cuántos pendientes tiene y los 3 primeros', () => {
    const leer = (raiz: string) =>
      raiz.includes('brain') ? null : parsearPendientes(MD, 'PENDIENTES.md');
    const filas = filasPizarra(proyectosPorSala(ORCA), leer);
    expect(filas.map((f) => f.sala)).toEqual(['ERP', 'Chaina', 'Brain', 'Trading Bot']);
    const erp = filas[0];
    expect(erp).toMatchObject({ abiertos: 4, ideas: 2, hechos: 3, archivo: 'PENDIENTES.md' });
    expect(erp.primeros).toEqual([
      'Telegram: los pasos 4 a 11 del plan',
      'Prender el aviso a los brokers',
      'Tercero',
    ]);
    expect(filas[2]).toMatchObject({ sala: 'Brain', archivo: null, abiertos: 0, primeros: [] });
  });
});

describe('tanda 3: plano (Presentaciones y pizarra del Brain)', () => {
  const plano = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'webview-ui', 'public', 'assets', 'default-layout-1.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
  const l = generarLayout(plano, salasDesde(ORCA).salas);
  const muebles = l.furniture as Array<{ uid: string; type: string; col: number; row: number }>;
  const cols = l.cols as number;
  const areas = l.areaTiles as Array<string | null>;

  it('Presentaciones: dos pantallas a los costados y el escenario libre, con el público más abajo', () => {
    const pantallas = muebles.filter((f) => f.uid.startsWith('presentaciones-pantalla'));
    expect(pantallas).toHaveLength(2);
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    areas.forEach((a, i) => {
      if (a !== SALA_PRESENTACIONES) return;
      minCol = Math.min(minCol, i % cols);
      maxCol = Math.max(maxCol, i % cols);
      minRow = Math.min(minRow, Math.floor(i / cols));
    });
    const centro = Math.floor((minCol + maxCol) / 2);
    // Las pantallas no tapan el centro de la pared (ahí va el nombre de la sala).
    for (const p of pantallas) expect(p.col + 2 <= centro - 1 || p.col >= centro + 2).toBe(true);
    // Las sillas quedan debajo del escenario: la tarjeta del que presenta no tapa a nadie.
    const sillas = muebles.filter((f) => f.uid.startsWith('presentaciones-silla'));
    expect(sillas.length).toBeGreaterThanOrEqual(6);
    for (const s of sillas) expect(s.row).toBeGreaterThan(minRow + ESCENARIO_FILA);
    // El escenario está libre de muebles.
    const escenario = { col: centro, row: minRow + ESCENARIO_FILA };
    expect(
      muebles.some(
        (f) =>
          f.row <= escenario.row &&
          f.row + 2 > escenario.row &&
          f.col <= escenario.col &&
          f.col + 2 > escenario.col &&
          !f.uid.includes('pantalla'),
      ),
    ).toBe(false);
  });

  it('el Brain tiene la pizarra de pendientes en la pared, sin pisar el nombre de la sala', () => {
    const piz = muebles.filter((f) => f.uid.startsWith('brain-pizarra'));
    expect(piz.map((f) => f.type)).toEqual(['WHITEBOARD', 'WHITEBOARD', 'WHITEBOARD']);
    expect(piz[1].col).toBe(piz[0].col + 2);
    expect(piz[2].col).toBe(piz[1].col + 2);
    let minCol = Infinity;
    let maxCol = -Infinity;
    areas.forEach((a, i) => {
      if (a !== 'Brain') return;
      minCol = Math.min(minCol, i % cols);
      maxCol = Math.max(maxCol, i % cols);
    });
    const centro = (minCol + maxCol) / 2;
    // El nombre ("Brain", unas 2,5 tiles de ancho) va centrado: la pizarra termina antes.
    expect(piz[2].col + 2).toBeLessThanOrEqual(centro - 1);
  });
});

describe('tanda 3: resumen del día', () => {
  const desde = Date.parse('2026-10-02T03:00:00.000Z'); // 00:00 en Argentina
  const ts = (min: number) => new Date(desde + min * 60_000).toISOString();
  const linea = (o: Record<string, unknown>) => JSON.stringify(o);
  const uso = { input_tokens: 1_000_000, output_tokens: 0 };
  const texto = [
    linea({ type: 'user', timestamp: ts(-30), cwd: 'C:\\Users\\juanf\\.claude\\brain' }), // ayer
    linea({ type: 'user', timestamp: ts(10) }),
    linea({
      type: 'assistant',
      timestamp: ts(11),
      requestId: 'r1',
      message: {
        id: 'm1',
        model: 'claude-sonnet-5-5',
        usage: uso,
        content: [{ type: 'tool_use', name: 'Read' }],
      },
    }),
    // El mismo mensaje en otro registro (otro bloque): no se cobra dos veces.
    linea({
      type: 'assistant',
      timestamp: ts(12),
      requestId: 'r1',
      message: {
        id: 'm1',
        model: 'claude-sonnet-5-5',
        usage: uso,
        content: [{ type: 'tool_use', name: 'Bash' }],
      },
    }),
    linea({
      type: 'assistant',
      timestamp: ts(13),
      requestId: 'r2',
      message: {
        id: 'm2',
        model: 'claude-sonnet-5-5',
        content: [{ type: 'tool_use', name: 'Read' }],
      },
    }),
    'no es json',
    // Una pausa larga (almuerzo) no cuenta como trabajo.
    linea({ type: 'user', timestamp: ts(13 + 60) }),
    linea({ type: 'assistant', timestamp: ts(13 + 62), message: { id: 'm3' } }),
  ].join('\n');

  it('tiempo activo sin pausas largas, costo sin repetir mensajes y herramientas contadas', () => {
    const t = trabajoDe(
      texto,
      {
        archivo: 'x.jsonl',
        proyectoDir: 'C--Users-juanf--claude-brain',
        agente: 'Juan',
        esSub: false,
        wsl: false,
      },
      desde,
    )!;
    expect(t.proyecto).toBe('Brain');
    expect(t.activoMs).toBe((3 + 2) * 60_000); // 10→13 y 73→75; la pausa de 60 min no
    expect(PAUSA_MS).toBe(5 * 60_000);
    expect(t.costo).toBeCloseTo(2, 6); // 1 M de entrada de Sonnet 5.5 = US$ 2, una sola vez
    expect([...t.herramientas]).toEqual([
      ['Read', 2],
      ['Bash', 1],
    ]);
  });

  it('sin registros de hoy no cuenta', () => {
    const viejo = linea({ type: 'user', timestamp: ts(-5) });
    expect(
      trabajoDe(
        viejo,
        { archivo: 'a', proyectoDir: 'x', agente: 'J', esSub: false, wsl: false },
        desde,
      ),
    ).toBeNull();
  });

  it('agrupa por proyecto y agente; el tiempo del proyecto es el de sus sesiones', () => {
    const base = { herramientas: new Map([['Read', 1]]), wsl: false, archivo: 'a', tokens: 0 };
    const r = resumirDia([
      { ...base, proyecto: 'ERP', agente: 'Juan', esSub: false, activoMs: 60_000, costo: 1 },
      { ...base, proyecto: 'ERP', agente: 'Juan', esSub: false, activoMs: 120_000, costo: 2 },
      {
        ...base,
        proyecto: 'ERP',
        agente: 'Pepe · bugs',
        esSub: true,
        activoMs: 600_000,
        costo: 0.5,
      },
      { ...base, proyecto: 'Brain', agente: 'Juan', esSub: false, activoMs: 1, costo: 0.1 },
    ]);
    expect(r.map((p) => p.proyecto)).toEqual(['ERP', 'Brain']);
    expect(r[0]).toMatchObject({ sesiones: 2, activoMs: 180_000, costo: 3.5 });
    expect(r[0].agentes.map((a) => [a.agente, a.sesiones])).toEqual([
      ['Juan', 2],
      ['Pepe · bugs', 1],
    ]);
    expect(r[0].agentes[0].herramientas).toEqual([['Read', 2]]);
  });

  it('la página escapa los nombres y dice algo útil sin datos', () => {
    const html = htmlHoy(
      resumirDia([
        {
          archivo: 'a',
          proyecto: '<b>x</b>',
          agente: 'Juan',
          esSub: false,
          wsl: true,
          activoMs: 3_900_000,
          costo: 1.234,
          tokens: 0,
          herramientas: new Map(),
        },
      ]),
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('1 h 05 min');
    expect(html).toContain('US$ 1.23');
    expect(html).toContain('WSL');
    expect(htmlHoy([])).toContain('Todavía no trabajó ningún agente hoy.');
    expect(duracion(59_000)).toBe('1 min');
  });

  const temporales: string[] = [];
  afterEach(() => {
    for (const d of temporales.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('lee las sesiones de hoy y sus sub-agentes (con su tipo) de cada carpeta de proyectos', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-hoy-'));
    temporales.push(raiz);
    const proyecto = path.join(raiz, 'C--Users-juanf-Documents-IA-Tools-Poker-App');
    const subs = path.join(proyecto, 'sesion1', 'subagents');
    fs.mkdirSync(subs, { recursive: true });
    const ahora = Date.now();
    const hoy = inicioDeHoy();
    const t = (ms: number) => new Date(Math.max(hoy, ahora - ms)).toISOString();
    fs.writeFileSync(
      path.join(proyecto, 'sesion1.jsonl'),
      [
        linea({ type: 'user', timestamp: t(60_000) }),
        linea({ type: 'user', timestamp: t(0) }),
      ].join('\n'),
    );
    fs.writeFileSync(path.join(subs, 'agent-a1.jsonl'), linea({ type: 'user', timestamp: t(0) }));
    fs.writeFileSync(
      path.join(subs, 'agent-a1.meta.json'),
      JSON.stringify({ agentType: 'buscador-de-bugs' }),
    );
    const trabajos = trabajosDeHoy([raiz], hoy);
    const vistos = trabajos.map((x) => [x.proyecto, x.esSub]).sort();
    expect(vistos).toEqual([
      ['Poker', false],
      ['Poker', true],
    ]);
    // Sin nombre de fantasía para ese tipo, el sub-agente figura con su tipo (de su .meta.json).
    expect(trabajos.find((x) => x.esSub)?.agente).toBe('buscador-de-bugs');
  });

  it('la versión asíncrona da lo mismo y solo vuelve a leer los transcripts que cambiaron', async () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-hoy-async-'));
    temporales.push(raiz);
    const proyecto = path.join(raiz, 'C--Users-juanf-Documents-IA-Tools-Poker-App');
    const subs = path.join(proyecto, 'sesion1', 'subagents');
    fs.mkdirSync(subs, { recursive: true });
    const ahora = Date.now();
    const hoy = inicioDeHoy();
    const t = (ms: number) => new Date(Math.max(hoy, ahora - ms)).toISOString();
    const sesion = path.join(proyecto, 'sesion1.jsonl');
    fs.writeFileSync(
      sesion,
      [
        linea({ type: 'user', timestamp: t(60_000) }),
        linea({ type: 'user', timestamp: t(0) }),
      ].join('\n'),
    );
    fs.writeFileSync(path.join(subs, 'agent-a1.jsonl'), linea({ type: 'user', timestamp: t(0) }));
    fs.writeFileSync(
      path.join(subs, 'agent-a1.meta.json'),
      JSON.stringify({ agentType: 'buscador-de-bugs' }),
    );

    const orden = (xs: Array<{ archivo: string }>) =>
      [...xs].sort((a, b) => a.archivo.localeCompare(b.archivo));
    const primera = await trabajosDeHoyAsync([raiz], hoy);
    expect(orden(primera)).toEqual(orden(trabajosDeHoy([raiz], hoy)));

    // Sin cambios: no se vuelve a leer ningún .jsonl.
    const leidos: string[] = [];
    const original = fs.promises.readFile;
    const espia = vi.spyOn(fs.promises, 'readFile').mockImplementation(((
      f: fs.PathLike,
      o: unknown,
    ) => {
      leidos.push(String(f));
      return (original as (f: fs.PathLike, o: unknown) => Promise<string>)(f, o);
    }) as typeof fs.promises.readFile);
    try {
      await trabajosDeHoyAsync([raiz], hoy);
      expect(leidos.filter((f) => f.endsWith('.jsonl'))).toEqual([]);
      // Cambia la sesión principal: solo esa se vuelve a leer.
      fs.appendFileSync(sesion, '\n' + linea({ type: 'user', timestamp: t(0) }));
      leidos.length = 0;
      await trabajosDeHoyAsync([raiz], hoy);
      expect(leidos.filter((f) => f.endsWith('.jsonl'))).toEqual([sesion]);
    } finally {
      espia.mockRestore();
    }
  });
});
