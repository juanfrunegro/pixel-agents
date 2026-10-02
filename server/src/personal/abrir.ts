/**
 * Personal (copia de juanfrunegro): clic en una oficina de proyecto → "Abrir carpeta" o "Abrir en VS Code".
 * El cliente manda solo el nombre de la sala y la acción; la ruta sale de la lista de proyectos de Orca (la misma que usa
 * Recargar) y el comando es fijo. Nunca se ejecuta una ruta ni un comando que mande el cliente.
 * "Abrir en Orca" no está: la CLI de Orca (`orca open`) solo abre la app, no un proyecto, así que no sería confiable.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { type ProyectoOrca, proyectosPorSala } from './oficina.js';

export type AccionProyecto = 'carpeta' | 'vscode';
export const ACCIONES: readonly AccionProyecto[] = ['carpeta', 'vscode'];

export interface Comando {
  exe: string;
  args: string[];
}

/** Ruta de WSL vista desde Windows (\\wsl.localhost\<distro>\… o \\wsl$\<distro>\…) → distro y ruta de Linux. */
export function rutaWsl(ruta: string): { distro: string; linux: string } | null {
  const m = /^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/]([^\\/]+)((?:[\\/][^\\/]+)*)[\\/]*$/i.exec(ruta);
  if (!m) return null;
  return { distro: m[1], linux: m[2].replace(/\\/g, '/') || '/' };
}

/** Code.exe de la instalación de usuario de VS Code (la de esta PC); si no está, el `code` del PATH. */
function ejecutableVsCode(env: NodeJS.ProcessEnv): string {
  const local = env.LOCALAPPDATA;
  if (local) {
    const exe = path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return 'code';
}

/** Comando fijo para cada acción. Un proyecto de WSL se abre en VS Code con su extensión de WSL (--remote). */
export function comandoPara(
  accion: AccionProyecto,
  ruta: string,
  env: NodeJS.ProcessEnv = process.env,
  vscode: (env: NodeJS.ProcessEnv) => string = ejecutableVsCode,
): Comando {
  if (accion === 'carpeta') return { exe: 'explorer.exe', args: [ruta.replace(/\//g, '\\')] };
  const wsl = rutaWsl(ruta);
  const exe = vscode(env);
  return wsl
    ? { exe, args: ['--remote', `wsl+${wsl.distro}`, wsl.linux] }
    : { exe, args: [ruta.replace(/\//g, '\\')] };
}

export type Lanzador = (c: Comando) => void;

const lanzar: Lanzador = (c) => {
  const hijo = spawn(c.exe, c.args, { detached: true, stdio: 'ignore', windowsHide: false });
  hijo.on('error', (err) => console.error(`[Pixel Agents] No se pudo abrir ${c.exe}:`, err));
  hijo.unref();
};

/** Abre el proyecto de esa sala. Devuelve el error para mostrar, o null si lo lanzó. */
export function abrirProyecto(
  sala: unknown,
  accion: unknown,
  proyectos: Map<string, ProyectoOrca> = proyectosPorSala(),
  lanzador: Lanzador = lanzar,
): string | null {
  if (typeof sala !== 'string' || !ACCIONES.includes(accion as AccionProyecto)) {
    return 'Pedido inválido.';
  }
  const p = proyectos.get(sala);
  if (!p) return `La sala ${sala} no tiene un proyecto de Orca.`;
  lanzador(comandoPara(accion as AccionProyecto, p.ruta));
  return null;
}
