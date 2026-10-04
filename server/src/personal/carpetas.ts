/**
 * Personal (copia de juanfrunegro): carpetas que se pueden poner en una oficina además de los proyectos de Orca.
 *
 * - Las subcarpetas de la raíz de proyectos de Juan (por defecto Documents\IA Tools; se cambia en
 *   ~/.pixel-agents/carpetas.json, clave "raiz").
 * - "Otra carpeta…": cualquier ruta que Juan escriba en el menú, validada acá (existe, es carpeta, no es del sistema).
 *
 * Una carpeta que no es de Orca y se asigna a una oficina queda guardada en carpetas.json ("extras"), así sus agentes
 * caen en esa oficina también después de reiniciar, igual que los de Orca.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Carpeta {
  nombre: string;
  ruta: string;
}

interface ArchivoCarpetas {
  raiz: string;
  extras: Carpeta[];
}

export function rutaCarpetas(): string {
  return path.join(os.homedir() || '.', '.pixel-agents', 'carpetas.json');
}

export function raizPorDefecto(): string {
  return path.join(os.homedir() || '.', 'Documents', 'IA Tools');
}

/** Como leerCarpetas, pero si el archivo existe y está roto tira el error (no existe = valores por defecto). */
function leerCarpetasEstricto(ruta: string): ArchivoCarpetas {
  let crudo: string;
  try {
    crudo = fs.readFileSync(ruta, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return { raiz: raizPorDefecto(), extras: [] };
    throw e;
  }
  const d = JSON.parse(crudo) as { raiz?: unknown; extras?: unknown };
  const extras = Array.isArray(d.extras)
    ? d.extras.filter(
        (e): e is Carpeta =>
          !!e &&
          typeof (e as Carpeta).nombre === 'string' &&
          typeof (e as Carpeta).ruta === 'string',
      )
    : [];
  return {
    raiz: typeof d.raiz === 'string' && d.raiz.trim() ? d.raiz.trim() : raizPorDefecto(),
    extras,
  };
}

export function leerCarpetas(ruta = rutaCarpetas()): ArchivoCarpetas {
  try {
    return leerCarpetasEstricto(ruta);
  } catch {
    return { raiz: raizPorDefecto(), extras: [] };
  }
}

/** Suma una carpeta a los extras (si ya estaba por ruta, no la repite). Con carpetas.json roto no lo pisa: lo avisa. */
export function guardarExtra(c: Carpeta, ruta = rutaCarpetas()): void {
  let d: ArchivoCarpetas;
  try {
    d = leerCarpetasEstricto(ruta);
  } catch (e) {
    console.error(`[Pixel Agents] carpetas.json ilegible, no se guarda la carpeta: ${String(e)}`);
    return;
  }
  if (d.extras.some((e) => mismaRuta(e.ruta, c.ruta))) return;
  d.extras.push(c);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
  fs.renameSync(tmp, ruta);
}

/** Clave para comparar rutas de Windows: barras unificadas, sin barra final, sin mayúsculas. */
export function claveRuta(r: string): string {
  return r.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function mismaRuta(a: string, b: string): boolean {
  return claveRuta(a) === claveRuta(b);
}

export interface SubCarpeta extends Carpeta {
  modificado: number;
}

/** Subcarpetas de la raíz de proyectos (sin las ocultas ni node_modules), la más tocada primero. */
export function subcarpetas(raiz: string): SubCarpeta[] {
  let nombres: fs.Dirent[];
  try {
    nombres = fs.readdirSync(raiz, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SubCarpeta[] = [];
  for (const d of nombres) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'node_modules') continue;
    const ruta = path.join(raiz, d.name);
    out.push({ nombre: d.name, ruta, modificado: modificado(ruta) });
  }
  return out.sort((a, b) => b.modificado - a.modificado);
}

/** Última modificación de una carpeta (0 si no se puede leer). */
export function modificado(ruta: string): number {
  try {
    return fs.statSync(ruta).mtimeMs;
  } catch {
    return 0;
  }
}

// ── "Otra carpeta…" ──────────────────────────────────────────────

export interface OpcionesValidar {
  /** Home de Windows (C:\Users\juanf): el home entero no se acepta, sus subcarpetas sí. */
  home: string;
  /** Distro de WSL para traducir /home/... (las sesiones de WSL se leen por \\wsl.localhost\<distro>). */
  distro: string;
  esCarpeta: (ruta: string) => boolean;
}

const OPCIONES: OpcionesValidar = {
  home: os.homedir(),
  distro: 'Ubuntu',
  esCarpeta: (r) => {
    try {
      return fs.statSync(r).isDirectory();
    } catch {
      return false;
    }
  },
};

/** Carpetas de Windows que nunca son un proyecto (ellas y todo lo de adentro). */
const DE_SISTEMA = [
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  '$recycle.bin',
  'system volume information',
  'recovery',
];

/**
 * Valida la ruta que Juan escribe en "Otra carpeta…" y la devuelve normalizada. Acepta rutas de Windows (C:\...),
 * de WSL por red (\\wsl.localhost\Ubuntu\...) y de WSL escritas como /home/... (se traducen a \\wsl.localhost).
 * Rechaza rutas relativas, raíces de disco, carpetas del sistema, el home entero (de Windows o de WSL) y lo que no
 * existe o no es carpeta.
 */
export function validarCarpeta(
  crudo: unknown,
  op: OpcionesValidar = OPCIONES,
): { ruta: string } | { error: string } {
  if (typeof crudo !== 'string') return { error: 'Escribí la ruta de una carpeta.' };
  let r = crudo
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();
  if (!r) return { error: 'Escribí la ruta de una carpeta.' };
  if (r.length > 400 || /[\0<>|?*]/.test(r)) return { error: 'Esa ruta no es válida.' };

  if (r.startsWith('/')) {
    // Ruta de WSL: /home/juanf/... → \\wsl.localhost\Ubuntu\home\juanf\...
    if (!/^\/home\/[^/]+\/.+/.test(r)) {
      return { error: 'De WSL solo se aceptan carpetas dentro de /home/<usuario>/.' };
    }
    r = `\\\\wsl.localhost\\${op.distro}${r.replace(/\//g, '\\')}`;
  }

  const unc = /^[\\/]{2}/.test(r);
  if (!unc && !/^[a-zA-Z]:[\\/]/.test(r)) {
    return {
      error: 'La ruta tiene que ser completa, por ejemplo C:\\Users\\juanf\\Documents\\algo.',
    };
  }
  const norm = path.win32.normalize(r).replace(/\\+$/, '');
  const partes = norm.split('\\').filter(Boolean);

  if (unc) {
    // \\wsl.localhost\Ubuntu\home\<usuario>\<algo>: como mínimo una carpeta dentro del home de WSL.
    const [host, , dir1, , ...resto] = partes;
    if (!/^wsl(\.localhost|\$)$/i.test(host ?? '') || (dir1 ?? '').toLowerCase() !== 'home') {
      return {
        error: 'De red solo se aceptan carpetas de WSL (\\\\wsl.localhost\\...\\home\\...).',
      };
    }
    if (resto.length === 0) return { error: 'Elegí una carpeta de proyecto, no el home entero.' };
  } else {
    if (partes.length <= 1)
      return { error: 'Elegí una carpeta de proyecto, no la raíz del disco.' };
    if (DE_SISTEMA.includes(partes[1].toLowerCase())) {
      return { error: 'Esa es una carpeta del sistema.' };
    }
    const home = claveRuta(path.win32.normalize(op.home));
    const clave = claveRuta(norm);
    if (clave === home || clave === claveRuta(path.win32.dirname(home))) {
      return { error: 'Elegí una carpeta de proyecto, no el home entero.' };
    }
    if (clave.startsWith(`${home}\\appdata`)) return { error: 'Esa es una carpeta del sistema.' };
  }

  if (!op.esCarpeta(norm)) return { error: 'Esa carpeta no existe.' };
  return { ruta: norm };
}
