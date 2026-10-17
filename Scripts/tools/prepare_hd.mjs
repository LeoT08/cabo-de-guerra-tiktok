// Prepara a arte HD (fundo branco puro #FFFFFF) para o jogo:
//   1. remove o fundo por flood fill a partir das bordas (branco interno, como camisa, fica)
//   2. bolsoes brancos grandes e cercados (ex.: vao entre corda e perna) tambem viram transparentes
//   3. suaviza a borda (alpha pela "brancura" + remove o halo branco)
//   4. recorta a margem e reduz para a altura alvo
// Os 4 quadros "puxando" de cada personagem usam o MESMO recorte (animacao nao "pula").
//
// Uso: node prepare_hd.mjs "<pasta Cenarios e Personagens>" "<game/public/assets>"
// Le os originais e grava em <assets>/characters/<slug>/ e <assets>/background/. Nao altera os originais.
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const [srcRoot, outRoot] = process.argv.slice(2);
if (!srcRoot || !outRoot) {
  console.error('uso: node prepare_hd.mjs "<Cenarios e Personagens>" "<game/public/assets>"');
  process.exit(1);
}

const CHARACTERS = {
  lula: "personagens_HD_parte1/Personagens_Cabo_de_Guerra/Lula",
  janja: "personagens_HD_parte1/Personagens_Cabo_de_Guerra/Janja",
  haddad: "personagens_HD_parte2/Personagens_Cabo_de_Guerra/Haddad",
  flavio: "personagens_HD_parte2/Personagens_Cabo_de_Guerra/Flavio_Bolsonaro",
  michelle: "personagens_HD_parte3/Personagens_Cabo_de_Guerra/Michelle_Bolsonaro",
  nikolas: "personagens_HD_parte3/Personagens_Cabo_de_Guerra/Nikolas_Ferreira"
};
const PULL_FRAMES = ["puxando_01", "puxando_02", "puxando_03", "puxando_04"];
const SINGLE_POSES = { vista_01: 520, vitoria_01: 520, derrota_01: 400, retrato_01: 256 };
const PULL_HEIGHT = 480;
const BACKGROUND = {
  src: "cenarios_cabo_de_guerra_HD/Cenarios_Cabo_de_Guerra/01_Cenarios/Brasilia_Panorama_Alternativo.png",
  out: "background/brasilia_hd.png",
  height: 800
};

const DEFAULT_OPTS = {
  bgMin: 244, // pixel "branco de fundo": todos os canais >= isso
  holeMinArea: 2500, // bolsao branco cercado maior que isso (px, na resolucao original) vira transparente; 0 = nunca
  closeRadius: 0 // fechamento morfologico da silhueta (preenche "mordidas" estreitas na borda); 0 = desligado
};
// Roupa branca (Michelle) encosta no fundo sem contorno: limiar mais rigido e sem remover bolsoes internos.
const CHARACTER_OPTS = { michelle: { bgMin: 255, holeMinArea: 0, closeRadius: 28 } };
const EDGE_MIN = 200; // faixa de transicao para a borda suave
// Centro (fracao da imagem) dos bolsoes brancos que sao camisa e ficam opacos. Medido em todas as poses.
const SHIRT_ZONE = { x0: 0.3, x1: 0.68, y0: 0.2, y1: 0.5 };

function read(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

function write(png, p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, PNG.sync.write(png));
}

// Max/min filtro quadrado separavel sobre mascara binaria (dilatacao quando grow=1, erosao quando grow=0).
function morph(mask, w, h, r, grow) {
  const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  const pass = (src, dst, horizontal) => {
    const len = horizontal ? w : h, lines = horizontal ? h : w;
    for (let line = 0; line < lines; line++) {
      for (let p = 0; p < len; p++) {
        let v = grow ? 0 : 1;
        for (let k = Math.max(0, p - r); k <= Math.min(len - 1, p + r); k++) {
          const i = horizontal ? line * w + k : k * w + line;
          if (grow ? src[i] : !src[i]) { v = grow ? 1 : 0; break; }
        }
        dst[horizontal ? line * w + p : p * w + line] = v;
      }
    }
  };
  pass(mask, tmp, true);
  pass(tmp, out, false);
  return out;
}

// Dilatacao/erosao em losango (vizinhanca-4 repetida r vezes).
function morphDiamond(mask, w, h, r, grow) {
  let cur = mask;
  for (let k = 0; k < r; k++) {
    const next = new Uint8Array(cur);
    for (let i = 0; i < cur.length; i++) {
      if (grow ? cur[i] : !cur[i]) continue;
      const x = i % w;
      const nb = (x > 0 && cur[i - 1]) + (x < w - 1 && cur[i + 1]) + (i >= w && cur[i - w]) + (i < cur.length - w && cur[i + w]);
      if (grow ? nb > 0 : nb < ((x > 0) + (x < w - 1) + (i >= w) + (i < cur.length - w))) next[i] = grow ? 1 : 0;
    }
    cur = next;
  }
  return cur;
}

// Fechamento com elemento octogonal (quadrado r/2 + losango r/2): segue o contorno sem
// deixar "blocos" retangulares como o quadrado puro.
function closeOctagon(mask, w, h, r) {
  const half = Math.max(1, Math.round(r / 2));
  const dil = morphDiamond(morph(mask, w, h, half, 1), w, h, half, 1);
  return morphDiamond(morph(dil, w, h, half, 0), w, h, half, 0);
}

function removeWhiteBackground(png, { bgMin, holeMinArea, closeRadius } = DEFAULT_OPTS) {
  const { width: w, height: h, data } = png;
  const n = w * h;
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    white[i] = data[o] >= bgMin && data[o + 1] >= bgMin && data[o + 2] >= bgMin ? 1 : 0;
  }

  // label: 0 = figura, 1 = fundo externo, 2 = bolsao branco interno (ainda nao decidido)
  const label = new Uint8Array(n);
  const queue = new Int32Array(n);
  const flood = (start, mark) => {
    let head = 0, tail = 0;
    queue[tail++] = start;
    label[start] = mark;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && white[i - 1] && !label[i - 1]) { label[i - 1] = mark; queue[tail++] = i - 1; }
      if (x < w - 1 && white[i + 1] && !label[i + 1]) { label[i + 1] = mark; queue[tail++] = i + 1; }
      if (y > 0 && white[i - w] && !label[i - w]) { label[i - w] = mark; queue[tail++] = i - w; }
      if (y < h - 1 && white[i + w] && !label[i + w]) { label[i + w] = mark; queue[tail++] = i + w; }
    }
    return { size: tail, pixels: queue.subarray(0, tail) };
  };

  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (white[i] && !label[i]) flood(i, 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      if (white[i] && !label[i]) flood(i, 1);
    }
  }
  // Camisa branca entre as lapelas tambem e um bolsao branco cercado. Nesta arte, todo
  // bolsao de camisa tem o centro em SHIRT_ZONE (centro-alto da imagem); os vaos de fundo
  // de verdade (laco da corda, braco/corpo) ficam fora dela. Cor/sombra nao separam os dois.
  const inShirtZone = (pixels) => {
    let sx = 0, sy = 0;
    for (const p of pixels) { sx += p % w; sy += (p / w) | 0; }
    const cx = sx / pixels.length / w, cy = sy / pixels.length / h;
    return cx >= SHIRT_ZONE.x0 && cx <= SHIRT_ZONE.x1 && cy >= SHIRT_ZONE.y0 && cy <= SHIRT_ZONE.y1;
  };
  for (let i = 0; i < n; i++) {
    if (!white[i] || label[i]) continue;
    const { size, pixels } = flood(i, 3);
    if (holeMinArea > 0 && size >= holeMinArea && !inShirtZone(pixels)) for (const p of pixels) label[p] = 1;
  }

  if (closeRadius > 0) {
    const figure = new Uint8Array(n);
    for (let i = 0; i < n; i++) figure[i] = label[i] === 1 ? 0 : 1;
    const closed = closeOctagon(figure, w, h, closeRadius);
    for (let i = 0; i < n; i++) if (closed[i] && label[i] === 1) label[i] = 0;
  }

  for (let i = 0; i < n; i++) if (label[i] === 1) data[i * 4 + 3] = 0;

  // Borda suave: pixels de figura a ate 2px do fundo ganham alpha pela "brancura"
  // e tem a cor des-misturada do branco (tira o halo claro contra o cenario).
  const nearBg = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (label[ny * w + nx] === 1) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (label[i] === 1 || !nearBg(x, y)) continue;
      const o = i * 4;
      const minC = Math.min(data[o], data[o + 1], data[o + 2]);
      if (minC < EDGE_MIN) continue;
      const a = Math.max(0, Math.min(1, (255 - minC) / (255 - EDGE_MIN)));
      if (a <= 0.02) { data[o + 3] = 0; continue; }
      for (let c = 0; c < 3; c++) {
        data[o + c] = Math.max(0, Math.min(255, Math.round((data[o + c] - 255 * (1 - a)) / a)));
      }
      data[o + 3] = Math.round(a * 255);
    }
  }
  return png;
}

function alphaBBox(png) {
  const { width: w, height: h, data } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

function unionBBox(boxes) {
  return boxes.reduce((a, b) => ({
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)
  }));
}

// Recorta e reduz por media de area (com alpha pre-multiplicado, sem franja escura).
function cropResize(png, box, targetH, pad = 4) {
  const sx0 = Math.max(0, box.x0 - pad), sy0 = Math.max(0, box.y0 - pad);
  const sx1 = Math.min(png.width - 1, box.x1 + pad), sy1 = Math.min(png.height - 1, box.y1 + pad);
  const sw = sx1 - sx0 + 1, sh = sy1 - sy0 + 1;
  const scale = Math.min(1, targetH / sh);
  const dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale));
  const out = new PNG({ width: dw, height: dh });
  const src = png.data;
  for (let dy = 0; dy < dh; dy++) {
    const fy0 = sy0 + dy / scale, fy1 = sy0 + (dy + 1) / scale;
    for (let dx = 0; dx < dw; dx++) {
      const fx0 = sx0 + dx / scale, fx1 = sx0 + (dx + 1) / scale;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        const wy = Math.min(y + 1, fy1) - Math.max(y, fy0);
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          const wx = Math.min(x + 1, fx1) - Math.max(x, fx0);
          const wgt = wx * wy;
          const o = (y * png.width + x) * 4;
          const al = src[o + 3] / 255;
          r += src[o] * al * wgt; g += src[o + 1] * al * wgt; b += src[o + 2] * al * wgt;
          a += al * wgt; wsum += wgt;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round((a / wsum) * 255);
    }
  }
  return out;
}

const report = [];
for (const [slug, rel] of Object.entries(CHARACTERS)) {
  const dir = path.join(srcRoot, rel);
  const opts = { ...DEFAULT_OPTS, ...CHARACTER_OPTS[slug] };
  const frames = PULL_FRAMES.map((f) => removeWhiteBackground(read(path.join(dir, `${f}.png`)), opts));
  const box = unionBBox(frames.map(alphaBBox));
  frames.forEach((png, k) => {
    const out = cropResize(png, box, PULL_HEIGHT);
    write(out, path.join(outRoot, "characters", slug, `${PULL_FRAMES[k]}.png`));
    if (k === 0) report.push(`${slug}/puxando_*  ${out.width}x${out.height}`);
  });
  for (const [pose, targetH] of Object.entries(SINGLE_POSES)) {
    const png = removeWhiteBackground(read(path.join(dir, `${pose}.png`)), opts);
    const out = cropResize(png, alphaBBox(png), targetH);
    write(out, path.join(outRoot, "characters", slug, `${pose}.png`));
    report.push(`${slug}/${pose}  ${out.width}x${out.height}`);
  }
  console.log(`ok ${slug}`);
}

{
  const png = read(path.join(srcRoot, BACKGROUND.src));
  const out = cropResize(png, { x0: 0, y0: 0, x1: png.width - 1, y1: png.height - 1 }, BACKGROUND.height, 0);
  write(out, path.join(outRoot, BACKGROUND.out));
  report.push(`${BACKGROUND.out}  ${out.width}x${out.height}`);
}

console.log(report.join("\n"));
