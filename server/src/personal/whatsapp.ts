/**
 * Personal (copia de juanfrunegro): "avisame por WhatsApp cuando termines". Se pide desde la ficha de la sesión
 * (interruptor) o en el prompt ("avisame por wpp cuando termines": lo marca el hook de voz). La marca es
 * ~/.pixel-agents/whatsapp/<sesión>.on.
 *
 * Avisa cuando termina TODO, no cada agente: la sesión principal terminó su turno, no le queda ninguna herramienta ni
 * sub-agente vivo (tampoco en segundo plano) y así sigue CALMA_MS (un sub-agente en segundo plano que termina hace que
 * la sesión retome enseguida). Avisa una sola vez: después borra la marca.
 *
 * Manda con comando-voz/avisar_whatsapp.py (plantilla aviso_mochi de Meta; si no está aprobada, alerta_sistema marcada
 * "[Mochi, no es del ERP]"). Con PIXEL_WHATSAPP_PRUEBA=1 no manda: lo anota en el log.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
    if (!trabajoDespues) return false;
    if (!quieta(s)) {
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
