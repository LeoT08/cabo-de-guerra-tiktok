// Recorta os icones de presentes de uma captura do painel de presentes do TikTok
// (grade 4x3, fundo cinza escuro) e grava PNGs com fundo transparente.
//
// Uso (a partir de tools/): node prepare_gifts.mjs "<captura.png>" "../game/public/assets/gifts"
// A captura original e um JPG; converta para PNG antes (ex.: Paint "Salvar como PNG").
// Os slugs abaixo precisam bater com game/src/giftIcons.ts.
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) {
  console.error('uso: node prepare_gifts.mjs "<captura.png>" "<pasta de saida>"');
  process.exit(1);
}

// Caixas (x0, y0, x1, y1) na captura de 1170x1028, so com o desenho (sem nome/preco/selos).
const BOXES = {
  rosa: [45, 5, 270, 212],
  rosa_branca: [350, 40, 540, 222],
  incrivel: [620, 30, 835, 222],
  mini_dino: [925, 30, 1100, 222],
  heart_me: [70, 385, 250, 540],
  capivara: [355, 360, 530, 545],
  coracao: [640, 380, 815, 540],
  fogos: [915, 370, 1105, 545],
  coracao_dedos: [80, 695, 235, 880],
  palmas: [360, 700, 530, 875],
  buque: [635, 700, 810, 880],
  chapeu: [910, 695, 1110, 885]
};
const OUT_SIZE = 128;

const png = PNG.sync.read(fs.readFileSync(src));

function crop([x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * png.width + (x0 + x)) * 4, di = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = png.data[si + c];
    }
  }
  return out;
}

// Fundo = cinza escuro sem cor (inclui o quadro mais escuro do presente selecionado).
const isBg = (d, o) => {
  const mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]);
  return mx < 70 && mx - mn < 16;
};

function removeBg(img) {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  const queue = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (seen[i] || !isBg(data, i * 4)) return;
    seen[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (queue.length) {
    const i = queue.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let i = 0; i < w * h; i++) if (seen[i]) data[i * 4 + 3] = 0;
  return img;
}

function bbox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 16) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, y0, x1, y1 };
}

// Centraliza num quadrado e reduz por media de area (alpha pre-multiplicado).
function squareResize(img, box, size) {
  const sw = box.x1 - box.x0 + 1, sh = box.y1 - box.y0 + 1;
  const side = Math.max(sw, sh);
  const ox = box.x0 - (side - sw) / 2, oy = box.y0 - (side - sh) / 2;
  const scale = size / side;
  const out = new PNG({ width: size, height: size });
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const fx0 = ox + dx / scale, fx1 = ox + (dx + 1) / scale, fy0 = oy + dy / scale, fy1 = oy + (dy + 1) / scale;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          n++;
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const o = (y * img.width + x) * 4, al = img.data[o + 3] / 255;
          r += img.data[o] * al; g += img.data[o + 1] * al; b += img.data[o + 2] * al; a += al;
        }
      }
      const o = (dy * size + dx) * 4;
      if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = Math.round((a / Math.max(1, n)) * 255);
    }
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
for (const [slug, box] of Object.entries(BOXES)) {
  const img = removeBg(crop(box));
  const out = squareResize(img, bbox(img), OUT_SIZE);
  fs.writeFileSync(path.join(outDir, `${slug}.png`), PNG.sync.write(out));
  console.log(`ok ${slug}`);
}
