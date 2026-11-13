// Genera scripts/lib/comunas_coarse.json: contornos de comunas simplificados (continente), listos para el mapa territorial.
// Se corre UNA vez (o si cambia el geojson de origen). Uso: node scripts/build_comunas_geometry.js ruta/a/comunas.geojson
// Entrada: geojson con propiedades cod_comuna, codregion, Comuna (division politico-administrativa).
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Uso: node scripts/build_comunas_geometry.js ruta/a/comunas.geojson'); process.exit(1); }
const g = JSON.parse(fs.readFileSync(src, 'utf8'));

// Douglas-Peucker iterativo (sin recursion, por los anillos de miles de puntos de Magallanes/Aysen)
function dp(pts, tol) {
  const n = pts.length; if (n < 5) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let mx = 0, ix = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i]; let d;
      if (L === 0) d = Math.hypot(x - x1, y - y1);
      else { let t = ((x - x1) * dx + (y - y1) * dy) / L; t = Math.max(0, Math.min(1, t)); d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); }
      if (d > mx) { mx = d; ix = i; }
    }
    if (mx > tol && ix > 0) { keep[ix] = 1; st.push([a, ix], [ix, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(s / 2); };

const out = [];
for (const f of g.features) {
  const p = f.properties; if (!p.cod_comuna || !p.codregion) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const pl of polys) {
    const ring = pl[0]; const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
    if (cx < -76.5 || cx > -65.5 || cy < -56.5 || cy > -17) continue;           // fuera del continente (Rapa Nui, Juan Fernandez, Antartica)
    rings.push({ a: area(ring), ring });
  }
  if (!rings.length) continue;
  rings.sort((x, y) => y.a - x.a);
  const sur = rings[0].ring[0][1] < -41;
  const tol = sur ? 0.012 : 0.005;
  const keep = rings.filter((r, i) => i === 0 || r.a > (sur ? 0.01 : 0.002))   // siempre el anillo mayor; islotes diminutos se descartan
    .map(r => dp(r.ring, tol).map(q => [+q[0].toFixed(3), +q[1].toFixed(3)])).filter(r => r.length >= 4);
  out.push({ cod: p.cod_comuna, n: p.Comuna, r: p.codregion, g: keep });
}
const dest = path.join(__dirname, 'lib', 'comunas_coarse.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('comunas', out.length, '| KB', (fs.statSync(dest).size / 1024).toFixed(0), '| puntos', out.reduce((s, c) => s + c.g.reduce((t, r) => t + r.length, 0), 0));
