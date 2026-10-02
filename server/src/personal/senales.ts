/**
 * Personal (copia de juanfrunegro): señales de cada sesión que la oficina muestra (tanda 2). Todo sale del transcript
 * salvo el aviso por voz, que sale de un archivo marca.
 *
 * - Humo: errores de herramienta seguidos (ERRORES_PARA_HUMO). Una herramienta que sale bien lo borra. Un "no" tuyo a un
 *   permiso no cuenta como error.
 * - Deploy: un Bash de deploy (esDeploy) en curso, desde su tool_use hasta su tool_result; la skill deploy-verificado
 *   cuenta hasta que termina el turno. Vence solo a los DEPLOY_MAX_MS por si el resultado nunca llega.
 * - Voz: la sesión pidió el aviso hablado (marca <session_id>.speak). Al desaparecer la marca, el aviso se dijo: queda
 *   "presentando" (el webview lo usa unos segundos para la sala de Presentaciones).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Errores de herramienta seguidos para mostrar humo. */
export const ERRORES_PARA_HUMO = 3;
/** Un deploy sin resultado se da por terminado a los 20 min. */
export const DEPLOY_MAX_MS = 20 * 60_000;

const DEPLOY_BASH: RegExp[] = [
  /\bvercel\b[^\n|;&]*(\bdeploy\b|--prod\b)/i,
  /\bvercel\s+--prod\b/i,
  /\bgh\s+pr\s+merge\b/i,
  /\brailway\s+up\b/i,
];
const SKILL_DEPLOY = 'deploy-verificado';

/** El tool_use es un deploy: Bash con vercel deploy/--prod, gh pr merge o railway up, o la skill deploy-verificado. */
export function esDeploy(nombre: string | undefined, input: unknown): 'bash' | 'skill' | null {
  const i = (input ?? {}) as { command?: unknown; skill?: unknown };
  if (nombre === 'Bash' && typeof i.command === 'string') {
    return DEPLOY_BASH.some((re) => re.test(i.command as string)) ? 'bash' : null;
  }
  if (nombre === 'Skill' && typeof i.skill === 'string') {
    return i.skill.replace(/^.*:/, '') === SKILL_DEPLOY ? 'skill' : null;
  }
  return null;
}

/** Respuesta de "no" a un permiso: no es un error del agente. */
function esRechazo(contenido: unknown): boolean {
  const t = typeof contenido === 'string' ? contenido : JSON.stringify(contenido ?? '');
  return /doesn't want to proceed|user rejected|was rejected by the user|User denied/i.test(t);
}

export interface Senales {
  errores: number;
  ultimoError?: number; // ms
  deploys: Map<string, number>; // tool_use id → inicio (ms)
  deploySkill?: number; // ms
}

export function senalesNuevas(): Senales {
  return { errores: 0, deploys: new Map() };
}

interface Bloque {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

interface RegistroSenal {
  type?: string;
  subtype?: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { content?: unknown };
}

/** Aplica un registro del transcript. Devuelve true si cambió algo visible. */
export function aplicarSenal(s: Senales, r: RegistroSenal, ahora = Date.now()): boolean {
  if (!r || r.isSidechain) return false;
  const antes = resumen(s, ahora);
  const t = r.timestamp ? Date.parse(r.timestamp) : NaN;
  const cuando = Number.isFinite(t) ? t : ahora;
  const bloques = Array.isArray(r.message?.content) ? (r.message!.content as Bloque[]) : [];
  if (r.type === 'assistant') {
    for (const b of bloques) {
      if (b?.type !== 'tool_use') continue;
      const d = esDeploy(b.name, b.input);
      if (d === 'bash' && b.id) s.deploys.set(b.id, cuando);
      if (d === 'skill') s.deploySkill = cuando;
    }
  } else if (r.type === 'user') {
    for (const b of bloques) {
      if (b?.type !== 'tool_result') continue;
      if (b.tool_use_id) s.deploys.delete(b.tool_use_id);
      if (b.is_error === true && !esRechazo(b.content)) {
        s.errores++;
        s.ultimoError = cuando;
      } else if (b.is_error !== true) {
        s.errores = 0;
        s.ultimoError = undefined;
      }
    }
  } else if (r.type === 'system' && r.subtype === 'turn_duration') {
    s.deploySkill = undefined;
  }
  return JSON.stringify(antes) !== JSON.stringify(resumen(s, ahora));
}

/** Lo que viaja al webview en agentInfo. */
export function resumen(
  s: Senales,
  ahora = Date.now(),
): { errores: number; ultimoError: number | null; deployDesde: number | null } {
  let desde: number | null = null;
  for (const t of [...s.deploys.values(), ...(s.deploySkill ? [s.deploySkill] : [])]) {
    if (ahora - t < DEPLOY_MAX_MS && (desde === null || t < desde)) desde = t;
  }
  return { errores: s.errores, ultimoError: s.ultimoError ?? null, deployDesde: desde };
}

// ── Aviso por voz ───────────────────────────────────────────────

/**
 * Carpetas donde se marca que una sesión pidió el aviso hablado (<session_id>.speak):
 * - la del hook de Windows (~/.claude/hooks/voice_notify.py): %TEMP%\claude-voice
 * - la de WSL (no tiene hook): %USERPROFILE%\.pixel-agents\voz, que desde WSL es /mnt/c/Users/<usuario>/.pixel-agents/voz
 */
export function carpetasVoz(): string[] {
  return [
    path.join(os.tmpdir(), 'claude-voice'),
    path.join(os.homedir() || '.', '.pixel-agents', 'voz'),
  ];
}

/** session_id de un transcript: el nombre del .jsonl, limpio como lo deja el hook. */
export function sesionDe(jsonlFile: string): string {
  return path
    .basename(jsonlFile)
    .replace(/\.jsonl$/i, '')
    .replace(/[^\w-]/g, '')
    .slice(0, 80);
}

export function vozPedida(sesion: string, carpetas = carpetasVoz()): boolean {
  if (!sesion) return false;
  return carpetas.some((c) => {
    try {
      return fs.existsSync(path.join(c, `${sesion}.speak`));
    } catch {
      return false;
    }
  });
}
