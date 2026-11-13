// Genera las dos paginas "terminal" a partir de los datos del repo:
//   docs/index.html       -> Terminal: precios nacionales, evolucion, regiones, operadores, cobertura de datos
//   docs/territorial.html -> Mapa territorial: popups por region y comuna, selector de combustibles, barra de tiempo
// Se corre despues de fetch_snapshot.js (ver .github/workflows/snapshot.yml).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const DOCS = path.join(ROOT, 'docs');

// ---------------------------------------------------------------- utilidades
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.length);
  const h = parseLine(lines[0]);
  return lines.slice(1).map(l => { const p = parseLine(l); const o = {}; h.forEach((c, i) => o[c] = p[i]); return o; });
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const r1 = v => (v == null || !Number.isFinite(v)) ? null : Math.round(v * 10) / 10;
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- catalogos
const FUELS = ['Gasolina 93', 'Gasolina 95', 'Gasolina 97', 'Diésel', 'Kerosene', 'GLP', 'GNC'];
const HIST_FILE = { 'Gasolina 93': 'gasolina_93', 'Gasolina 95': 'gasolina_95', 'Gasolina 97': 'gasolina_97', 'Diésel': 'diesel', 'Kerosene': 'kerosene' };
// codigo de region (division politico-administrativa) -> nombre corto (planilla historica CNE) -> nombre en la API en vivo
const REGS = [
  { c: 15, n: 'Arica y Parinacota', hist: 'Arica y Parinacota', live: 'Arica y Parinacota' },
  { c: 1, n: 'Tarapacá', hist: 'Tarapacá', live: 'Tarapacá' },
  { c: 2, n: 'Antofagasta', hist: 'Antofagasta', live: 'Antofagasta' },
  { c: 3, n: 'Atacama', hist: 'Atacama', live: 'Atacama' },
  { c: 4, n: 'Coquimbo', hist: 'Coquimbo', live: 'Coquimbo' },
  { c: 5, n: 'Valparaíso', hist: 'Valparaíso', live: 'Valparaíso' },
  { c: 13, n: 'Metropolitana', hist: 'Metropolitana', live: 'Metropolitana de Santiago' },
  { c: 6, n: "O'Higgins", hist: "O'Higgins", live: 'Del Libertador Gral. Bernardo O’Higgins' },
  { c: 7, n: 'Maule', hist: 'Maule', live: 'Del Maule' },
  { c: 16, n: 'Ñuble', hist: 'Ñuble', live: 'Ñuble' },
  { c: 8, n: 'Biobío', hist: 'Biobío', live: 'Del Biobío' },
  { c: 9, n: 'Araucanía', hist: 'Araucanía', live: 'De la Araucanía' },
  { c: 14, n: 'Los Ríos', hist: 'Los Ríos', live: 'De los Ríos' },
  { c: 10, n: 'Los Lagos', hist: 'Los Lagos', live: 'De los Lagos' },
  { c: 11, n: 'Aysén', hist: 'Aysén', live: 'Aysén del Gral. Carlos Ibáñez del Campo' },
  { c: 12, n: 'Magallanes', hist: 'Magallanes', live: 'Magallanes y de la Antártica Chilena' }
];
const regByLive = {}; REGS.forEach((r, i) => regByLive[r.live] = i);
const regByHist = {}; REGS.forEach((r, i) => regByHist[r.hist] = i);
const regByCod = {}; REGS.forEach((r, i) => regByCod[r.c] = i);
const COM_ALIAS = { marchihue: 'marchigue', coihaique: 'coyhaique', santiagocentro: 'santiago' };

// ---------------------------------------------------------------- linea de tiempo
const histRows = {};
const mesesSet = new Set();
Object.entries(HIST_FILE).forEach(([fuel, file]) => {
  histRows[fuel] = readCsv(path.join(DATA, 'historico_oficial_regional', file + '.csv'));
  histRows[fuel].forEach(r => mesesSet.add(r.fecha));
});
const meses = [...mesesSet].sort();
const nacionalDiario = readCsv(path.join(DATA, 'aggregates', 'nacional_diario.csv'));
const regionalDiario = readCsv(path.join(DATA, 'aggregates', 'regional_diario.csv'));
const comunalDiario = readCsv(path.join(DATA, 'aggregates', 'comunal_diario.csv'));
const operadorDiario = readCsv(path.join(DATA, 'aggregates', 'operador_diario.csv'));
const diasConDato = [...new Set(nacionalDiario.map(r => r.fecha))].sort();
const primerDia = diasConDato[0], ultimoDia = diasConDato[diasConDato.length - 1];
const diasFaltantes = []; for (let d = primerDia; d <= ultimoDia; d = addDays(d, 1)) if (!diasConDato.includes(d)) diasFaltantes.push(d);   // solo registro interno (no se muestra en las paginas)
const dias = diasConDato;                                                                                       // la linea de tiempo usa unicamente dias con dato
const T = [...meses, ...dias];
const nM = meses.length, nD = dias.length;
const tIdx = {}; T.forEach((d, i) => tIdx[d] = i);

// ---------------------------------------------------------------- series regionales y nacionales (alineadas a T)
const RS = FUELS.map(() => REGS.map(() => new Array(T.length).fill(null)));
const RN = FUELS.map(() => REGS.map(() => new Array(nD).fill(null)));   // n de estaciones (solo diario)
FUELS.forEach((fuel, fi) => {
  (histRows[fuel] || []).forEach(r => {
    const ri = regByHist[r.region]; if (ri == null) return;
    const v = parseFloat(r.precio_clp_litro); if (!(v > 0)) return;
    RS[fi][ri][tIdx[r.fecha]] = r1(v);
  });
});
regionalDiario.forEach(r => {
  const fi = FUELS.indexOf(r.combustible), ri = regByLive[r.region], ti = tIdx[r.fecha];
  if (fi < 0 || ri == null || ti == null) return;
  RS[fi][ri][ti] = r1(parseFloat(r.precio_promedio));
  RN[fi][ri][ti - nM] = parseInt(r.n_registros, 10);
});
// nacional: mensual = promedio simple de las regiones (unica serie oficial disponible); diario = promedio de todas las estaciones
const NS = FUELS.map(() => new Array(T.length).fill(null));
FUELS.forEach((fuel, fi) => {
  for (let t = 0; t < nM; t++) {
    const vals = REGS.map((_, ri) => RS[fi][ri][t]).filter(v => v != null);
    if (vals.length) NS[fi][t] = r1(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
});
const NN = FUELS.map(() => new Array(nD).fill(null));
nacionalDiario.forEach(r => {
  const fi = FUELS.indexOf(r.combustible), ti = tIdx[r.fecha]; if (fi < 0 || ti == null) return;
  NS[fi][ti] = r1(parseFloat(r.precio_promedio)); NN[fi][ti - nM] = parseInt(r.n_registros, 10);
});

// ---------------------------------------------------------------- comunas (geometria + series diarias)
const comGeo = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'comunas_coarse.json'), 'utf8'));
const comByKey = {}; comGeo.forEach((c, i) => comByKey[norm(c.n)] = i);
const CS = FUELS.map(() => ({}));   // CS[fuel][comunaIdx] = valores diarios
const CN = FUELS.map(() => ({}));
const sinMatch = new Set();
comunalDiario.forEach(r => {
  const fi = FUELS.indexOf(r.combustible), ti = tIdx[r.fecha]; if (fi < 0 || ti == null) return;
  let k = norm(r.comuna); k = COM_ALIAS[k] || k;
  const ci = comByKey[k]; if (ci == null) { sinMatch.add(r.comuna); return; }
  (CS[fi][ci] ||= new Array(nD).fill(null))[ti - nM] = r1(parseFloat(r.precio_promedio));
  (CN[fi][ci] ||= new Array(nD).fill(null))[ti - nM] = parseInt(r.n_registros, 10);
});

// ---------------------------------------------------------------- geometria proyectada (equirectangular, mismo factor en x e y)
const regGeoJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'regions_coarse.geojson'), 'utf8'));
const bbox = { minX: -75.7, maxX: -66.4, minY: -56.0, maxY: -17.5 };
const phi0 = ((bbox.minY + bbox.maxY) / 2) * Math.PI / 180, cosP = Math.cos(phi0);
const H = 3000, M = 20, S = (H - 2 * M) / (bbox.maxY - bbox.minY);
const W = Math.round((bbox.maxX - bbox.minX) * cosP * S + 2 * M);
const proj = (lon, lat) => [Math.round(((lon - bbox.minX) * cosP * S + M) * 10) / 10, Math.round(((bbox.maxY - lat) * S + M) * 10) / 10];
function ringPath(ring) { return 'M' + ring.map(([lo, la]) => proj(lo, la).join(' ')).join('L') + 'Z'; }
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) { const [x1, y1] = proj(...ring[i]), [x2, y2] = proj(...ring[i + 1]); const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  a /= 2; return a === 0 ? proj(...ring[0]) : [Math.round(cx / (6 * a)), Math.round(cy / (6 * a))];
}
function ringArea(ring) { let s = 0; for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(s / 2); }
function shape(rings) {
  const big = rings.reduce((m, r) => ringArea(r) > ringArea(m) ? r : m, rings[0]);
  const xs = [], ys = []; rings.forEach(r => r.forEach(p => { const q = proj(...p); xs.push(q[0]); ys.push(q[1]); }));
  return { d: rings.map(ringPath).join(''), a: ringCentroid(big), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}
const geoReg = [];
regGeoJson.features.forEach(f => {
  const ri = regByCod[f.properties.codregion]; if (ri == null) return;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = polys.map(p => p[0]).filter(r => { const cx = r.reduce((s, q) => s + q[0], 0) / r.length, cy = r.reduce((s, q) => s + q[1], 0) / r.length; return cx > -76.5 && cx < -65.5 && cy > -56.5 && cy < -17; });
  if (rings.length) geoReg.push({ i: ri, ...shape(rings) });
});
const geoCom = comGeo.map((c, i) => ({ i, ...shape(c.g) }));
function dpSimplify(pts, tol) {
  const n = pts.length; if (n < 5) return pts; const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) { const [a0, b0] = st.pop(); let mx = 0, ix = -1; const [x1, y1] = pts[a0], [x2, y2] = pts[b0], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    for (let i = a0 + 1; i < b0; i++) { const [x, y] = pts[i]; let d; if (L === 0) d = Math.hypot(x - x1, y - y1); else { let t = ((x - x1) * dx + (y - y1) * dy) / L; t = Math.max(0, Math.min(1, t)); d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); } if (d > mx) { mx = d; ix = i; } }
    if (mx > tol && ix > 0) { keep[ix] = 1; st.push([a0, ix], [ix, b0]); } }
  return pts.filter((_, i) => keep[i]);
}
// Version muy simplificada de las regiones, para mapas pequenos (miniatura y mapa del detalle regional)
const geoRegSmall = [];
regGeoJson.features.forEach(f => {
  const ri = regByCod[f.properties.codregion]; if (ri == null) return;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = polys.map(p => p[0]).filter(r => { const cx = r.reduce((s2, q) => s2 + q[0], 0) / r.length, cy = r.reduce((s2, q) => s2 + q[1], 0) / r.length; return cx > -76.5 && cx < -65.5 && cy > -56.5 && cy < -17 && ringArea(r) > 0.01; })
    .map(r => dpSimplify(r, 0.035)).filter(r => r.length >= 4);
  if (rings.length) geoRegSmall.push({ i: ri, d: rings.map(ringPath).join('') });
});
const coms = comGeo.map((c, i) => ({ n: c.n, r: regByCod[c.r], d: FUELS.some((_, fi) => CS[fi][i]) ? 1 : 0 }));

// ---------------------------------------------------------------- operadores + extremos (para la pagina Terminal)
const RANGO = { 'Gasolina 93': [500, 2500], 'Gasolina 95': [500, 2500], 'Gasolina 97': [500, 2500], 'Diésel': [400, 2500], 'Kerosene': [300, 2000], 'GLP': [200, 1500], 'GNC': [150, 1500] };
const GRUPO = c => { const u = String(c).toUpperCase().replace(/^A/, ''); if (['93', '95', '97'].includes(u)) return 'Gasolina ' + u; if (c === 'DI' || c === 'ADI') return 'Diésel'; if (c === 'KE' || c === 'AKE') return 'Kerosene'; if (u === 'GLP') return 'GLP'; if (u === 'GNC') return 'GNC'; return null; };
const snapRows = readCsv(path.join(DATA, 'snapshots', ultimoDia + '.csv'));

// ---------------------------------------------------------------- operadores: nombres unificados, estaciones reales y logos oficiales
// El catalogo de la CNE trae algunas marcas duplicadas con distinta capitalizacion (p. ej. "Sin Bandera" y "SIN BANDERA"):
// se tratan como una sola. "Sin bandera" = estaciones sin marca informada.
const LOGOS_OFICIALES = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'logos_marcas.json'), 'utf8'));
const marcaKey = m => String(m).trim().toUpperCase();
const NOMBRE_FIJO = { 'SIN BANDERA': 'Sin bandera' };
const variantes = {};
operadorDiario.forEach(r => { const k = marcaKey(r.marca); (variantes[k] ||= {})[r.marca] = (variantes[k][r.marca] || 0) + parseInt(r.n_registros, 10); });
const nombreDe = {}; Object.entries(variantes).forEach(([k, v]) => { nombreDe[k] = NOMBRE_FIJO[k] || Object.entries(v).sort((x, y) => y[1] - x[1])[0][0]; });
const estacionesPorMarca = {};
snapRows.forEach(r => { const n = nombreDe[marcaKey(r.marca)] || r.marca; (estacionesPorMarca[n] ||= new Set()).add(r.estacion_id); });
const marcas = Object.entries(estacionesPorMarca).sort((x, y) => y[1].size - x[1].size).slice(0, 12).map(([m]) => m);
const OS = FUELS.map(() => ({})), ON = FUELS.map(() => ({}));
{
  const acc = {};   // (fuel, marca, t) -> { w: suma precio*n, n }
  operadorDiario.forEach(r => {
    const fi = FUELS.indexOf(r.combustible), ti = tIdx[r.fecha]; const nom = nombreDe[marcaKey(r.marca)];
    if (fi < 0 || ti == null || !marcas.includes(nom)) return;
    const n = parseInt(r.n_registros, 10), p = parseFloat(r.precio_promedio); const key = fi + '|' + nom + '|' + ti;
    const o = (acc[key] ||= { fi, nom, ti, w: 0, n: 0 }); o.w += p * n; o.n += n;
  });
  Object.values(acc).forEach(o => { (OS[o.fi][o.nom] ||= new Array(nD).fill(null))[o.ti - nM] = r1(o.w / o.n); (ON[o.fi][o.nom] ||= new Array(nD).fill(null))[o.ti - nM] = o.n; });
}

const extremos = FUELS.map(fuel => {
  const rows = snapRows.filter(r => GRUPO(r.combustible_corto) === fuel).map(r => ({ p: parseFloat(r.precio), m: r.marca, c: r.comuna, rg: r.region, d: (r.direccion || '').trim().replace(/\s+/g, ' ') }))
    .filter(r => Number.isFinite(r.p) && r.p >= RANGO[fuel][0] && r.p <= RANGO[fuel][1]);
  rows.sort((a, b) => a.p - b.p);
  const pick = x => ({ p: x.p, m: x.m, c: x.c, r: (REGS[regByLive[x.rg]] || { n: x.rg }).n, d: x.d });
  return { barato: rows.slice(0, 6).map(pick), caro: rows.slice(-6).reverse().map(pick), n: rows.length };
});

// estaciones DISTINTAS por operador y combustible (hoy): una misma estacion puede informar autoservicio y asistido
const OSN = FUELS.map(fuel => { const o = {}; const sets = {};
  snapRows.forEach(r => { if (GRUPO(r.combustible_corto) !== fuel) return; const p = parseFloat(r.precio); if (!(p >= RANGO[fuel][0] && p <= RANGO[fuel][1])) return; const n = nombreDe[marcaKey(r.marca)] || r.marca; (sets[n] ||= new Set()).add(r.estacion_id); });
  marcas.forEach(m => { o[m] = sets[m] ? sets[m].size : 0; }); return o; });
const LOGOS = {}; marcas.forEach(m => { LOGOS[m] = LOGOS_OFICIALES[marcaKey(m)] || null; });

// ---------------------------------------------------------------- cobertura (lo que hay y lo que no)
const cobertura = {
  mensual: Object.fromEntries(Object.entries(HIST_FILE).map(([f]) => { const ms = [...new Set(histRows[f].map(r => r.fecha))].sort(); return [f, { desde: ms[0], hasta: ms[ms.length - 1], n: ms.length }]; })),
  diario: { desde: primerDia, hasta: ultimoDia, dias: diasConDato.length, faltantes: diasFaltantes },
  comunasConDato: coms.filter(c => c.d).length, comunasTotal: coms.length,
  estaciones: snapRows.length ? new Set(snapRows.map(r => r.estacion_id)).size : 0
};

// ---------------------------------------------------------------- bundle
const bundle = {
  generado: new Date().toISOString(), ultimoDia, T, nM, nD, diasFaltantes, fuels: FUELS, regs: REGS.map(r => ({ c: r.c, n: r.n })),
  RS, RN, NS, NN, CS, CN, coms, geoReg, geoCom, W, H, marcas, OS, ON, extremos, cobertura
};
fs.mkdirSync(DOCS, { recursive: true });
const { aplicarMarca } = require('./lib/brand');
// La pagina Terminal no necesita geometria ni series por comuna: paquete mas liviano.
const bundleTerminal = { generado: bundle.generado, ultimoDia, T, nM, nD, fuels: FUELS, regs: bundle.regs, RS, NS, NN, OS, ON, OSN, LOGOS, marcas, extremos, cobertura, geoRegSmall, W, H };
const jsonFull = JSON.stringify(bundle).replace(/</g, '\\u003c');
const jsonTerminal = JSON.stringify(bundleTerminal).replace(/</g, '\\u003c');
for (const [tpl, out, json] of [['territorial_template.html', 'territorial.html', jsonFull], ['terminal_template.html', 'index.html', jsonTerminal]]) {
  const p = path.join(__dirname, tpl);
  if (!fs.existsSync(p)) { console.log('(sin plantilla ' + tpl + ', se omite)'); continue; }
  const html = aplicarMarca(fs.readFileSync(p, 'utf8'), out === 'index.html' ? 'index' : 'territorial').replace('__BUNDLE__', () => json);
  fs.writeFileSync(path.join(DOCS, out), html);
  console.log('Escrito docs/' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
}
console.log('Linea de tiempo:', T[0], '->', T[T.length - 1], '|', nM, 'meses +', nD, 'dias | dias sin captura:', diasFaltantes.join(', ') || 'ninguno');
console.log('Comunas con dato:', cobertura.comunasConDato + '/' + cobertura.comunasTotal, '| comunas de la API sin match en el mapa:', [...sinMatch].join(', ') || 'ninguna');
console.log('Regiones con serie diaria completa:', REGS.map((_, ri) => RS[0][ri].slice(nM).filter(v => v != null).length).join(','));
