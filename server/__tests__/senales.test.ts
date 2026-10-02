import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  aplicarSenal,
  DEPLOY_MAX_MS,
  ERRORES_PARA_HUMO,
  esDeploy,
  resumen,
  senalesNuevas,
  sesionDe,
  vozPedida,
} from '../src/personal/senales.js';

const T0 = Date.parse('2026-10-02T03:00:00Z');
const ts = (ms: number) => new Date(T0 + ms).toISOString();

const usoHerramienta = (id: string, name: string, input: unknown, ms = 0) => ({
  type: 'assistant',
  timestamp: ts(ms),
  message: { content: [{ type: 'tool_use', id, name, input }] },
});
const resultado = (id: string, isError: boolean | undefined, content: unknown = 'ok', ms = 0) => ({
  type: 'user',
  timestamp: ts(ms),
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: id,
        content,
        ...(isError === undefined ? {} : { is_error: isError }),
      },
    ],
  },
});

describe('esDeploy', () => {
  it.each([
    ['vercel deploy --prod', 'bash'],
    ['npx vercel --prod --yes', 'bash'],
    ['vercel --prod', 'bash'],
    ['gh pr merge 321 --squash', 'bash'],
    ['railway up --service web', 'bash'],
    ['vercel ls', null],
    ['vercel env ls production', null],
    ['gh pr view 321', null],
    ['npm run deploy:docs', null],
  ])('Bash %s → %s', (command, esperado) => {
    expect(esDeploy('Bash', { command })).toBe(esperado);
  });

  it('la skill deploy-verificado (con o sin plugin) sí; otras skills no', () => {
    expect(esDeploy('Skill', { skill: 'deploy-verificado' })).toBe('skill');
    expect(esDeploy('Skill', { skill: 'mio:deploy-verificado' })).toBe('skill');
    expect(esDeploy('Skill', { skill: 'afinar-pedido' })).toBeNull();
    expect(esDeploy('Read', { file_path: 'vercel --prod' })).toBeNull();
  });
});

describe('humo: errores de herramienta seguidos', () => {
  it(`cuenta errores seguidos y llega a ${ERRORES_PARA_HUMO}`, () => {
    const s = senalesNuevas();
    for (let i = 0; i < ERRORES_PARA_HUMO; i++)
      aplicarSenal(s, resultado(`e${i}`, true, 'Exit code 1', i));
    expect(resumen(s, T0).errores).toBe(ERRORES_PARA_HUMO);
    expect(resumen(s, T0).ultimoError).toBe(T0 + ERRORES_PARA_HUMO - 1);
  });

  it('una herramienta que sale bien (con o sin is_error) vuelve a cero', () => {
    const s = senalesNuevas();
    aplicarSenal(s, resultado('a', true));
    aplicarSenal(s, resultado('b', true));
    aplicarSenal(s, resultado('c', undefined));
    expect(resumen(s).errores).toBe(0);
    aplicarSenal(s, resultado('d', true));
    aplicarSenal(s, resultado('e', false));
    expect(resumen(s).errores).toBe(0);
  });

  it('un "no" tuyo a un permiso no cuenta como error', () => {
    const s = senalesNuevas();
    aplicarSenal(s, resultado('a', true, "The user doesn't want to proceed with this tool use."));
    expect(resumen(s).errores).toBe(0);
  });

  it('los registros de sub-agentes (sidechain) no cuentan', () => {
    const s = senalesNuevas();
    aplicarSenal(s, { ...resultado('a', true), isSidechain: true });
    expect(resumen(s).errores).toBe(0);
  });

  it('avisa cambio solo cuando cambia algo', () => {
    const s = senalesNuevas();
    expect(aplicarSenal(s, resultado('a', false))).toBe(false);
    expect(aplicarSenal(s, resultado('b', true))).toBe(true);
  });
});

describe('deploy en curso', () => {
  it('desde el tool_use del Bash hasta su tool_result', () => {
    const s = senalesNuevas();
    aplicarSenal(s, usoHerramienta('d1', 'Bash', { command: 'gh pr merge 5 --squash' }, 0));
    expect(resumen(s, T0 + 1000).deployDesde).toBe(T0);
    aplicarSenal(s, usoHerramienta('x', 'Bash', { command: 'ls' }, 500));
    aplicarSenal(s, resultado('x', false));
    expect(resumen(s, T0 + 1000).deployDesde).toBe(T0);
    aplicarSenal(s, resultado('d1', false));
    expect(resumen(s, T0 + 1000).deployDesde).toBeNull();
  });

  it('un deploy que falla también termina', () => {
    const s = senalesNuevas();
    aplicarSenal(s, usoHerramienta('d1', 'Bash', { command: 'vercel --prod' }));
    aplicarSenal(s, resultado('d1', true, 'Error: build failed'));
    expect(resumen(s, T0).deployDesde).toBeNull();
  });

  it('la skill deploy-verificado dura hasta que termina el turno', () => {
    const s = senalesNuevas();
    aplicarSenal(s, usoHerramienta('k', 'Skill', { skill: 'deploy-verificado' }));
    aplicarSenal(s, resultado('k', false));
    expect(resumen(s, T0 + 1000).deployDesde).toBe(T0);
    aplicarSenal(s, { type: 'system', subtype: 'turn_duration' });
    expect(resumen(s, T0 + 1000).deployDesde).toBeNull();
  });

  it(`sin resultado vence solo a los ${DEPLOY_MAX_MS / 60000} min (sesión cortada a mitad)`, () => {
    const s = senalesNuevas();
    aplicarSenal(s, usoHerramienta('d1', 'Bash', { command: 'railway up' }));
    expect(resumen(s, T0 + DEPLOY_MAX_MS - 1).deployDesde).toBe(T0);
    expect(resumen(s, T0 + DEPLOY_MAX_MS + 1).deployDesde).toBeNull();
  });
});

describe('aviso por voz', () => {
  it('la sesión es el nombre del transcript, limpio como lo deja el hook', () => {
    expect(sesionDe('C:\\x\\proj\\c91cab57-190c-417a.jsonl')).toBe('c91cab57-190c-417a');
    expect(sesionDe('/home/j/.claude/projects/p/abc.def.jsonl')).toBe('abcdef');
  });

  it('pedida si existe <sesion>.speak en alguna de las carpetas', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-b-'));
    try {
      expect(vozPedida('s1', [a, b])).toBe(false);
      fs.writeFileSync(path.join(b, 's1.speak'), '1');
      expect(vozPedida('s1', [a, b])).toBe(true);
      expect(vozPedida('s2', [a, b])).toBe(false);
      expect(vozPedida('', [a, b])).toBe(false);
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
    }
  });
});
