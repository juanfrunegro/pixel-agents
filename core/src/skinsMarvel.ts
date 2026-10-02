/**
 * Personal (copia de juanfrunegro), tanda 5: skins de Marvel, solo estética. Un agente cuyo nombre es uno de estos
 * personajes ("Hulk", "Hulk · bugs", "Spider-Man", "spiderman"…) se dibuja con su skin en la oficina, la ficha y el
 * organigrama; no cambia nada de lo que hace. Los sprites son PNG con el mismo formato que char_N.png (112×96: 7
 * cuadros × abajo/arriba/derecha) en webview-ui/public/assets/marvel/<id>.png, generados por
 * scripts/personal/generar_marvel.py. Sin dependencias: lo usan el servidor y la pantalla.
 */
export const SKINS_MARVEL = [
  { id: 'hulk', nombre: 'Hulk' },
  { id: 'spiderman', nombre: 'Spider-Man' },
  { id: 'ironman', nombre: 'Iron Man' },
  { id: 'thor', nombre: 'Thor' },
  { id: 'deadpool', nombre: 'Deadpool' },
] as const;

export type SkinMarvel = (typeof SKINS_MARVEL)[number]['id'];

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const POR_CLAVE = new Map<string, SkinMarvel>(SKINS_MARVEL.map((s) => [s.id, s.id]));

/** Skin del nombre de un agente (la persona, lo de antes de " · "), o null si no es uno de los cinco. */
export function skinDeNombre(nombre: string | null | undefined): SkinMarvel | null {
  if (!nombre) return null;
  return POR_CLAVE.get(normalizar(nombre.split(' · ')[0])) ?? null;
}

/** Nombres de los cinco con skin, para darlos primero a los agentes descartables. */
export const NOMBRES_CON_SKIN: readonly string[] = SKINS_MARVEL.map((s) => s.nombre);
