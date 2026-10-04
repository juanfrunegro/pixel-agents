/**
 * Personal (copia de juanfrunegro): la cabina de Contratistas de la oficina por niveles. Codex, Pi, Antigravity y los
 * demás motores que no son Claude nunca entran a la oficina como sesiones; los ve Orca. Cada CONSULTA_MS se corre
 * `orca worktree ps --json` (el CLI de Orca de este perfil, ver rutaOrcaCli) y, si cambió algo, se manda al webview
 * como mensaje `contratistas` (webview-ui/src/personal/contratistas.ts los dibuja sentados en la cabina).
 * Si Orca no está abierto o el CLI falla, la lista queda vacía y no se avisa nada: es un adorno, no una alarma.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const CONSULTA_MS = 15_000;
const TIMEOUT_MS = 10_000;

export interface Contratista {
  /** Motor, como lo nombra Orca: codex, pi, gemini, antigravity, cursor… */
  motor: string;
  /** Proyecto (repo de Orca) y workspace (rama o nombre) donde corre. */
  proyecto: string;
  workspace: string;
  /** working | waiting | done… (el estado de Orca). */
  estado: string;
  /** Lo que está haciendo, si Orca lo sabe (título de la tarea o el prompt, recortado). */
  tarea: string | null;
  /** Desde cuándo está en ese estado (ms). */
  desde: number | null;
}

/** El CLI de Orca: PIXEL_ORCA_CLI lo pisa (tests); si no, el de la instalación de usuario en Windows. */
export function rutaOrcaCli(): string | null {
  if (process.env.PIXEL_ORCA_CLI) return process.env.PIXEL_ORCA_CLI;
  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir() || '.', 'AppData', 'Local');
  const exe = path.join(base, 'Programs', 'orca', 'resources', 'bin', 'orca.exe');
  return fs.existsSync(exe) ? exe : null;
}

const recortar = (s: unknown, n = 80): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null;
};

/** De la salida de `orca worktree ps --json`, los agentes que no son Claude. Ordenados para que la lista sea estable. */
export function contratistasDe(salida: unknown): Contratista[] {
  const worktrees = (salida as { result?: { worktrees?: unknown } } | null)?.result?.worktrees;
  if (!Array.isArray(worktrees)) return [];
  const out: Contratista[] = [];
  for (const w of worktrees as Array<Record<string, unknown>>) {
    if (!Array.isArray(w.agents) || w.isArchived === true) continue;
    for (const a of w.agents as Array<Record<string, unknown>>) {
      const motor = typeof a.agentType === 'string' ? a.agentType.toLowerCase() : '';
      if (!motor || motor === 'claude') continue;
      out.push({
        motor,
        proyecto: typeof w.repo === 'string' ? w.repo : '?',
        workspace: typeof w.displayName === 'string' ? w.displayName : '',
        estado: typeof a.state === 'string' ? a.state : 'desconocido',
        tarea: recortar(a.taskTitle) ?? recortar(a.displayName) ?? recortar(a.prompt),
        desde: typeof a.stateStartedAt === 'number' ? a.stateStartedAt : null,
      });
    }
  }
  return out.sort(
    (x, y) =>
      x.motor.localeCompare(y.motor) ||
      x.proyecto.localeCompare(y.proyecto) ||
      x.workspace.localeCompare(y.workspace),
  );
}

let ultimo: Contratista[] = [];

export function mensajeContratistas(): { type: 'contratistas'; lista: Contratista[] } {
  return { type: 'contratistas', lista: ultimo };
}

/**
 * Consulta Orca una vez. Llama a `avisar` con el mensaje solo si la lista cambió. `correr` se inyecta en los tests.
 */
export function actualizarContratistas(
  avisar: (m: ReturnType<typeof mensajeContratistas>) => void,
  correr: (cb: (salida: string | null) => void) => void = correrOrca,
): void {
  correr((salida) => {
    let lista: Contratista[] = [];
    if (salida) {
      try {
        lista = contratistasDe(JSON.parse(salida));
      } catch {
        lista = [];
      }
    }
    if (JSON.stringify(lista) === JSON.stringify(ultimo)) return;
    ultimo = lista;
    avisar(mensajeContratistas());
  });
}

function correrOrca(cb: (salida: string | null) => void): void {
  const cli = rutaOrcaCli();
  if (!cli) {
    cb(null);
    return;
  }
  execFile(
    cli,
    ['worktree', 'ps', '--json'],
    { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout) => cb(err ? null : stdout),
  );
}

/** Solo para tests. */
export function _reiniciarContratistas(): void {
  ultimo = [];
}
