/**
 * Personal (copia de juanfrunegro): el último informe de cada manager (GET /informes, server/src/personal/informes.ts).
 * Clic en el escritorio de un manager → panel con su informe (PanelInforme.tsx). Semáforo: si un manager escaló o pidió
 * una decisión, su placa y la del CEO parpadean hasta que Juan abre ese informe (clic en cualquiera de las dos). Los
 * informes leídos se recuerdan en este navegador (localStorage), así que al recargar no vuelven a parpadear.
 */
import { useSyncExternalStore } from 'react';

import { type Placa, placasDelPlano, tipoManagerDe } from './placas.js';

export interface Informe {
  tipo: string;
  titulo: string;
  fecha: number;
  estado: string;
  resultado: string;
  decision: string;
  necesitaCeo: boolean;
  texto: string;
}

const CLAVE = 'pixel-informes-leidos';
/** Escritorio de rol: DESK_FRONT de 3×2 (server/src/personal/oficina.ts). */
const ANCHO_ESCRITORIO = 3;
const ALTO_ESCRITORIO = 2;

let informes: Informe[] = [];
let abierto: Informe | null = null;
let version = 0;
const oyentes = new Set<() => void>();
function avisar(): void {
  version++;
  oyentes.forEach((f) => f());
}

const idDe = (i: Informe) => `${i.tipo}@${i.fecha}`;

function leerLeidos(): Set<string> {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE) : null;
    const lista = v ? (JSON.parse(v) as unknown) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
let leidos = leerLeidos();

function guardarLeidos(): void {
  try {
    // Solo los de los informes vigentes: la lista no crece para siempre.
    const vigentes = new Set(informes.map(idDe));
    localStorage.setItem(CLAVE, JSON.stringify([...leidos].filter((id) => vigentes.has(id))));
  } catch {
    /* sin almacenamiento: vuelve a parpadear al recargar */
  }
}

/** Guarda la respuesta de /informes ({ informes: [...] }), descartando lo que no tiene forma. */
export function setInformes(json: unknown): void {
  const lista = (json as { informes?: unknown } | null)?.informes;
  informes = Array.isArray(lista)
    ? (lista as Informe[]).filter(
        (i) => i && typeof i.tipo === 'string' && typeof i.texto === 'string',
      )
    : [];
  avisar();
}

export async function cargarInformes(
  pedir: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (u) => fetch(u),
): Promise<void> {
  try {
    const busqueda = typeof window === 'undefined' ? '' : window.location.search;
    const token = new URLSearchParams(busqueda).get('token') ?? '';
    const r = await pedir(`/informes?token=${encodeURIComponent(token)}`);
    if (r.ok) setInformes(await r.json());
  } catch {
    /* sin server: quedan los de la vuelta anterior */
  }
}

/** Último informe del manager de una sala ("ERP" → manager-erp). */
export function informeDeSala(sala: string | null): Informe | undefined {
  if (!sala) return undefined;
  const tipo = tipoManagerDe(sala);
  return informes.find((i) => i.tipo === tipo);
}

/** Informes que esperan una decisión del CEO y Juan todavía no abrió. */
export function pendientesCeo(): Informe[] {
  return informes.filter((i) => i.necesitaCeo && !leidos.has(idDe(i)));
}

/** La placa parpadea: la del CEO si hay alguno pendiente; la de un manager, si el suyo lo está. */
export function parpadea(p: Pick<Placa, 'rol' | 'sala'>): boolean {
  if (p.rol === 'ceo') return pendientesCeo().length > 0;
  const i = informeDeSala(p.sala);
  return !!i && i.necesitaCeo && !leidos.has(idDe(i));
}

export function abrirInforme(i: Informe): void {
  abierto = i;
  leidos.add(idDe(i));
  guardarLeidos();
  avisar();
}

export function cerrarInforme(): void {
  abierto = null;
  avisar();
}

/**
 * Clic en un tile: si cae en el escritorio de un manager con informe, lo abre; en el del CEO, abre el pendiente más
 * nuevo (si no hay ninguno, el clic sigue de largo). true si lo atendió.
 */
export function clicInforme(col: number, row: number): boolean {
  const p = placasDelPlano().find(
    (x) =>
      col >= x.col &&
      col < x.col + ANCHO_ESCRITORIO &&
      row >= x.row &&
      row < x.row + ALTO_ESCRITORIO,
  );
  if (!p) return false;
  const i = p.rol === 'ceo' ? pendientesCeo()[0] : informeDeSala(p.sala);
  if (!i) return false;
  abrirInforme(i);
  return true;
}

export function useInformes(): { abierto: Informe | null } {
  useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => version,
  );
  return { abierto };
}

/** Solo para tests. */
export function _reiniciarInformes(): void {
  informes = [];
  abierto = null;
  leidos = leerLeidos();
}

// ── Para leerlo cómodo (PanelInforme.tsx) ────────────────────────

export interface Seccion {
  titulo: string;
  /** Texto suelto (la línea de la etiqueta y las que siguen sin viñeta). */
  parrafos: string[];
  /** Viñetas ("- …"). */
  vinetas: string[];
}

/** Etiqueta del informe ("Resultado: …"): sin viñeta, empieza en mayúscula y termina en dos puntos. */
const ETIQUETA = /^([A-ZÁÉÍÓÚ¿][^:\n]{1,40}):\s*(.*)$/;

/**
 * El informe partido en secciones por sus etiquetas, sin el encabezado "## Informe de…" y sin las que el panel ya
 * muestra arriba (`omitir`: Estado y la decisión). Lo de antes de la primera etiqueta va en una sección sin título.
 */
export function seccionesDe(
  texto: string,
  omitir: RegExp = /^(Estado|Decisi[oó]n que necesito)/i,
): Seccion[] {
  const out: Seccion[] = [];
  let actual: Seccion = { titulo: '', parrafos: [], vinetas: [] };
  const cerrar = () => {
    if (!omitir.test(actual.titulo) && (actual.parrafos.length || actual.vinetas.length)) {
      out.push(actual);
    }
  };
  for (const cruda of texto.split(/\r?\n/)) {
    const l = cruda.trim();
    if (!l || /^#/.test(l)) continue;
    const vineta = /^[-*•]\s+(.*)$/.exec(l);
    if (vineta) {
      actual.vinetas.push(vineta[1]);
      continue;
    }
    const m = ETIQUETA.exec(l);
    if (m && !/^https?$/i.test(m[1])) {
      cerrar();
      actual = { titulo: m[1].trim(), parrafos: m[2] ? [m[2]] : [], vinetas: [] };
      continue;
    }
    actual.parrafos.push(l);
  }
  cerrar();
  return out;
}

/** Color del estado: verde aprobado, ámbar con cambios, rojo rechazado o escalado. */
export function tonoEstado(estado: string): 'ok' | 'cambios' | 'mal' | 'nada' {
  if (/RECHAZADO|ESCALADO/i.test(estado)) return 'mal';
  if (/CAMBIOS/i.test(estado)) return 'cambios';
  if (/APROBADO/i.test(estado)) return 'ok';
  return 'nada';
}
