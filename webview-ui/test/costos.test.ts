import { beforeEach, describe, expect, it } from 'vitest';

import { cargarCostos, costoDe, setCostos, textoCosto } from '../src/personal/costos.js';

describe('personal: costo del día por oficina', () => {
  beforeEach(() => setCostos(null));

  it('texto chico: entero desde $10, un decimal abajo, nada por debajo de 50 centavos', () => {
    expect(textoCosto(12.4)).toBe('~$12');
    expect(textoCosto(3.44)).toBe('~$3.4');
    expect(textoCosto(0.3)).toBeNull();
    expect(textoCosto(undefined)).toBeNull();
    expect(textoCosto(Number.NaN)).toBeNull();
  });

  it('toma proyecto y costo de /hoy.json e ignora lo que no tiene forma', () => {
    setCostos({
      proyectos: [{ proyecto: 'ERP', costo: 5 }, { proyecto: 'Chaina' }, { costo: 3 }, 'x'],
    });
    expect(costoDe('ERP')).toBe(5);
    expect(costoDe('Chaina')).toBeUndefined();
    setCostos('basura');
    expect(costoDe('ERP')).toBeUndefined();
  });

  it('si el pedido falla, quedan los de la vuelta anterior', async () => {
    await cargarCostos(async () => ({
      ok: true,
      json: async () => ({ proyectos: [{ proyecto: 'ERP', costo: 7 }] }),
    }));
    expect(costoDe('ERP')).toBe(7);
    await cargarCostos(async () => ({ ok: false, json: async () => ({}) }));
    await cargarCostos(async () => {
      throw new Error('sin red');
    });
    expect(costoDe('ERP')).toBe(7);
  });
});
