/**
 * Personal: los agentes que lanza un sub-agente (un manager que delega) aparecen en la oficina. Forma de los registros
 * tomada de una corrida real del 4/10 (manager-erp → analista-cobertura): el sidecar del anidado está en la misma
 * carpeta subagents/ que el del manager, con su toolUseId, parentAgentId y spawnDepth 2.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import {
  scanForBackgroundAgentFiles,
  setHookProvider as setFileWatcherHookProvider,
  setSubagentWatch,
  setTeamProvider,
} from '../src/fileWatcher.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { claudeTeamProvider } from '../src/providers/hook/claude/claudeTeamProvider.js';
import { SubagentWatch } from '../src/subagentWatch.js';
import {
  processTranscriptLine,
  setBackgroundAgentCompletedCallback,
  setBackgroundAgentDetectedCallback,
  setHookProvider,
} from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

const SESION = 'sesion-ceo';
const SPAWN_MANAGER = 'toolu_014g2UUeVYMcjyiQzwVBxVhP';
const SPAWN_ANIDADO = 'toolu_01HnNumY8swUeVoZdLk4u4zs';
const ID_MANAGER = 'a0f16a57a0743505d';
const ID_ANIDADO = 'a420b37bebe8fe5f1';

const linea = (o: unknown) => JSON.stringify(o);
const spawn = (id: string, tipo: string) =>
  linea({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id,
          name: 'Agent',
          input: { description: `tarea de ${tipo}`, subagent_type: tipo, prompt: '…' },
        },
      ],
    },
  });
const lanzadoEnFondo = (id: string, agentId: string) =>
  linea({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: [
            { type: 'text', text: `Async agent launched successfully.\nagentId: ${agentId}` },
          ],
        },
      ],
    },
  });
const resultado = (id: string) =>
  linea({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'informe' }] },
  });
const terminado = (id: string, agentId: string) =>
  linea({
    type: 'queue-operation',
    operation: 'enqueue',
    content: `<task-notification> <task-id>${agentId}</task-id> <tool-use-id>${id}</tool-use-id> <output>ok</output>`,
  });
const lee = (id: string) =>
  linea({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: '/x.ts' } }] },
  });

describe('agentes anidados (un manager que delega)', () => {
  let raiz: string;
  let dir: string;
  let agents: AgentStateStore;
  let watch: SubagentWatch;
  let msgs: Array<Record<string, unknown>>;
  const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const pollingTimers = new Map<number, ReturnType<typeof setInterval>>();
  const fileWatchers = new Map<number, fs.FSWatcher>();

  function sidecar(agentId: string, meta: Record<string, unknown>): string {
    const jsonl = path.join(dir, `agent-${agentId}.jsonl`);
    fs.writeFileSync(jsonl, '');
    fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
    return jsonl;
  }
  const sombraDe = (jsonl: string) =>
    [...watch.store.values()].find((a) => a.jsonlFile === jsonl)!.id;
  const enSombra = (id: number, l: string) =>
    processTranscriptLine(id, l, watch.store, waitingTimers, permissionTimers);

  /** El CEO lanza al manager en segundo plano y queda vigilado en la sombra. */
  function lanzarManager(): number {
    const jsonl = sidecar(ID_MANAGER, {
      agentType: 'manager-erp',
      toolUseId: SPAWN_MANAGER,
      spawnDepth: 1,
    });
    processTranscriptLine(
      1,
      spawn(SPAWN_MANAGER, 'manager-erp'),
      agents,
      waitingTimers,
      permissionTimers,
    );
    processTranscriptLine(
      1,
      lanzadoEnFondo(SPAWN_MANAGER, ID_MANAGER),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(watch.isWatching(jsonl)).toBe(true);
    return sombraDe(jsonl);
  }

  const sidecarAnidado = () =>
    sidecar(ID_ANIDADO, {
      agentType: 'analista-cobertura',
      toolUseId: SPAWN_ANIDADO,
      parentAgentId: ID_MANAGER,
      spawnDepth: 2,
    });

  beforeEach(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-anidados-'));
    dir = path.join(raiz, SESION, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    setHookProvider(claudeProvider);
    setFileWatcherHookProvider(claudeProvider);
    setTeamProvider(claudeTeamProvider);
    agents = new AgentStateStore();
    watch = new SubagentWatch(agents);
    setSubagentWatch(watch);
    agents.set(1, {
      id: 1,
      sessionId: SESION,
      isExternal: false,
      projectDir: raiz,
      jsonlFile: path.join(raiz, `${SESION}.jsonl`),
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      isWaiting: false,
      permissionSent: false,
      hadToolsInTurn: false,
      lastDataAt: 0,
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      hookDelivered: false,
      contextTokens: 0,
      maxContextTokens: 200_000,
    } as AgentState);
    msgs = [];
    agents.on('broadcast', (m) => msgs.push(m as Record<string, unknown>));
    // Igual que agentRuntime.
    setBackgroundAgentDetectedCallback((leadId) =>
      scanForBackgroundAgentFiles(
        leadId,
        agents,
        { current: 100 },
        fileWatchers,
        pollingTimers,
        waitingTimers,
        permissionTimers,
        () => {},
        undefined,
      ),
    );
    setBackgroundAgentCompletedCallback((leadId, toolUseId) =>
      watch.removeBySpawn(leadId, toolUseId),
    );
  });

  afterEach(() => {
    setBackgroundAgentDetectedCallback(() => {});
    setBackgroundAgentCompletedCallback(() => {});
    watch.dispose();
    setSubagentWatch(null);
    for (const t of pollingTimers.values()) clearInterval(t);
    pollingTimers.clear();
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  it('vigila al agente que lanza el manager y lo muestra como sub de la sesión, con su jefe', () => {
    const manager = lanzarManager();
    const anidado = sidecarAnidado();
    enSombra(manager, spawn(SPAWN_ANIDADO, 'analista-cobertura'));
    expect(watch.isWatching(anidado)).toBe(true);

    enSombra(sombraDe(anidado), lee('toolu_lee_1'));
    const inicio = msgs.find((m) => m.type === 'subagentToolStart' && m.toolId === 'toolu_lee_1');
    expect(inicio).toMatchObject({ id: 1, parentToolId: SPAWN_ANIDADO, jefeToolId: SPAWN_MANAGER });
    // El manager sigue mostrando su propio trabajo sin jefe.
    const delManager = msgs.find(
      (m) => m.type === 'subagentToolStart' && m.toolId === SPAWN_ANIDADO,
    );
    expect(delManager).toMatchObject({ id: 1, parentToolId: SPAWN_MANAGER });
    expect(delManager?.jefeToolId).toBeUndefined();
  });

  it('espera el sidecar si todavía no está escrito', () => {
    const manager = lanzarManager();
    enSombra(manager, spawn(SPAWN_ANIDADO, 'analista-cobertura'));
    const anidado = sidecarAnidado();
    expect(watch.isWatching(anidado)).toBe(false);
    watch.buscarAnidados();
    expect(watch.isWatching(anidado)).toBe(true);
  });

  it('deja de buscar un sidecar que nunca llega', () => {
    const manager = lanzarManager();
    enSombra(manager, spawn(SPAWN_ANIDADO, 'analista-cobertura'));
    watch.buscarAnidados(Date.now() + 61_000);
    sidecarAnidado();
    watch.buscarAnidados();
    expect(watch.store.size).toBe(1); // solo el manager
  });

  it('lo saca cuando el manager recibe su resultado (lanzado en primer plano)', () => {
    const manager = lanzarManager();
    const anidado = sidecarAnidado();
    enSombra(manager, spawn(SPAWN_ANIDADO, 'analista-cobertura'));
    enSombra(manager, resultado(SPAWN_ANIDADO));
    expect(watch.isWatching(anidado)).toBe(false);
    expect(msgs).toContainEqual({ type: 'subagentClear', id: 1, parentToolId: SPAWN_ANIDADO });
  });

  it('lanzado en segundo plano: sigue al recibir "launched" y sale con la queue-operation', () => {
    const manager = lanzarManager();
    const anidado = sidecarAnidado();
    enSombra(manager, spawn(SPAWN_ANIDADO, 'analista-cobertura'));
    enSombra(manager, lanzadoEnFondo(SPAWN_ANIDADO, ID_ANIDADO));
    expect(watch.isWatching(anidado)).toBe(true);
    enSombra(manager, terminado(SPAWN_ANIDADO, ID_ANIDADO));
    expect(watch.isWatching(anidado)).toBe(false);
    expect(msgs).toContainEqual({ type: 'subagentClear', id: 1, parentToolId: SPAWN_ANIDADO });
  });

  it('si termina el manager, se van con él los que lanzó (sin fantasmas)', () => {
    const manager = lanzarManager();
    const anidado = sidecarAnidado();
    enSombra(manager, spawn(SPAWN_ANIDADO, 'analista-cobertura'));
    expect(watch.isWatching(anidado)).toBe(true);
    processTranscriptLine(
      1,
      terminado(SPAWN_MANAGER, ID_MANAGER),
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(watch.store.size).toBe(0);
    expect(msgs).toContainEqual({ type: 'subagentClear', id: 1, parentToolId: SPAWN_ANIDADO });
  });
});
