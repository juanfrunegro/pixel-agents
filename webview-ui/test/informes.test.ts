import { beforeEach, describe, expect, it } from 'vitest';

import type { PlacedFurniture } from '../src/office/types.js';
import {
  _reiniciarInformes,
  cerrarInforme,
  clicInforme,
  informeDeSala,
  parpadea,
  pendientesCeo,
  setInformes,
} from '../src/personal/informes.js';
import { _reiniciarPlacas, setPlacas } from '../src/personal/placas.js';

const informe = (tipo: string, necesitaCeo: boolean, fecha = 1) => ({
  tipo,
  titulo: 'pedido',
  fecha,
  estado: necesitaCeo ? 'ESCALADO' : 'APROBADO',
  resultado: '',
  decision: necesitaCeo ? '¿Aplico la 00170?' : 'ninguna',
  necesitaCeo,
  texto: '## Informe',
});

const escritorio = (uid: string, col: number, row: number) =>
  ({ uid, type: 'DESK_FRONT', col, row }) as PlacedFurniture;

describe('personal: informes de los managers y semáforo del CEO', () => {
  beforeEach(() => {
    _reiniciarInformes();
    _reiniciarPlacas();
    setPlacas(
      [escritorio('brain-ceo-escritorio', 10, 10), escritorio('erp-manager-escritorio', 0, 0)],
      (col) => (col >= 10 ? 'Brain' : 'ERP'),
    );
  });

  it('cada sala tiene el informe de su manager', () => {
    setInformes({ informes: [informe('manager-erp', false)] });
    expect(informeDeSala('ERP')?.tipo).toBe('manager-erp');
    expect(informeDeSala('Chaina')).toBeUndefined();
  });

  it('sin decisiones pendientes no parpadea nada', () => {
    setInformes({ informes: [informe('manager-erp', false)] });
    expect(parpadea({ rol: 'ceo', sala: 'Brain' })).toBe(false);
    expect(parpadea({ rol: 'manager', sala: 'ERP' })).toBe(false);
  });

  it('una decisión pendiente hace parpadear al CEO y al manager hasta que se abre el informe', () => {
    setInformes({ informes: [informe('manager-erp', true)] });
    expect(parpadea({ rol: 'ceo', sala: 'Brain' })).toBe(true);
    expect(parpadea({ rol: 'manager', sala: 'ERP' })).toBe(true);
    // Clic en el escritorio del CEO: abre el pendiente y se apaga.
    expect(clicInforme(11, 11)).toBe(true);
    cerrarInforme();
    expect(pendientesCeo()).toHaveLength(0);
    expect(parpadea({ rol: 'manager', sala: 'ERP' })).toBe(false);
    // Un informe nuevo del mismo manager vuelve a prenderlo.
    setInformes({ informes: [informe('manager-erp', true, 2)] });
    expect(parpadea({ rol: 'ceo', sala: 'Brain' })).toBe(true);
  });

  it('el clic fuera de un escritorio, o sin informe, sigue de largo', () => {
    expect(clicInforme(1, 0)).toBe(false); // escritorio del manager, sin informe
    setInformes({ informes: [informe('manager-erp', false)] });
    expect(clicInforme(11, 10)).toBe(false); // CEO sin pendientes
    expect(clicInforme(5, 5)).toBe(false);
    expect(clicInforme(2, 1)).toBe(true);
  });

  it('ignora respuestas sin forma', () => {
    setInformes('basura');
    setInformes({ informes: [{ tipo: 3 }, null] });
    expect(informeDeSala('ERP')).toBeUndefined();
  });
});
