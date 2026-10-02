import { describe, expect, it } from 'vitest';

import { CamaraPersonal, panParaSeguir } from '../src/personal/camara.js';

// Oficina de 33 × 24 tiles (16 px) con zoom 2: 1056 × 768 px.
const oficina = { zoom: 2, mapW: 1056, mapH: 768 };

describe('cámara al tocar un agente', () => {
  it('si la oficina entra entera, no se mueve (antes se corría para centrar al agente)', () => {
    const g = { ...oficina, vistaW: 1920, vistaH: 1080 };
    // Agente en la sala de abajo a la derecha.
    expect(panParaSeguir({ x: 500, y: 360 }, { x: 0, y: 0 }, g)).toEqual({ x: 0, y: 0 });
  });

  it('si no entra, centra al agente pero sin dejar pantalla vacía fuera de la oficina', () => {
    const g = { ...oficina, vistaW: 600, vistaH: 400 };
    const pan = panParaSeguir({ x: 520, y: 370 }, { x: 0, y: 0 }, g);
    // Borde derecho de la oficina pegado al borde derecho de la vista, ni un px de vacío.
    expect(pan.x).toBe(-(1056 - 600) / 2);
    expect(pan.y).toBe(-(768 - 400) / 2);
    // Un agente del medio sí queda centrado.
    const medio = panParaSeguir({ x: 264, y: 200 }, { x: 0, y: 0 }, g);
    expect((600 - 1056) / 2 + medio.x + 264 * 2).toBe(300);
  });

  it('si entra entera pero el agente quedó fuera de la vista por un paneo, vuelve al centro', () => {
    const g = { ...oficina, vistaW: 1200, vistaH: 1080 };
    expect(panParaSeguir({ x: 520, y: 200 }, { x: 800, y: 0 }, g).x).toBe(0);
  });

  it('al soltar al agente vuelve a donde estaba; un paneo manual cancela la vuelta', () => {
    const g = { ...oficina, vistaW: 600, vistaH: 400 };
    const c = new CamaraPersonal();
    const antes = { x: 40, y: -10 };
    expect(c.objetivo(null, null, antes, g)).toBeNull();
    expect(c.objetivo(7, { x: 520, y: 370 }, antes, g)).not.toBeNull();
    // Cambiar a otro agente no pisa el punto de vuelta.
    c.objetivo(8, { x: 100, y: 100 }, { x: -200, y: -150 }, g);
    expect(c.objetivo(null, null, { x: -200, y: -150 }, g)).toEqual(antes);
    expect(c.volviendo).toBe(true);
    c.llego();
    expect(c.objetivo(null, null, antes, g)).toBeNull();

    c.objetivo(7, { x: 520, y: 370 }, antes, g);
    c.paneoManual();
    expect(c.objetivo(null, null, { x: 0, y: 0 }, g)).toBeNull();
  });
});
