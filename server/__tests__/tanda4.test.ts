import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import {
  _cantidadDormidos,
  _reiniciarDormidos,
  anotarDormido,
  esperaParaDormido,
  olvidarNoVistos,
  saltearDormido,
} from '../src/personal/escaneo.js';
import {
  _reiniciarModos,
  anotarModoPermiso,
  exentasPara,
  modoDe,
  olvidarModo,
  REINTENTO_MS,
  ultimoModo,
} from '../src/personal/permiso.js';
import { startPermissionTimer } from '../src/timerManager.js';
import type { AgentState } from '../src/types.js';

const HORA = 60 * 60_000;

describe('escaneo global: transcripts dormidos', () => {
  beforeEach(() => _reiniciarDormidos());

  it('espera más cuanto más viejo es el archivo', () => {
    expect(esperaParaDormido(5 * 60_000)).toBe(0);
    expect(esperaParaDormido(2 * HORA)).toBe(20_000);
    expect(esperaParaDormido(30 * HORA)).toBe(60_000);
  });

  it('un archivo de hace días se saltea hasta que pasa un minuto, uno reciente nunca', () => {
    const ahora = 1_000_000_000;
    anotarDormido('viejo.jsonl', ahora - 3 * 24 * HORA, ahora);
    anotarDormido('reciente.jsonl', ahora - 15 * 60_000, ahora);
    expect(saltearDormido('viejo.jsonl', ahora + 30_000)).toBe(true);
    expect(saltearDormido('viejo.jsonl', ahora + 60_000)).toBe(false);
    expect(saltearDormido('reciente.jsonl', ahora + 1)).toBe(false);
    expect(saltearDormido('nuevo.jsonl', ahora)).toBe(false); // nunca visto: se mira enseguida
  });

  it('olvida los archivos que ya no existen', () => {
    const ahora = 1_000_000_000;
    anotarDormido('a.jsonl', ahora - 2 * 24 * HORA, ahora);
    anotarDormido('b.jsonl', ahora - 2 * 24 * HORA, ahora);
    olvidarNoVistos(new Set(['a.jsonl']));
    expect(_cantidadDormidos()).toBe(1);
    expect(saltearDormido('b.jsonl', ahora + 1)).toBe(false);
  });
});

describe('mano levantada según permissionMode', () => {
  let dir: string;
  beforeEach(() => {
    _reiniciarModos();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-permiso-'));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const BASE = new Set(['Read', 'Task']);

  it('bypass, auto y dontAsk no levantan la mano por tiempo; acceptEdits no cuenta las ediciones', () => {
    expect(exentasPara('bypassPermissions', BASE)).toBeNull();
    expect(exentasPara('auto', BASE)).toBeNull();
    expect(exentasPara('dontAsk', BASE)).toBeNull();
    const ae = exentasPara('acceptEdits', BASE)!;
    expect(ae.has('Edit') && ae.has('Write') && ae.has('Read')).toBe(true);
    expect(ae.has('Bash')).toBe(false);
    expect(exentasPara('default', BASE)).toBe(BASE);
    expect(exentasPara(undefined, BASE)).toBe(BASE);
  });

  it('toma el último permissionMode visto en el transcript', () => {
    anotarModoPermiso('s.jsonl', { type: 'user', permissionMode: 'default' });
    anotarModoPermiso('s.jsonl', { type: 'assistant' });
    anotarModoPermiso('s.jsonl', { type: 'user', permissionMode: 'bypassPermissions' });
    expect(modoDe('s.jsonl')).toBe('bypassPermissions');
    olvidarModo('s.jsonl');
  });

  it('para una sesión ya empezada lee la cola del archivo una sola vez', () => {
    const f = path.join(dir, 'sesion.jsonl');
    fs.writeFileSync(
      f,
      '{"type":"user","permissionMode":"default"}\n{"type":"user","permissionMode":"auto"}\n',
    );
    expect(ultimoModo(fs.readFileSync(f, 'utf8'))).toBe('auto');
    expect(modoDe(f)).toBe('auto');
    expect(modoDe(path.join(dir, 'no-existe.jsonl'))).toBeUndefined();
  });

  it('acepta JSON con espacios y, si todavía no hay dato, reintenta más tarde', () => {
    expect(ultimoModo('{"type": "user", "permissionMode": "bypassPermissions"}')).toBe(
      'bypassPermissions',
    );
    const f = path.join(dir, 'nueva.jsonl');
    fs.writeFileSync(f, '{"type":"user"}\n');
    expect(modoDe(f, 1_000)).toBeUndefined();
    fs.appendFileSync(f, '{"type":"user","permissionMode":"auto"}\n');
    expect(modoDe(f, 2_000)).toBeUndefined(); // dentro del intervalo no vuelve a leer
    expect(modoDe(f, 1_000 + REINTENTO_MS)).toBe('auto');
  });

  function agente(jsonlFile: string, tool: string): AgentState {
    return {
      id: 1,
      jsonlFile,
      activeToolIds: new Set(['t1']),
      activeToolNames: new Map([['t1', tool]]),
      activeSubagentToolNames: new Map(),
    } as unknown as AgentState;
  }

  function probar(modo: string | null, tool: string): string[] {
    vi.useFakeTimers();
    const f = path.join(dir, `${modo ?? 'sin'}-${tool}.jsonl`);
    fs.writeFileSync(
      f,
      modo ? `{"type":"user","permissionMode":"${modo}"}\n` : '{"type":"user"}\n',
    );
    const store = new AgentStateStore();
    const enviados: string[] = [];
    store.broadcast = (m: { type: string }) => {
      enviados.push(m.type);
    };
    store.set(1, agente(f, tool));
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    startPermissionTimer(1, store, timers, BASE);
    vi.advanceTimersByTime(60_000);
    return enviados;
  }

  it('un Bash largo en bypassPermissions no levanta la mano', () => {
    expect(probar('bypassPermissions', 'Bash')).not.toContain('agentToolPermission');
  });

  it('en default (puede pedir permiso de verdad) sigue la heurística del original', () => {
    expect(probar('default', 'Bash')).toContain('agentToolPermission');
  });

  it('en acceptEdits una edición larga no levanta la mano, un Bash sí', () => {
    expect(probar('acceptEdits', 'Edit')).not.toContain('agentToolPermission');
    expect(probar('acceptEdits', 'Bash')).toContain('agentToolPermission');
  });

  it('sin dato de modo (versiones viejas) queda la heurística', () => {
    expect(probar(null, 'Bash')).toContain('agentToolPermission');
  });
});
