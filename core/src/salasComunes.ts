/**
 * Personal (copia de juanfrunegro): salas compartidas entre proyectos. El servidor las arma en el plano
 * (server/src/personal/oficina.ts) y el webview manda ahí a los agentes según lo que hacen
 * (webview-ui/src/personal/lugares.ts). Nadie tiene su puesto de trabajo en estas salas.
 */
export const SALA_DISENO = 'Diseño';
export const SALA_BIBLIOTECA = 'Biblioteca';
export const SALA_CAFETERIA = 'Cafetería';
export const SALA_REUNIONES = 'Reuniones';
export const SALA_PRESENTACIONES = 'Presentaciones';

export const SALAS_COMUNES: readonly string[] = [
  SALA_DISENO,
  SALA_BIBLIOTECA,
  SALA_CAFETERIA,
  SALA_REUNIONES,
  SALA_PRESENTACIONES,
];

export function esSalaComun(nombre: string | null | undefined): boolean {
  return !!nombre && SALAS_COMUNES.includes(nombre);
}
