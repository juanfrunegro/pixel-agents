// Personal (copia de juanfrunegro): genera los muebles propios dibujados en código (png + manifest.json) en
// webview-ui/public/assets/furniture/<ID>/. Uso: node scripts/personal/muebles.mjs
// Paleta tomada de los muebles del original (madera b38857/885c47/532e3d, contorno negro) para que combinen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

const { PNG } = pngjs;
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(RAIZ, 'webview-ui', 'public', 'assets', 'furniture');

const C = {
  negro: '#000000',
  madera: '#b38857',
  maderaClara: '#cfa86d',
  maderaBrillo: '#e3bf88',
  maderaOscura: '#885c47',
  bordo: '#532e3d',
  luz: '#eaf6f8',
  luzMedia: '#c9e6ee',
  luzSombra: '#9fc6d2',
  papel: '#efebe8',
  gris: '#4a4e4d',
  rojo: '#e05a5a',
  naranja: '#f0a040',
  amarillo: '#f2d24b',
  verde: '#5fbf6a',
  celeste: '#4fa8e0',
  violeta: '#9b6fd6',
  rosa: '#e07ab8',
};

/** Lienzo de w×h píxeles transparentes con helpers de dibujo. */
function lienzo(w, h) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  const px = (x, y, color) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const n = parseInt(color.slice(1), 16);
    const i = (y * w + x) * 4;
    png.data[i] = (n >> 16) & 255;
    png.data[i + 1] = (n >> 8) & 255;
    png.data[i + 2] = n & 255;
    png.data[i + 3] = 255;
  };
  const rect = (x, y, rw, rh, color) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) px(i, j, color);
  };
  /** Rectángulo con contorno de 1 px. */
  const caja = (x, y, rw, rh, relleno, borde = C.negro) => {
    rect(x, y, rw, rh, borde);
    rect(x + 1, y + 1, rw - 2, rh - 2, relleno);
  };
  return { png, px, rect, caja };
}

function guardar(id, png, manifest) {
  const dir = path.join(DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(png));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ id, ...manifest, width: png.width, height: png.height }, null, 2)}\n`,
  );
  console.log(`${id} ${png.width}x${png.height}`);
}

// ── Sala de Diseño ────────────────────────────────────────────────

/** Mesa de luz (2×2): tablero que se ilumina con muestras de color y un boceto encima. */
function mesaLuz() {
  const { png, px, rect, caja } = lienzo(32, 32);
  // Tablero iluminado, visto desde arriba y adelante.
  caja(0, 4, 32, 19, C.luzMedia);
  rect(1, 5, 30, 1, C.luz);
  rect(2, 6, 28, 15, C.luz);
  rect(1, 21, 30, 1, C.luzSombra);
  // Boceto (hoja con un trazo) y muestras de color en abanico.
  caja(3, 7, 11, 12, C.papel, C.gris);
  for (const [x, y] of [
    [5, 15],
    [6, 14],
    [7, 12],
    [8, 11],
    [9, 11],
    [10, 12],
    [11, 10],
  ])
    px(x, y, C.celeste);
  rect(5, 9, 4, 1, C.gris);
  const muestras = [C.rojo, C.naranja, C.amarillo, C.verde, C.celeste, C.violeta, C.rosa];
  muestras.forEach((color, k) => caja(16 + (k % 4) * 3, 8 + Math.floor(k / 4) * 6, 4, 5, color));
  // Canto de madera y patas.
  caja(0, 22, 32, 4, C.madera);
  rect(1, 23, 30, 1, C.maderaClara);
  rect(1, 26, 3, 6, C.maderaOscura);
  rect(28, 26, 3, 6, C.maderaOscura);
  rect(1, 31, 3, 1, C.bordo);
  rect(28, 31, 3, 1, C.bordo);
  guardar('MESA_LUZ', png, {
    name: 'Mesa de luz',
    category: 'desks',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    footprintW: 2,
    footprintH: 2,
  });
}

/** Mural (3×2, en la pared): manchas de color y una paleta de pintor. */
function mural() {
  const { png, px, rect, caja } = lienzo(48, 32);
  caja(1, 3, 46, 26, C.papel, C.bordo);
  rect(2, 4, 44, 1, C.maderaClara);
  // Ondas de color de izquierda a derecha.
  const bandas = [C.violeta, C.celeste, C.verde, C.amarillo, C.naranja, C.rojo, C.rosa];
  for (let x = 3; x < 45; x++) {
    const onda = Math.round(3 * Math.sin(x / 4));
    bandas.forEach((color, k) => {
      const y = 7 + k * 2 + onda;
      px(x, y, color);
      px(x, y + 1, color);
    });
  }
  // Paleta de pintor abajo a la derecha.
  caja(31, 19, 13, 8, C.maderaClara, C.maderaOscura);
  for (const [x, color] of [
    [33, C.rojo],
    [36, C.amarillo],
    [39, C.celeste],
  ])
    rect(x, 21, 2, 2, color);
  px(41, 24, C.maderaOscura);
  px(42, 24, C.maderaOscura);
  guardar('MURAL', png, {
    name: 'Mural',
    category: 'wall',
    type: 'asset',
    canPlaceOnWalls: true,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    footprintW: 3,
    footprintH: 2,
  });
}

mesaLuz();
mural();
