import { describe, expect, it } from 'vitest';

import {
  type CandidatoOficina,
  estadoPizarra,
  opcionesAsignar,
  ORIGEN_TEXTO,
  setOficinas,
} from '../src/personal/pizarra.js';

describe('asignar cualquier carpeta a una oficina', () => {
  const oficinas = [
    { sala: 'Chaina', proyecto: 'Chaina' },
    { sala: 'Libre 2', proyecto: null },
  ];
  const IA = 'C:\\Users\\juanf\\Documents\\IA Tools';
  const candidatos: CandidatoOficina[] = [
    { nombre: 'Coucou', ruta: `${IA}\\coucou`, origen: 'orca', modificado: 300 },
    {
      nombre: 'Investment tracker',
      ruta: `${IA}\\investment-tracker`,
      origen: 'carpeta',
      modificado: 200,
    },
    { nombre: 'Mi dashboard', ruta: 'D:\\x\\mi-dashboard', origen: 'otra', modificado: 250 },
    {
      nombre: 'Chaina',
      ruta: 'C:\\Users\\juanf\\Documents\\Chaina',
      origen: 'orca',
      modificado: 999,
    },
  ];
  const disponibles = candidatos.map((c) => c.nombre);

  it('con datos del servidor: la carpeta tocada más reciente primero, con su origen y ruta; las ubicadas al final', () => {
    expect(opcionesAsignar('Libre 2', oficinas, disponibles, candidatos)).toEqual([
      { proyecto: 'Coucou', intercambia: false, origen: 'orca', ruta: `${IA}\\coucou` },
      { proyecto: 'Mi dashboard', intercambia: false, origen: 'otra', ruta: 'D:\\x\\mi-dashboard' },
      {
        proyecto: 'Investment tracker',
        intercambia: false,
        origen: 'carpeta',
        ruta: `${IA}\\investment-tracker`,
      },
      {
        proyecto: 'Chaina',
        intercambia: true,
        origen: 'orca',
        ruta: 'C:\\Users\\juanf\\Documents\\Chaina',
      },
    ]);
  });

  it('marca de dónde viene cada una', () => {
    expect(ORIGEN_TEXTO).toEqual({ orca: 'Orca', carpeta: 'IA Tools', otra: 'agregada' });
  });

  it('oficinasEstado guarda los candidatos (y tolera un servidor viejo que no los manda)', () => {
    setOficinas(oficinas, disponibles, candidatos);
    expect(estadoPizarra().candidatos).toHaveLength(4);
    setOficinas(oficinas, disponibles, undefined);
    expect(estadoPizarra().candidatos).toEqual([]);
  });
});
