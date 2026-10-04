/**
 * Personal (copia de juanfrunegro): costo del día de cada oficina en su cartel ("ERP ~$12"). Sale de GET /hoy.json (el
 * mismo cálculo que el botón Hoy: equivalente a precio de API, no plata gastada), que se pide cada REFRESCO_MS desde
 * PanelesPersonales. Sin dato o por debajo de MINIMO, el cartel queda como siempre.
 */

/** Por debajo de esto (USD) no se muestra: un cartel con "~$0" no dice nada. */
export const MINIMO = 0.5;

let costos = new Map<string, number>();

/** Costo del día de un proyecto (sala), en USD; undefined si no trabajó hoy. */
export function costoDe(sala: string): number | undefined {
  return costos.get(sala);
}

/** Texto chico para el cartel: "~$12", "~$3.4"; null si no hay que mostrar nada. */
export function textoCosto(usd: number | undefined): string | null {
  if (usd === undefined || !Number.isFinite(usd) || usd < MINIMO) return null;
  return `~$${usd >= 10 ? Math.round(usd) : usd.toFixed(1)}`;
}

/** Guarda los costos de la respuesta de /hoy.json ({ proyectos: [{ proyecto, costo }] }). */
export function setCostos(json: unknown): void {
  const lista = (json as { proyectos?: unknown } | null)?.proyectos;
  const m = new Map<string, number>();
  if (Array.isArray(lista)) {
    for (const p of lista as Array<{ proyecto?: unknown; costo?: unknown }>) {
      if (typeof p.proyecto === 'string' && typeof p.costo === 'number') m.set(p.proyecto, p.costo);
    }
  }
  costos = m;
}

/** Pide el resumen del día al servidor (con el token de la URL). Si falla, quedan los de la vuelta anterior. */
export async function cargarCostos(
  pedir: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (u) => fetch(u),
): Promise<void> {
  try {
    const busqueda = typeof window === 'undefined' ? '' : window.location.search;
    const token = new URLSearchParams(busqueda).get('token') ?? '';
    const r = await pedir(`/hoy.json?token=${encodeURIComponent(token)}`);
    if (r.ok) setCostos(await r.json());
  } catch {
    /* sin red o sin server: el cartel sigue con lo último */
  }
}
