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
/** Cabina de los otros motores (Codex, Pi, Antigravity), que no son sesiones de Claude: los dibuja el webview con lo que dice Orca. */
export const SALA_CONTRATISTAS = 'Contratistas';

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
  SALA_CONTRATISTAS,
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

/**
 * Oficina por niveles: asientos con dueño por rol. En cada oficina de proyecto, el escritorio del manager (arriba al
 * centro); en el Brain, el del CEO. Nadie más se sienta ahí: el manager llega cuando lo lanzan y el CEO cuando delega.
 * Los uid de los muebles son `<sala>-<id>` (server/src/personal/oficina.ts).
 */
export const ID_SILLA_MANAGER = 'manager-silla';
export const ID_SILLA_CEO = 'ceo-silla';

export function esSillaManager(uid: string | null | undefined): boolean {
  return !!uid && uid.endsWith(`-${ID_SILLA_MANAGER}`);
}

export function esSillaCeo(uid: string | null | undefined): boolean {
  return !!uid && uid.endsWith(`-${ID_SILLA_CEO}`);
}

export function esAsientoReservado(uid: string | null | undefined): boolean {
  return esSillaManager(uid) || esSillaCeo(uid);
}
