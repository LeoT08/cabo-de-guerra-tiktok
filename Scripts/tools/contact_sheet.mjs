import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const outPath = process.argv[3] || "contact_sheet.png";

const chars = ["flavio", "nikolas", "michelle", "lula", "haddad", "janja"];
const poses = [
  "vista_01.png",
  "vista_02.png",
  "puxando_01.png",
  "puxando_02.png",
  "puxando_03.png",
  "puxando_04.png",
  "retrato_01.png",
  "vitoria_01.png",
  "derrota_01.png"
];

const CELL_W = 150;
const CELL_H = 190;
const PAD = 4;
const LABEL_H = 14;

const cols = chars.length;
const rows = poses.length;
const sheetW = cols * CELL_W;
const sheetH = rows * (CELL_H + LABEL_H);

const sheet = new PNG({ width: sheetW, height: sheetH });
// fundo escuro tipo o jogo
for (let i = 0; i < sheetW * sheetH; i++) {
  sheet.data[i * 4] = 11;
  sheet.data[i * 4 + 1] = 14;
  sheet.data[i * 4 + 2] = 20;
  sheet.data[i * 4 + 3] = 255;
}

function compositePixel(dst, dx, dy, sr, sg, sb, sa) {
  if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) return;
  const di = (dy * dst.width + dx) * 4;
  const a = sa / 255;
  dst.data[di] = Math.round(sr * a + dst.data[di] * (1 - a));
  dst.data[di + 1] = Math.round(sg * a + dst.data[di + 1] * (1 - a));
  dst.data[di + 2] = Math.round(sb * a + dst.data[di + 2] * (1 - a));
  dst.data[di + 3] = 255;
}

function drawChar(dst, ch, ox, oy, color) {
  // fonte bitmap 3x5 bem simples soh pra rotular, maiusculas/numeros/alguns simbolos
  const FONT = {
    "0":"111101101101111","1":"010110010010111","2":"111001111100111","3":"111001111001111",
    "4":"101101111001001","5":"111100111001111","6":"111100111101111","7":"111001001001001",
    "8":"111101111101111","9":"111101111001111","_":"000000000000111",".":"000000000000010",
    "A":"111101111101101","B":"110101110101110","C":"111100100100111","D":"110101101101110",
    "E":"111100111100111","F":"111100111100100","G":"111100101101111","H":"101101111101101",
    "I":"111010010010111","J":"001001001101111","K":"101101110101101","L":"100100100100111",
    "M":"101111101101101","N":"101111111111101","O":"111101101101111","P":"111101111100100",
    "R":"111101111110101","S":"111100111001111","T":"111010010010010","U":"101101101101111",
    "V":"101101101101010","W":"101101101111101","X":"101101010101101","Y":"101101010010010",
    "Z":"111001010100111"," ":"000000000000000"
  };
  let cx = ox;
  for (const c of ch.toUpperCase()) {
    const bits = FONT[c] || FONT[" "];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (bits[row * 3 + col] === "1") {
          compositePixel(dst, cx + col, oy + row, color[0], color[1], color[2], 255);
        }
      }
    }
    cx += 4;
  }
}

let col = 0;
for (const charSlug of chars) {
  let row = 0;
  for (const pose of poses) {
    const filePath = path.join(root, charSlug, pose);
    const cellX = col * CELL_W;
    const cellY = row * (CELL_H + LABEL_H);
    if (fs.existsSync(filePath)) {
      const img = PNG.sync.read(fs.readFileSync(filePath));
      const scale = Math.min((CELL_W - PAD * 2) / img.width, (CELL_H - PAD * 2) / img.height);
      const dw = Math.round(img.width * scale);
      const dh = Math.round(img.height * scale);
      const offX = cellX + Math.round((CELL_W - dw) / 2);
      const offY = cellY + LABEL_H + Math.round((CELL_H - dh) / 2);
      for (let y = 0; y < dh; y++) {
        const sy = Math.min(img.height - 1, Math.floor(y / scale));
        for (let x = 0; x < dw; x++) {
          const sx = Math.min(img.width - 1, Math.floor(x / scale));
          const si = (sy * img.width + sx) * 4;
          compositePixel(
            sheet,
            offX + x,
            offY + y,
            img.data[si],
            img.data[si + 1],
            img.data[si + 2],
            img.data[si + 3]
          );
        }
      }
    }
    const label = row === 0 ? charSlug.slice(0, 12) : pose.replace(".png", "");
    drawChar(sheet, label, cellX + 2, cellY + 2, [180, 190, 200]);
    row++;
  }
  col++;
}

fs.writeFileSync(outPath, PNG.sync.write(sheet));
console.log("contact sheet escrito em", outPath, sheetW, "x", sheetH);
