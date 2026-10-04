/**
 * Personal (copia de juanfrunegro): "avisame por WhatsApp cuando termines". Se pide desde la ficha de la sesión
 * (interruptor) o en el prompt ("avisame por wpp cuando termines": lo marca el hook de voz). La marca es
 * ~/.pixel-agents/whatsapp/<sesión>.on.
 *
 * Avisa cuando termina TODO, no cada agente: la sesión principal terminó su turno, no le queda ninguna herramienta ni
 * sub-agente vivo (tampoco en segundo plano) y así sigue CALMA_MS (un sub-agente en segundo plano que termina hace que
 * la sesión retome enseguida). Avisa una sola vez: después borra la marca.
 *
 * Por proyecto (menú de su oficina): ~/.pixel-agents/whatsapp/proyectos/<proyecto>.on. Avisa cuando todas las sesiones
 * y agentes de ese proyecto están quietos (la misma regla, para cada uno) y así siguen CALMA_MS; también una sola vez.
 *
 * Manda con comando-voz/avisar_whatsapp.py (plantilla aviso_mochi de Meta; si no está aprobada, alerta_sistema marcada
 * "[Mochi, no es del ERP]"). Con PIXEL_WHATSAPP_PRUEBA=1 no manda: lo anota en el log.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { esOficinaLibre } from '../../../core/src/salasComunes.js';
import { sesionValida } from './senales.js';

/** Cuánto tiene que seguir quieta la sesión para darla por terminada. */
export const CALMA_MS = 30_000;

export function carpetaWhatsapp(): string {
  return path.join(os.homedir() || '.', '.pixel-agents', 'whatsapp');
}

/** Desde cuándo pidió el aviso (mtime de la marca, ms), o null si no lo pidió. */
export function pidioWhatsapp(sesion: string, carpeta = carpetaWhatsapp()): number | null {
  if (!sesionValida(sesion)) return null;
  try {
    return fs.statSync(path.join(carpeta, `${sesion}.on`)).mtimeMs;
  } catch {
    return null;
  }
}

/** Prende o apaga el aviso de una sesión. false si la sesión o el valor no son válidos. */
export function escribirWhatsapp(
  sesion: string,
  valor: unknown,
  carpeta = carpetaWhatsapp(),
): boolean {
  if (!sesionValida(sesion) || typeof valor !== 'boolean') return false;
  const archivo = path.join(carpeta, `${sesion}.on`);
  if (valor) {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(archivo, String(Date.now()), 'utf8');
  } else {
    fs.rmSync(archivo, { force: true });
  }
  return true;
}

/** Lo que hace falta del estado de una sesión para saber si terminó todo. */
export interface EstadoSesion {
  isWaiting: boolean;
  activeToolIds: Set<string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  backgroundAgentToolIds: Set<string>;
}

/** Terminó el turno y no le queda nada vivo (herramientas, sub-agentes, sub-agentes en segundo plano). */
export function quieta(s: EstadoSesion): boolean {
  if (!s.isWaiting || s.activeToolIds.size > 0 || s.backgroundAgentToolIds.size > 0) return false;
  for (const subs of s.activeSubagentToolIds.values()) if (subs.size > 0) return false;
  return true;
}

/**
 * Lleva la cuenta de cuándo se quedó quieta cada sesión. `revisar` devuelve true una sola vez, cuando lleva CALMA_MS
 * quieta; si vuelve a trabajar antes, la cuenta arranca de nuevo.
 */
export class EsperaDeFin {
  private desde = new Map<string, number>();

  /** `trabajoDespues`: la sesión escribió algo después de pedir el aviso (si no, avisaría por un turno viejo). */
  revisar(sesion: string, s: EstadoSesion, ahora: number, trabajoDespues = true): boolean {
    return this.revisarQuieto(sesion, quieta(s), ahora, trabajoDespues);
  }

  /** Lo mismo con el "quieto" ya calculado (un proyecto: todas sus sesiones). */
  revisarQuieto(sesion: string, quieto: boolean, ahora: number, trabajoDespues = true): boolean {
    if (!trabajoDespues) return false;
    if (!quieto) {
      this.desde.delete(sesion);
      return false;
    }
    const d = this.desde.get(sesion);
    if (d === undefined) {
      this.desde.set(sesion, ahora);
      return false;
    }
    if (ahora - d < CALMA_MS) return false;
    this.desde.delete(sesion);
    return true;
  }

  olvidar(sesion: string): void {
    this.desde.delete(sesion);
  }

  soloEstas(claves: ReadonlySet<string>): void {
    for (const k of [...this.desde.keys()]) if (!claves.has(k)) this.desde.delete(k);
  }
}

// ── Por proyecto ──────────────────────────────────────────────

/** Un nombre de proyecto que puede tener marca: el de una oficina con proyecto (no "Libre 3" ni "Otros"). */
export function proyectoValido(proyecto: unknown): proyecto is string {
  return (
    typeof proyecto === 'string' &&
    proyecto.length > 0 &&
    proyecto.length <= 80 &&
    proyecto.trim() === proyecto &&
    proyecto !== 'Otros' &&
    !esOficinaLibre(proyecto)
  );
}

/** El nombre va codificado: puede tener espacios o caracteres que no van en un archivo (nunca "/" ni "\"). */
function archivoProyecto(proyecto: string, carpeta: string): string {
  const nombre = encodeURIComponent(proyecto).replace(
    /[*!'()~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return path.join(carpeta, 'proyectos', `${nombre}.on`);
}

/** Prende o apaga el aviso de un proyecto. false si el proyecto o el valor no son válidos. */
export function escribirWhatsappProyecto(
  proyecto: unknown,
  valor: unknown,
  carpeta = carpetaWhatsapp(),
): boolean {
  if (!proyectoValido(proyecto) || typeof valor !== 'boolean') return false;
  const archivo = archivoProyecto(proyecto, carpeta);
  if (valor) {
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, String(Date.now()), 'utf8');
  } else {
    fs.rmSync(archivo, { force: true });
  }
  return true;
}

/** Proyectos con el aviso prendido y desde cuándo (mtime de la marca, ms). */
export function proyectosConWhatsapp(carpeta = carpetaWhatsapp()): Map<string, number> {
  const out = new Map<string, number>();
  let archivos: string[];
  try {
    archivos = fs.readdirSync(path.join(carpeta, 'proyectos'));
  } catch {
    return out;
  }
  for (const a of archivos) {
    if (!a.endsWith('.on')) continue;
    let proyecto: string;
    try {
      proyecto = decodeURIComponent(a.slice(0, -3));
    } catch {
      continue;
    }
    if (!proyectoValido(proyecto)) continue;
    try {
      out.set(proyecto, fs.statSync(path.join(carpeta, 'proyectos', a)).mtimeMs);
    } catch {
      /* la borraron recién */
    }
  }
  return out;
}

/** Una sesión (o agente) del proyecto: su estado y cuándo escribió por última vez (ms). */
export interface SesionDeProyecto extends EstadoSesion {
  lastDataAt: number;
}

/**
 * Cuándo terminó todo un proyecto: todas sus sesiones y agentes quietos durante CALMA_MS, y alguno trabajó después de
 * pedir el aviso (si no, avisaría por un turno viejo). Si trabajaron y después cerraron todas las sesiones, también
 * terminó. Sin trabajo después del pedido no avisa nunca, aunque no haya ninguna sesión abierta.
 */
export class EsperaDeProyectos {
  private espera = new EsperaDeFin();
  private trabajaron = new Set<string>();

  revisar(proyecto: string, sesiones: SesionDeProyecto[], pedido: number, ahora: number): boolean {
    if (sesiones.some((s) => s.lastDataAt > pedido)) this.trabajaron.add(proyecto);
    const listo = this.espera.revisarQuieto(
      proyecto,
      sesiones.every(quieta),
      ahora,
      this.trabajaron.has(proyecto),
    );
    if (listo) this.trabajaron.delete(proyecto);
    return listo;
  }

  /** Olvida los proyectos que ya no tienen la marca (la apagaron). */
  soloEstos(proyectos: Iterable<string>): void {
    const siguen = new Set(proyectos);
    for (const p of this.trabajaron) if (!siguen.has(p)) this.trabajaron.delete(p);
    this.espera.soloEstas(siguen);
  }
}

/** Primera oración de la última respuesta, para el detalle del aviso (sin saltos de línea; tope 160). */
export function resumenParaAviso(texto: string | undefined): string {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return 'Terminó lo que le pediste.';
  const oracion = /^(.{20,}?[.!?])(\s|$)/.exec(limpio)?.[1] ?? limpio;
  return oracion.length > 160 ? `${oracion.slice(0, 157)}…` : oracion;
}

export function scriptWhatsapp(): string {
  return (
    process.env.PIXEL_WHATSAPP_SCRIPT ||
    path.join(os.homedir() || '.', 'Documents', 'IA Tools', 'comando-voz', 'avisar_whatsapp.py')
  );
}

/** Manda el WhatsApp (proceso aparte, sin shell: el texto viaja como argumento). En prueba solo lo anota. */
export function enviarWhatsapp(titulo: string, detalle: string): void {
  if (process.env.PIXEL_WHATSAPP_PRUEBA) {
    console.log(`[Pixel Agents] WhatsApp (prueba, no se manda): ${titulo} — ${detalle}`);
    return;
  }
  const script = scriptWhatsapp();
  if (!fs.existsSync(script)) {
    console.error(`[Pixel Agents] WhatsApp: no está ${script}`);
    return;
  }
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const p = spawn(python, [script, titulo, detalle], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let salida = '';
  p.stdout?.on('data', (d: Buffer) => (salida += d.toString()));
  p.stderr?.on('data', (d: Buffer) => (salida += d.toString()));
  p.on('error', (e) => console.error('[Pixel Agents] WhatsApp:', e.message));
  p.on('close', (code) =>
    console.log(
      `[Pixel Agents] WhatsApp (${code === 0 ? 'enviado' : `falló, código ${code}`}): ${salida.trim()}`,
    ),
  );
}
