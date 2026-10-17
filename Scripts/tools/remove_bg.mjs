import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const LIGHTNESS_MIN = 170; // (r+g+b)/3 minimo para considerar "claro"
const SATURATION_MAX = 38; // max(r,g,b)-min(r,g,b) maximo para considerar "dessaturado/cinza"
const OPEN_DIST = 46; // se achar "parede" (pixel de personagem) em menos que isso nas 4 direcoes, considera cercado

function isBackgroundLike(r, g, b) {
  const lightness = (r + g + b) / 3;
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  return lightness >= LIGHTNESS_MIN && saturation <= SATURATION_MAX;
}

function removeBackground(inputPath, outputPath) {
  const buf = fs.readFileSync(inputPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const idx = (x, y) => y * width + x;

  // Classifica em cima de uma versao borrada (so para decidir, nao para a cor final): evita
  // que graos de ruido/textura de papel isolados virem "paredes" falsas no raycasting abaixo.
  const blurredR = new Float32Array(width * height);
  const blurredG = new Float32Array(width * height);
  const blurredB = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = idx(nx, ny) * 4;
          sr += data[ni]; sg += data[ni + 1]; sb += data[ni + 2]; n++;
        }
      }
      const i = idx(x, y);
      blurredR[i] = sr / n; blurredG[i] = sg / n; blurredB[i] = sb / n;
    }
  }

  const bgLike = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    bgLike[i] = isBackgroundLike(blurredR[i], blurredG[i], blurredB[i]) ? 1 : 0;
  }

  // Para cada pixel "parecido com fundo", decide por raycasting em 4 direcoes:
  // se em TODAS as direcoes encontrar primeiro-plano perto (< OPEN_DIST), esta cercado
  // (ex.: vao entre as pernas) -> vira sombra escura, nunca transparencia pura (fica feio
  // contra o cenario). Se alguma direcao fica livre ate sair da imagem ou ate OPEN_DIST
  // sem achar personagem, consideramos aberto/exterior -> remove de verdade (alpha 0).
  function hitsForegroundWithin(x, y, dx, dy, maxDist) {
    let cx = x, cy = y;
    for (let step = 0; step < maxDist; step++) {
      cx += dx;
      cy += dy;
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) return false;
      if (!bgLike[idx(cx, cy)]) return true;
    }
    return false;
  }

  const enclosedFlag = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      if (!bgLike[i]) continue;
      const enclosed =
        hitsForegroundWithin(x, y, -1, 0, OPEN_DIST) &&
        hitsForegroundWithin(x, y, 1, 0, OPEN_DIST) &&
        hitsForegroundWithin(x, y, 0, -1, OPEN_DIST) &&
        hitsForegroundWithin(x, y, 0, 1, OPEN_DIST);
      if (enclosed) {
        enclosedFlag[i] = 1;
      } else {
        data[i * 4 + 3] = 0;
      }
    }
  }

  // So vira "sombra" se o bolsao cercado for grande o bastante para ser um vao de verdade
  // (ex.: entre as pernas). Pontinhos pequenos cercados (realce de pele entre rugas, brilho
  // no cabelo) ficam como estavam, sem virar sombra nem transparencia.
  const MIN_SHADOW_AREA = 30;
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(x, y);
      if (!enclosedFlag[start] || seen[start]) continue;
      const comp = [start];
      seen[start] = 1;
      let head = 0;
      while (head < comp.length) {
        const i = comp[head++];
        const cx = i % width, cy = Math.floor(i / width);
        for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
          if (nx<0||ny<0||nx>=width||ny>=height) continue;
          const ni = idx(nx, ny);
          if (seen[ni] || !enclosedFlag[ni]) continue;
          seen[ni] = 1;
          comp.push(ni);
        }
      }
      if (comp.length >= MIN_SHADOW_AREA) {
        for (const i of comp) {
          data[i * 4] = 10;
          data[i * 4 + 1] = 10;
          data[i * 4 + 2] = 14;
          data[i * 4 + 3] = 150;
        }
      }
      // componentes pequenos: nao mexe (mantem cor/alpha originais)
    }
  }

  // Suaviza bordas do alpha (box blur 3x3, 1 passada)
  const alphaCopy = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) alphaCopy[i] = data[i * 4 + 3];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      if (alphaCopy[i] === 0) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += alphaCopy[idx(nx, ny)];
          count++;
        }
      }
      data[i * 4 + 3] = Math.round(sum / count);
    }
  }

  const out = PNG.sync.write(png);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, out);
}

const root = process.argv[2];
if (!root) {
  console.error("uso: node remove_bg.mjs <pasta-raiz-de-personagens>");
  process.exit(1);
}

let count = 0;
for (const charDir of fs.readdirSync(root)) {
  const full = path.join(root, charDir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const file of fs.readdirSync(full)) {
    if (!file.endsWith(".png")) continue;
    const p = path.join(full, file);
    removeBackground(p, p);
    count++;
  }
}
console.log(`Processadas ${count} imagens em ${root}`);
