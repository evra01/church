// Suppression automatique du fond d'une image (sans service externe).
// Principe : on repère la couleur du fond sur le pourtour de l'image, puis on
// « inonde » depuis les bords tant que les pixels restent proches de cette couleur.
// Ce qui est atteint devient transparent ; le sujet (relié ou non au bord) est conservé.
// Fonctionne très bien sur les fonds unis ou en dégradé doux (studio, mur, ciel uni).
const sharp = require('sharp');

const MAX_W = 600, MAX_H = 800;

function dist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function removeBackground(inputBuffer) {
  const base = sharp(inputBuffer).rotate()
    .resize({ width: MAX_W, height: MAX_H, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha();
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, N = w * h;

  // 1) L'image a-t-elle déjà de la transparence ? Alors on ne touche à rien.
  let transparent = 0;
  for (let i = 0; i < N; i++) if (data[i * 4 + 3] < 250) transparent++;
  if (transparent / N > 0.02) {
    return sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 85, alphaQuality: 100 }).toBuffer();
  }

  // 2) Couleur du fond = médiane des pixels du pourtour
  const rs = [], gs = [], bs = [];
  const pushPx = (x, y) => { const p = (y * w + x) * 4; rs.push(data[p]); gs.push(data[p + 1]); bs.push(data[p + 2]); };
  for (let x = 0; x < w; x++) { pushPx(x, 0); pushPx(x, h - 1); }
  for (let y = 0; y < h; y++) { pushPx(0, y); pushPx(w - 1, y); }
  const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
  const BR = med(rs), BG = med(gs), BB = med(bs);

  // Fond non uni (bord très varié) : on ne risque pas d'abîmer l'image
  let okBorder = 0;
  for (let i = 0; i < rs.length; i++) if (dist(rs[i], gs[i], bs[i], BR, BG, BB) <= 58) okBorder++;
  if (okBorder / rs.length < 0.6) {
    return sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 85 }).toBuffer();
  }

  const GLOBAL_TOL = 58;   // écart maximal à la couleur de fond
  const LOCAL_TOL = 14;    // écart maximal entre deux pixels voisins (suit les dégradés, s'arrête aux contours)

  // 3) Remplissage depuis les bords
  const bg = new Uint8Array(N);         // 1 = fond
  const stack = new Int32Array(N);
  let sp = 0;
  const near = (p) => dist(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], BR, BG, BB) <= GLOBAL_TOL;
  const seed = (x, y) => { const p = y * w + x; if (!bg[p] && near(p)) { bg[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w, y = (p / w) | 0;
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    const tryN = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const q = ny * w + nx;
      if (bg[q]) return;
      const qi = q * 4;
      if (dist(r, g, b, data[qi], data[qi + 1], data[qi + 2]) <= LOCAL_TOL && near(q)) { bg[q] = 1; stack[sp++] = q; }
    };
    tryN(x + 1, y); tryN(x - 1, y); tryN(x, y + 1); tryN(x, y - 1);
  }

  // Sécurité : si presque tout (>96 %) ou presque rien (<3 %) est retiré, le fond n'était pas uni → on garde l'image telle quelle
  let removed = 0;
  for (let i = 0; i < N; i++) if (bg[i]) removed++;
  if (removed / N > 0.96 || removed / N < 0.03) {
    return sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 85 }).toBuffer();
  }

  // 4) Masque (255 = sujet), érosion d'1 px pour retirer le liseré de fond, puis léger flou pour adoucir le bord
  let mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = bg[i] ? 0 : 255;
  const eroded = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      let keep = 255;
      if (x > 0 && !mask[p - 1]) keep = 0;
      else if (x < w - 1 && !mask[p + 1]) keep = 0;
      else if (y > 0 && !mask[p - w]) keep = 0;
      else if (y < h - 1 && !mask[p + w]) keep = 0;
      eroded[p] = keep;
    }
  }
  const softMask = await sharp(eroded, { raw: { width: w, height: h, channels: 1 } }).blur(0.9).extractChannel(0).raw().toBuffer();

  // 5) Application du masque sur le canal alpha
  const out = Buffer.from(data);
  for (let i = 0; i < N; i++) out[i * 4 + 3] = softMask[i];

  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 85, alphaQuality: 100 }).toBuffer();
}

module.exports = { removeBackground };
