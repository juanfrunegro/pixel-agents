/**
 * Personal (copia de juanfrunegro): lo que pide atención, para mirar la oficina de reojo en la segunda pantalla.
 * - El título de la pestaña dice cuántos esperan tu permiso y cuántos trabajan ("✋ 1 · 3 trabajando").
 * - Un recuadro chico arriba a la izquierda lista a quién mirar (permiso, errores seguidos, deploy); un clic lo centra.
 */

export type Motivo = 'permiso' | 'humo' | 'deploy';

export interface PersonajeAtencion {
  id: number;
  isActive: boolean;
  isSubagent: boolean;
  currentTool: string | null;
  bubbleType: string | null;
  folderName?: string;
}

export interface SenalesAtencion {
  enUso: (ch: PersonajeAtencion) => boolean;
  dormido: (id: number) => boolean;
  humo: (id: number) => boolean;
  deploy: (id: number) => boolean;
}

export interface ItemAtencion {
  id: number;
  motivo: Motivo;
}

export interface Resumen {
  trabajando: number;
  items: ItemAtencion[];
}

/** Orden de importancia: lo que te bloquea primero. */
const PESO: Record<Motivo, number> = { permiso: 0, humo: 1, deploy: 2 };

export function resumenAtencion(
  personajes: Iterable<PersonajeAtencion>,
  s: SenalesAtencion,
): Resumen {
  let trabajando = 0;
  const items: ItemAtencion[] = [];
  for (const ch of personajes) {
    if (!ch.isSubagent && !s.dormido(ch.id) && s.enUso(ch)) trabajando++;
    if (ch.bubbleType === 'permission') items.push({ id: ch.id, motivo: 'permiso' });
    else if (s.humo(ch.id)) items.push({ id: ch.id, motivo: 'humo' });
    else if (s.deploy(ch.id)) items.push({ id: ch.id, motivo: 'deploy' });
  }
  items.sort((a, b) => PESO[a.motivo] - PESO[b.motivo] || a.id - b.id);
  return { trabajando, items };
}

export const TITULO_BASE = 'Pixel Agents';

export function tituloPestana(r: Resumen): string {
  const permisos = r.items.filter((i) => i.motivo === 'permiso').length;
  const partes: string[] = [];
  if (permisos > 0) partes.push(`✋ ${permisos}`);
  if (r.trabajando > 0) partes.push(`${r.trabajando} trabajando`);
  return partes.length > 0 ? `${partes.join(' · ')} — ${TITULO_BASE}` : TITULO_BASE;
}

export const TEXTO_MOTIVO: Record<Motivo, string> = {
  permiso: 'espera tu permiso',
  humo: 'errores seguidos',
  deploy: 'deployando',
};
