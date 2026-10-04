/** Personal: la cabina de Contratistas sale de `orca worktree ps --json` (forma real del 4/10/2026). */
import { afterEach, describe, expect, it } from 'vitest';

import {
  _reiniciarContratistas,
  actualizarContratistas,
  contratistasDe,
} from '../src/personal/contratistas.js';

const ps = (agents: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
  id: 'x',
  ok: true,
  result: {
    worktrees: [{ repo: 'ERP', displayName: 'main', isArchived: false, agents, ...extra }],
    totalCount: 1,
    truncated: false,
  },
});

const claude = { agentType: 'claude', state: 'working', prompt: '' };
const codex = {
  agentType: 'codex',
  state: 'working',
  taskTitle: null,
  displayName: null,
  prompt: 'Revisá el diff de\n la rama feat/x y decime si hay bugs',
  stateStartedAt: 1791000000000,
};

describe('contratistas desde Orca', () => {
  afterEach(() => _reiniciarContratistas());

  it('deja afuera a Claude y saca motor, proyecto, estado y tarea', () => {
    expect(contratistasDe(ps([claude, codex]))).toEqual([
      {
        motor: 'codex',
        proyecto: 'ERP',
        workspace: 'main',
        estado: 'working',
        tarea: 'Revisá el diff de la rama feat/x y decime si hay bugs',
        desde: 1791000000000,
      },
    ]);
  });

  it('ignora workspaces archivados y salidas rotas', () => {
    expect(contratistasDe(ps([codex], { isArchived: true }))).toEqual([]);
    expect(contratistasDe(null)).toEqual([]);
    expect(contratistasDe({ ok: false })).toEqual([]);
  });

  it('recorta la tarea larga y prefiere el título', () => {
    const [c] = contratistasDe(ps([{ ...codex, agentType: 'Pi', taskTitle: 'x'.repeat(200) }]));
    expect(c.motor).toBe('pi');
    expect(c.tarea).toHaveLength(80);
    expect(c.tarea?.endsWith('…')).toBe(true);
  });

  it('avisa solo cuando la lista cambia; si Orca no responde, la vacía', () => {
    const avisos: unknown[] = [];
    const salida = JSON.stringify(ps([codex]));
    actualizarContratistas(
      (m) => avisos.push(m),
      (cb) => cb(salida),
    );
    actualizarContratistas(
      (m) => avisos.push(m),
      (cb) => cb(salida),
    );
    expect(avisos).toHaveLength(1);
    actualizarContratistas(
      (m) => avisos.push(m),
      (cb) => cb(null),
    );
    expect(avisos).toHaveLength(2);
    expect(avisos[1]).toEqual({ type: 'contratistas', lista: [] });
  });
});
