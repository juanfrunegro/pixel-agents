/**
 * Personal (copia de juanfrunegro): cámara al tocar un agente.
 *
 * El original centraba la cámara en el agente sin mirar los bordes de la oficina: con un agente en una sala de la
 * esquina, media pantalla quedaba vacía y la oficina cortada, y al soltarlo la cámara se quedaba ahí. Acá:
 * - si la oficina entra entera en un eje, en ese eje no se mueve (solo vuelve al centro si el agente quedó fuera);
 * - si no entra, centra al agente pero sin pasar los bordes de la oficina;
 * - al soltar el agente (clic en él o en el piso) vuelve a donde estaba antes de seguirlo. Un paneo manual cancela
 *   la vuelta.
 */

/** Medio tile: el personaje se dibuja hacia arriba desde sus pies, así queda centrado su cuerpo y no sus pies. */
const AJUSTE_Y = 8;

export interface Geometria {
  zoom: number;
  mapW: number; // ancho de la oficina en px de pantalla (cols × TILE_SIZE × zoom)
  mapH: number;
  vistaW: number; // ancho del canvas en px de pantalla
  vistaH: number;
}

export interface Punto {
  x: number;
  y: number;
}

function eje(centro: number, actual: number, zoom: number, mapa: number, vista: number): number {
  const ideal = mapa / 2 - centro * zoom;
  if (mapa <= vista) {
    // Entra entera: no mover, salvo que el agente esté fuera de la vista con el paneo actual.
    const enPantalla = (vista - mapa) / 2 + actual + centro * zoom;
    return enPantalla >= 0 && enPantalla <= vista ? actual : 0;
  }
  const max = (mapa - vista) / 2;
  return Math.max(-max, Math.min(max, ideal));
}

/** Paneo para seguir a un agente (coordenadas de mundo) sin sacar la oficina de cuadro. */
export function panParaSeguir(foco: Punto, actual: Punto, g: Geometria): Punto {
  return {
    x: eje(foco.x, actual.x, g.zoom, g.mapW, g.vistaW),
    y: eje(foco.y - AJUSTE_Y, actual.y, g.zoom, g.mapH, g.vistaH),
  };
}

/** Recuerda dónde estaba la cámara antes de seguir a un agente para volver ahí al soltarlo. */
export class CamaraPersonal {
  private seguidoAntes: number | null = null;
  private panAntes: Punto | null = null;
  private volverA: Punto | null = null;

  /** Llamar cuando el usuario panea a mano (cancela seguir y volver). */
  paneoManual(): void {
    this.seguidoAntes = null;
    this.panAntes = null;
    this.volverA = null;
  }

  /** Objetivo de paneo de este cuadro: seguir al agente, volver a donde estaba, o null (no mover). */
  objetivo(seguido: number | null, foco: Punto | null, pan: Punto, g: Geometria): Punto | null {
    if (seguido !== null && this.seguidoAntes === null) {
      this.panAntes = { ...pan };
      this.volverA = null;
    } else if (seguido === null && this.seguidoAntes !== null) {
      this.volverA = this.panAntes;
      this.panAntes = null;
    }
    this.seguidoAntes = seguido;
    if (seguido !== null && foco) return panParaSeguir(foco, pan, g);
    return seguido === null ? this.volverA : null;
  }

  /** Llamar cuando la cámara llegó al objetivo de vuelta. */
  llego(): void {
    this.volverA = null;
  }

  get volviendo(): boolean {
    return this.volverA !== null;
  }
}
