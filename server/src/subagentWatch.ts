/**
 * SubagentWatch: transcript watching for UNNAMED background spawns (sub-agents).
 *
 * Under the domain model a name is the sole classifier: a named background
 * spawn becomes a Teammate character, an unnamed one stays a Sub-agent — the
 * transient "Subtask" character near its parent. But the unnamed spawn still
 * has its own transcript (under <projectDir>/<leadSessionId>/subagents/), and
 * newer harnesses write no agent_progress records on the lead, so the only way
 * to show live activity is to watch that transcript directly.
 *
 * The watch runs in a SHADOW AgentStateStore: a second store whose agents are
 * never persisted, never announced (its agentAdded event is bridged nowhere),
 * and never rendered as characters. The transcript parser drives it exactly
 * like a real agent; this class subscribes to the shadow store's broadcasts
 * and re-emits them on the MAIN store as the existing subagent* messages,
 * keyed to (lead id, spawn tool_use id) — the same key the webview already
 * uses for the Subtask sub-character. No protocol change.
 */

import * as fs from 'fs';
import * as path from 'path';

import { AgentStateStore } from './agentStateStore.js';
import { DEFAULT_MAX_CONTEXT_TOKENS } from './constants.js';
import { readNewLines, startFileWatching } from './fileWatcher.js';
import { pathsMatch } from './pathKey.js';
import { cancelPermissionTimer, cancelWaitingTimer } from './timerManager.js';
import type { AgentState } from './types.js';

/** Shadow ids start far above any real agent id. The transcript parser's
 *  module-level callbacks (background detected/completed, team switch) fire
 *  with shadow ids too; the offset guarantees they miss the main store and
 *  no-op instead of touching an unrelated real agent. */
const SHADOW_ID_BASE = 1_000_000;

/** personal: cuánto se sigue buscando el sidecar de un agente anidado antes de rendirse. */
const ANIDADO_ESPERA_MS = 60_000;
const ANIDADO_POLL_MS = 1_000;

/** A sub-agent transcript adoption request (sidecar-backed, unnamed). */
export interface SubagentWatchEntry {
  jsonlPath: string;
  toolUseId: string;
}

export class SubagentWatch {
  /** Shadow store: parsed like real agents, broadcast-translated, never shown. */
  readonly store = new AgentStateStore();
  private readonly fileWatchers = new Map<number, fs.FSWatcher>();
  private readonly pollingTimers = new Map<number, ReturnType<typeof setInterval>>();
  private readonly waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
  /** Shadow id → the (lead, spawn tool) the webview keys the sub-character on.
   *  Kept here (not read off AgentState) so transcript-parser mutations of the
   *  shadow agent's team fields can never break the translation. */
  private readonly subKeys = new Map<
    number,
    {
      leadId: number;
      spawnToolUseId: string;
      /** personal: si lo lanzó otro sub-agente (un manager), su spawn y su id en la sombra. */
      jefeToolId?: string;
      jefeShadowId?: number;
    }
  >();
  /** personal: agentes que lanzó un sub-agente y cuyo sidecar todavía no apareció (toolUseId → quién lo lanzó). */
  private readonly anidadosPendientes = new Map<string, { jefeShadowId: number; desde: number }>();
  private pollAnidados: ReturnType<typeof setInterval> | null = null;
  /** Shadow id → tool ids started but not yet done (for toolsClear synthesis). */
  private readonly liveToolIds = new Map<number, Set<string>>();

  constructor(private readonly mainStore: AgentStateStore) {
    this.store.nextAgentId.current = SHADOW_ID_BASE;
    this.store.on('broadcast', (message) => this.translate(message));
  }

  /** Is this transcript already watched? Consulted by scanner dedupe loops. */
  isWatching(jsonlPath: string): boolean {
    for (const a of this.store.values()) {
      if (pathsMatch(a.jsonlFile, jsonlPath)) return true;
    }
    return false;
  }

  /** Start watching an unnamed background spawn's transcript for the given lead. */
  watch(
    lead: AgentState,
    leadId: number,
    entry: SubagentWatchEntry,
    jefe?: { toolId: string; shadowId: number },
  ): void {
    const id = this.store.nextAgentId.current++;
    const agent: AgentState = {
      id,
      // Shares the lead's session like the transcript it mirrors. Never
      // registered with the session router.
      sessionId: lead.sessionId,
      terminalRef: undefined,
      isExternal: true,
      projectDir: lead.projectDir,
      jsonlFile: entry.jsonlPath,
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
      hookDelivered: false,
      lastDataAt: Date.now(),
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      contextTokens: 0,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
      leadAgentId: leadId,
      spawnToolUseId: entry.toolUseId,
    };

    this.subKeys.set(id, {
      leadId,
      spawnToolUseId: entry.toolUseId,
      jefeToolId: jefe?.toolId,
      jefeShadowId: jefe?.shadowId,
    });
    this.store.set(id, agent);

    console.log(
      `[Pixel Agents] Watching background sub-agent transcript for lead Agent ${leadId} (${entry.toolUseId})`,
    );

    startFileWatching(
      id,
      entry.jsonlPath,
      this.store,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
    );
    readNewLines(id, this.store, this.waitingTimers, this.permissionTimers);
  }

  /** Stop the watch matching a completed spawn (queue-operation on the lead). */
  removeBySpawn(leadId: number, toolUseId: string): void {
    // personal: el "lead" es un sub-agente de la sombra (un manager): terminó uno de sus agentes anidados.
    if (leadId >= SHADOW_ID_BASE) {
      this.anidadosPendientes.delete(toolUseId);
      for (const [id, key] of this.subKeys) {
        if (key.jefeShadowId === leadId && key.spawnToolUseId === toolUseId) {
          this.remove(id);
          return;
        }
      }
      return;
    }
    for (const [id, key] of this.subKeys) {
      if (key.leadId === leadId && key.spawnToolUseId === toolUseId) {
        this.remove(id);
        return;
      }
    }
  }

  /** Stop all watches belonging to a lead (lead's session ended). */
  removeByLead(leadId: number): void {
    for (const [id, key] of [...this.subKeys]) {
      if (key.leadId === leadId) {
        this.remove(id);
      }
    }
  }

  dispose(): void {
    for (const id of [...this.subKeys.keys()]) {
      this.remove(id);
    }
    this.anidadosPendientes.clear();
    this.pararPollAnidados();
  }

  /**
   * personal: busca los sidecars de los agentes que lanzaron los sub-agentes vigilados (un manager que delega). Están
   * en la misma carpeta `subagents/` que el transcript del manager, con su `toolUseId`. Lo llama un intervalo mientras
   * haya pendientes; público para los tests.
   */
  buscarAnidados(ahora = Date.now()): void {
    for (const [toolId, p] of [...this.anidadosPendientes]) {
      const jefe = this.store.get(p.jefeShadowId);
      const jefeKey = this.subKeys.get(p.jefeShadowId);
      if (!jefe || !jefeKey || ahora - p.desde > ANIDADO_ESPERA_MS) {
        this.anidadosPendientes.delete(toolId);
        continue;
      }
      const lead = this.mainStore.get(jefeKey.leadId);
      if (!lead) continue;
      const dir = path.dirname(jefe.jsonlFile);
      let archivos: string[];
      try {
        archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json'));
      } catch {
        continue;
      }
      for (const f of archivos) {
        let meta: { toolUseId?: unknown };
        try {
          meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { toolUseId?: unknown };
        } catch {
          continue;
        }
        if (meta.toolUseId !== toolId) continue;
        const jsonlPath = path.join(dir, f.replace(/\.meta\.json$/, '.jsonl'));
        this.anidadosPendientes.delete(toolId);
        if (!this.isWatching(jsonlPath)) {
          this.watch(
            lead,
            jefeKey.leadId,
            { jsonlPath, toolUseId: toolId },
            { toolId: jefeKey.spawnToolUseId, shadowId: p.jefeShadowId },
          );
        }
        break;
      }
    }
    if (this.anidadosPendientes.size === 0) this.pararPollAnidados();
  }

  private pararPollAnidados(): void {
    if (this.pollAnidados) clearInterval(this.pollAnidados);
    this.pollAnidados = null;
  }

  private remove(id: number): void {
    this.fileWatchers.get(id)?.close();
    this.fileWatchers.delete(id);
    const pt = this.pollingTimers.get(id);
    if (pt) clearInterval(pt);
    this.pollingTimers.delete(id);
    cancelWaitingTimer(id, this.waitingTimers);
    cancelPermissionTimer(id, this.permissionTimers);
    const key = this.subKeys.get(id);
    this.subKeys.delete(id);
    this.liveToolIds.delete(id);
    this.store.delete(id);
    // personal: un agente anidado no tiene quien lo borre del lado del lead: se avisa acá.
    if (key?.jefeToolId) {
      this.mainStore.broadcast({
        type: 'subagentClear',
        id: key.leadId,
        parentToolId: key.spawnToolUseId,
      });
    }
    // personal: si se va un manager, se van con él los agentes que lanzó (y los que esperaban su sidecar).
    for (const [hijo, k] of [...this.subKeys]) {
      if (k.jefeShadowId === id) this.remove(hijo);
    }
    for (const [toolId, p] of [...this.anidadosPendientes]) {
      if (p.jefeShadowId === id) this.anidadosPendientes.delete(toolId);
    }
  }

  /** Re-emit shadow-store activity on the main store as subagent* messages.
   *  Everything not listed here (agentTokenUsage, agentTeamInfo, the shadow's
   *  own nested subagent* messages) is deliberately dropped: the sub-character
   *  has no context gauge and no team badge. personal: sub-sub-characters DO
   *  exist here — when a watched sub (a manager) spawns an agent, its transcript
   *  is watched too (buscarAnidados) and shown as a sibling sub-character keyed
   *  (lead, nested spawn id), with `jefeToolId` naming the manager's spawn.
   *
   *  Per-tool dones are DEFERRED to the sub's turn end: emitting them as they
   *  happen made the sub-character flap between typing and idle on every
   *  tool boundary. Instead, started tools accumulate and a single batch of
   *  subagentToolDone fires when the shadow agent's turn ends — via
   *  agentToolsClear (activity cleared) or agentStatus:waiting (clean
   *  turn_duration broadcasts no clear) — so the sub types through its turn
   *  and idles between turns. */
  private translate(message: Record<string, unknown>): void {
    const shadowId = message.id as number;
    const key = this.subKeys.get(shadowId);
    if (!key) return;
    const { leadId, spawnToolUseId, jefeToolId } = key;

    switch (message.type) {
      case 'agentToolStart': {
        const toolId = message.toolId as string;
        // personal: el sub-agente lanza a otro (un manager que delega): buscar su transcript.
        if (
          typeof message.status === 'string' &&
          message.status.startsWith('Subtask:') &&
          !this.anidadosPendientes.has(toolId) &&
          ![...this.subKeys.values()].some((k) => k.spawnToolUseId === toolId)
        ) {
          this.anidadosPendientes.set(toolId, { jefeShadowId: shadowId, desde: Date.now() });
          this.buscarAnidados();
          if (this.anidadosPendientes.size > 0 && !this.pollAnidados) {
            this.pollAnidados = setInterval(() => this.buscarAnidados(), ANIDADO_POLL_MS);
            this.pollAnidados.unref?.();
          }
        }
        let live = this.liveToolIds.get(shadowId);
        if (!live) {
          live = new Set();
          this.liveToolIds.set(shadowId, live);
        }
        live.add(toolId);
        this.mainStore.broadcast({
          type: 'subagentToolStart',
          id: leadId,
          parentToolId: spawnToolUseId,
          toolId,
          status: message.status,
          ...(jefeToolId ? { jefeToolId } : {}),
        });
        break;
      }
      case 'agentToolsClear': {
        this.finishSubTurn(shadowId, leadId, spawnToolUseId);
        break;
      }
      case 'agentStatus': {
        if (message.status === 'waiting') {
          this.finishSubTurn(shadowId, leadId, spawnToolUseId);
        }
        break;
      }
      case 'agentToolPermission': {
        this.mainStore.broadcast({
          type: 'subagentToolPermission',
          id: leadId,
          parentToolId: spawnToolUseId,
          ...(jefeToolId ? { jefeToolId } : {}),
        });
        break;
      }
      default:
        break;
    }
  }

  /** The shadow agent's turn ended: mark every started tool done in one batch
   *  so the sub-character idles between its turns. */
  private finishSubTurn(shadowId: number, leadId: number, spawnToolUseId: string): void {
    const live = this.liveToolIds.get(shadowId);
    if (!live || live.size === 0) return;
    for (const toolId of live) {
      this.mainStore.broadcast({
        type: 'subagentToolDone',
        id: leadId,
        parentToolId: spawnToolUseId,
        toolId,
      });
    }
    live.clear();
  }
}
