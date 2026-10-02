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

/**
 * Escenario de Presentaciones: fila (contada desde la primera fila de piso de la sala) donde se para quien presenta.
 * Lo bastante lejos de la pared para que su tarjeta quede dentro de la sala; las sillas del público van más abajo.
 */
export const ESCENARIO_FILA = 3;

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

/**
 * Oficina de proyecto sin proyecto asignado (server/src/personal/ocupacion.ts): se llama "Libre 1", "Libre 2"… según su
 * lugar en el plano. Nadie se sienta ahí ni la usa de paso; en la pared dice solo "Libre", tenue.
 */
export const PREFIJO_LIBRE = 'Libre ';

export function nombreLibre(lugar: number): string {
  return `${PREFIJO_LIBRE}${lugar + 1}`;
}

export function esOficinaLibre(nombre: string | null | undefined): boolean {
  return !!nombre && /^Libre \d+$/.test(nombre);
}
