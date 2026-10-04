import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { setAgentRemovalCallback, startStaleExternalAgentCheck } from '../src/fileWatcher.js';
import {
  _reiniciarTerminadas,
  esCierre,
  sesionTerminada,
  ultimaLinea,
} from '../src/personal/terminada.js';
import type { AgentState } from '../src/types.js';

const CIERRE = '{"type":"cost-state","sessionId":"x","totalCostUSD":1}';

describe('personal: sesión terminada (cost-state al final del transcript)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-terminada-'));
    _reiniciarTerminadas();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('última línea completa', () => {
    expect(ultimaLinea('a\nb\n')).toBe('b');
    expect(ultimaLinea('a\r\nb\r\n')).toBe('b');
    expect(ultimaLinea('a\nb a medio escribir')).toBe('a');
    expect(ultimaLinea('sin salto')).toBeNull();
  });

  it('solo cost-state cuenta como cierre', () => {
    expect(esCierre(CIERRE)).toBe(true);
    expect(esCierre('{"type":"assistant"}')).toBe(false);
    expect(esCierre('{"type":"cost-st')).toBe(false);
    expect(esCierre(null)).toBe(false);
  });

  it('un transcript que termina en cost-state está terminado; si se retoma, ya no', () => {
    const f = path.join(dir, 's.jsonl');
    fs.writeFileSync(f, `{"type":"user"}\n${CIERRE}\n`);
    expect(sesionTerminada(f)).toBe(true);
    // --resume: Claude agrega líneas después del cost-state
    fs.appendFileSync(f, '{"type":"user","message":"sigo"}\n');
    expect(sesionTerminada(f)).toBe(false);
  });

  it('lee solo la cola: un transcript grande que termina en cost-state', () => {
    const f = path.join(dir, 'grande.jsonl');
    const linea = `{"type":"assistant","x":"${'z'.repeat(500)}"}\n`;
    fs.writeFileSync(f, `${linea.repeat(200)}${CIERRE}\n`);
    expect(sesionTerminada(f)).toBe(true);
  });

  it('archivo que no existe o vacío: no terminado', () => {
    expect(sesionTerminada(path.join(dir, 'no.jsonl'))).toBe(false);
    const f = path.join(dir, 'vacio.jsonl');
    fs.writeFileSync(f, '');
    expect(sesionTerminada(f)).toBe(false);
  });
});

describe('personal: el chequeo periódico saca a los agentes de sesiones cerradas', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-terminada-'));
    _reiniciarTerminadas();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setAgentRemovalCallback(null);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function agente(id: number, jsonlFile: string): AgentState {
    return { id, isExternal: true, jsonlFile } as AgentState;
  }

  it('saca la cerrada, deja la viva y libera el archivo para re-adoptarlo si se retoma', () => {
    const viva = path.join(dir, 'viva.jsonl');
    const cerrada = path.join(dir, 'cerrada.jsonl');
    fs.writeFileSync(viva, '{"type":"assistant"}\n');
    fs.writeFileSync(cerrada, `{"type":"assistant"}\n${CIERRE}\n`);
    const store = new AgentStateStore();
    store.set(1, agente(1, viva));
    store.set(2, agente(2, cerrada));
    const conocidos = new Set([viva, cerrada]);
    const sacados: number[] = [];
    setAgentRemovalCallback((id) => sacados.push(id));

    const t = startStaleExternalAgentCheck(store, conocidos, { current: false });
    vi.advanceTimersByTime(31_000);
    clearInterval(t);

    expect(sacados).toEqual([2]);
    expect(conocidos.has(cerrada)).toBe(false);
    expect(conocidos.has(viva)).toBe(true);
  });
});
