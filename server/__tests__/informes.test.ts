import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { informesAsync, parsearInforme, ultimoInforme } from '../src/personal/informes.js';

const INFORME = `Listo, acá va.

## Informe de manager-erp — Reglas de conciliación sin test — 4/10/2026
**Estado:** APROBADO (solo lectura)
**Criterio de listo:** una tabla por regla → se cumplió.

**Resultado:**
- **Implementadas:** casi todas.
- **Tests:** 1210 pasan.

**Riesgos o dudas:** no repetí la corrida.
**Decisión que necesito del CEO:** ninguna
**Mejora propuesta:** tests de confirmarCobro.`;

const linea = (texto: string, ts: string) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: { content: [{ type: 'text', text: texto }] },
  });

describe('personal: informes de los managers', () => {
  it('lee estado, resultado con sus viñetas y la decisión, sin la negrita', () => {
    const i = parsearInforme(INFORME, 5)!;
    expect(i).toMatchObject({
      tipo: 'manager-erp',
      titulo: 'Reglas de conciliación sin test — 4/10/2026',
      fecha: 5,
      estado: 'APROBADO (solo lectura)',
      resultado: '- Implementadas: casi todas.\n- Tests: 1210 pasan.',
      decision: 'ninguna',
      necesitaCeo: false,
    });
    expect(i.texto.startsWith('## Informe de manager-erp')).toBe(true);
    expect(i.texto).not.toContain('**');
  });

  it('pide al CEO si escaló o si la decisión no es "ninguna"', () => {
    expect(parsearInforme(INFORME.replace('APROBADO', 'ESCALADO'))!.necesitaCeo).toBe(true);
    const pide = INFORME.replace(
      '**Decisión que necesito del CEO:** ninguna',
      '**Decisión que necesito del CEO:**\n¿Aplico la migración 00170?',
    );
    const i = parsearInforme(pide)!;
    expect(i.decision).toBe('¿Aplico la migración 00170?');
    expect(i.necesitaCeo).toBe(true);
  });

  it('sin el encabezado no hay informe', () => {
    expect(parsearInforme('Estado: APROBADO')).toBeNull();
  });

  it('del transcript toma el último mensaje con informe', () => {
    const jsonl = [
      linea(INFORME.replace('APROBADO', 'RECHAZADO'), '2026-10-04T01:00:00.000Z'),
      linea(INFORME, '2026-10-04T02:00:00.000Z'),
      linea('ok, gracias', '2026-10-04T02:01:00.000Z'),
      '{"type":"assistant", cortada',
    ].join('\n');
    const i = ultimoInforme(jsonl)!;
    expect(i.estado).toMatch(/^APROBADO/);
    expect(i.fecha).toBe(Date.parse('2026-10-04T02:00:00.000Z'));
  });

  it('busca en los sub-agentes de cada sesión y se queda con el más nuevo de cada manager', async () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-informes-'));
    const poner = (sesion: string, id: string, tipo: string, texto: string, ts: string) => {
      const subs = path.join(raiz, 'proyecto', sesion, 'subagents');
      fs.mkdirSync(subs, { recursive: true });
      fs.writeFileSync(path.join(subs, `${id}.meta.json`), JSON.stringify({ agentType: tipo }));
      fs.writeFileSync(path.join(subs, `${id}.jsonl`), linea(texto, ts));
    };
    try {
      poner(
        's1',
        'agent-a',
        'manager-erp',
        INFORME.replace('APROBADO', 'RECHAZADO'),
        '2026-10-03T10:00:00.000Z',
      );
      poner('s2', 'agent-b', 'manager-erp', INFORME, '2026-10-04T10:00:00.000Z');
      poner('s2', 'agent-c', 'buscador-de-bugs', INFORME, '2026-10-04T11:00:00.000Z');
      poner(
        's3',
        'agent-d',
        'manager-chaina',
        INFORME.replace('manager-erp', 'manager-chaina'),
        '2026-10-04T09:00:00.000Z',
      );
      fs.writeFileSync(path.join(raiz, 'proyecto', 's1.jsonl'), '');
      const lista = await informesAsync([raiz]);
      expect(lista.map((i) => [i.tipo, i.estado.split(' ')[0]])).toEqual([
        ['manager-erp', 'APROBADO'],
        ['manager-chaina', 'APROBADO'],
      ]);
    } finally {
      fs.rmSync(raiz, { recursive: true, force: true });
    }
  });
});
