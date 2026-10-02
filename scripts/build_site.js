// Genera docs/index.html (el buscador/mapa) a partir del snapshot MAS RECIENTE en
// data/snapshots/. Se corre despues de fetch_snapshot.js, asi la pagina publicada por
// GitHub Pages queda al dia todos los dias.
const fs = require('fs');
const path = require('path');
const { makeProjector, ringToPath } = require('./lib/mapkit');

const SNAP_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const latestFile = fs.readdirSync(SNAP_DIR).filter(f => f.endsWith('.csv')).sort().pop();
if (!latestFile) { console.error('No hay snapshots todavia.'); process.exit(1); }
console.log('Usando snapshot:', latestFile);

function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur);
  return out;
}

const txt = fs.readFileSync(path.join(SNAP_DIR, latestFile), 'utf8');
const lines = txt.split(/\r?\n/).filter(l => l.length);
const header = parseCsvLine(lines[0]);
const idx = {}; header.forEach((h, i) => idx[h] = i);

const GRUPOS = { '93': 'Gasolina 93', 'A93': 'Gasolina 93', '95': 'Gasolina 95', 'A95': 'Gasolina 95', '97': 'Gasolina 97', 'A97': 'Gasolina 97', 'DI': 'Diésel', 'ADI': 'Diésel', 'KE': 'Kerosene', 'AKE': 'Kerosene', 'GLP': 'GLP', 'GNC': 'GNC' };
const RANGO = { 'Gasolina 93': [500, 2500], 'Gasolina 95': [500, 2500], 'Gasolina 97': [500, 2500], 'Diésel': [400, 2500], 'Kerosene': [300, 2000], 'GLP': [200, 1500], 'GNC': [150, 1500] };
const FUEL_ORDER = ['Gasolina 93', 'Gasolina 95', 'Gasolina 97', 'Diésel', 'Kerosene', 'GLP', 'GNC'];

const estaciones = {};
for (let i = 1; i < lines.length; i++) {
  const p = parseCsvLine(lines[i]);
  const id = p[idx.estacion_id];
  if (!estaciones[id]) {
    estaciones[id] = { id, marca: p[idx.marca], region: p[idx.region], comuna: p[idx.comuna], direccion: (p[idx.direccion] || '').trim().replace(/\s+/g, ' '), lat: parseFloat(p[idx.latitud]), lon: parseFloat(p[idx.longitud]), precios: {} };
  }
  const grupo = GRUPOS[p[idx.combustible_corto]] || p[idx.combustible_corto];
  const precio = parseFloat(p[idx.precio]);
  const rango = RANGO[grupo];
  if (Number.isFinite(precio) && (!rango || (precio >= rango[0] && precio <= rango[1]))) {
    if (estaciones[id].precios[grupo] == null || precio < estaciones[id].precios[grupo]) estaciones[id].precios[grupo] = precio;
  }
}
const stationList = Object.values(estaciones).filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lon));

const regionsGeo = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'regions_coarse.geojson'), 'utf8'));
const bbox = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'regions_bbox.json'), 'utf8'));
const { project, canvasWidth, canvasHeight } = makeProjector(bbox, { canvasHeight: 1500, marginPx: 10 });
function featureToPathD(f) {
  return f.geometry.coordinates.map(poly => poly.map(ring => ringToPath(ring, project)).join(' ')).join(' ');
}
const regionPaths = regionsGeo.features.filter(f => f.properties.codregion !== 0).map(featureToPathD);

const regiones = [...new Set(stationList.map(e => e.region))].sort();
const comunas = [...new Set(stationList.map(e => e.comuna))].sort();
const marcas = [...new Set(stationList.map(e => e.marca))].sort();
const regionIdx = {}; regiones.forEach((r, i) => regionIdx[r] = i);
const comunaIdx = {}; comunas.forEach((c, i) => comunaIdx[c] = i);
const marcaIdx = {}; marcas.forEach((m, i) => marcaIdx[m] = i);
const comunasPorRegion = {};
stationList.forEach(e => { (comunasPorRegion[e.region] = comunasPorRegion[e.region] || new Set()).add(e.comuna); });
Object.keys(comunasPorRegion).forEach(r => { comunasPorRegion[r] = [...comunasPorRegion[r]].sort().map(c => comunaIdx[c]); });

const stationsOut = stationList.map(e => {
  const [x, y] = project(e.lon, e.lat);
  const p = FUEL_ORDER.map(f => (e.precios[f] != null ? e.precios[f] : null));
  return [e.id, marcaIdx[e.marca], regionIdx[e.region], comunaIdx[e.comuna], e.direccion, Math.round(x * 10) / 10, Math.round(y * 10) / 10, p];
});

// ---------- historico: oficial CNE (1994-2026, mensual, 5 combustibles) + diario propio ----------
const HIST_FUEL_FILE = { 'Gasolina 93': 'gasolina_93', 'Gasolina 95': 'gasolina_95', 'Gasolina 97': 'gasolina_97', 'Diésel': 'diesel', 'Kerosene': 'kerosene' };
// nombre corto (como viene en la planilla historica de la CNE) -> nombre tal como lo entrega
// la API en vivo de bencinaenlinea (son organismos/fuentes distintas, usan redacciones distintas)
const REGION_ALIAS = {
  'Antofagasta': 'Antofagasta', 'Araucanía': 'De la Araucanía', 'Arica y Parinacota': 'Arica y Parinacota',
  'Atacama': 'Atacama', 'Aysén': 'Aysén del Gral. Carlos Ibáñez del Campo', 'Biobío': 'Del Biobío',
  'Coquimbo': 'Coquimbo', 'Los Lagos': 'De los Lagos', 'Los Ríos': 'De los Ríos',
  'Magallanes': 'Magallanes y de la Antártica Chilena', 'Maule': 'Del Maule', 'Metropolitana': 'Metropolitana de Santiago',
  "O'Higgins": 'Del Libertador Gral. Bernardo O’Higgins', 'Tarapacá': 'Tarapacá', 'Valparaíso': 'Valparaíso', 'Ñuble': 'Ñuble'
};
const HIST_DIR = path.join(__dirname, '..', 'data', 'historico_oficial_regional');

function readSimpleCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const t = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.length);
  const h = parseCsvLine(t[0]);
  return t.slice(1).map(l => { const p = parseCsvLine(l); const o = {}; h.forEach((c, i) => o[c] = p[i]); return o; });
}

// Por combustible, todas las regiones comparten la MISMA grilla de fechas (mensual 1994+,
// luego diaria desde que arranco el monitor) -> se guarda una sola vez por combustible
// {fechas:[...], nacional:[valores], porRegion:{region:[valores]}} en vez de repetir cada
// fecha 16 veces (ahorra ~650KB).
const histNacional = {}, histRegional = {};
Object.entries(HIST_FUEL_FILE).forEach(([combustible, file]) => {
  const rows = readSimpleCsv(path.join(HIST_DIR, file + '.csv'));
  const porMes = {}; // fecha -> {regionLive: precio}
  rows.forEach(r => {
    const liveRegion = REGION_ALIAS[r.region];
    if (!liveRegion) return;
    porMes[r.fecha] = porMes[r.fecha] || {};
    porMes[r.fecha][liveRegion] = parseFloat(r.precio_clp_litro);
  });
  histNacional[combustible] = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([f, vals]) => {
    const arr = Object.values(vals);
    return [f, Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100];
  });
  histRegional[combustible] = {};
  Object.keys(REGION_ALIAS).forEach(shortName => {
    const liveRegion = REGION_ALIAS[shortName];
    const serie = Object.entries(porMes).filter(([, vals]) => vals[liveRegion] != null).sort(([a], [b]) => a.localeCompare(b)).map(([f, vals]) => [f, vals[liveRegion]]);
    if (serie.length) histRegional[combustible][liveRegion] = serie;
  });
});

const nacionalDiario = readSimpleCsv(path.join(__dirname, '..', 'data', 'aggregates', 'nacional_diario.csv'));
FUEL_ORDER.forEach(combustible => {
  const rows = nacionalDiario.filter(r => r.combustible === combustible);
  if (!rows.length) return;
  histNacional[combustible] = (histNacional[combustible] || []).concat(rows.map(r => [r.fecha, parseFloat(r.precio_promedio)]));
});

const regionalDiario = readSimpleCsv(path.join(__dirname, '..', 'data', 'aggregates', 'regional_diario.csv'));
FUEL_ORDER.forEach(combustible => {
  regiones.forEach(region => {
    const rows = regionalDiario.filter(r => r.combustible === combustible && r.region === region);
    if (!rows.length) return;
    histRegional[combustible] = histRegional[combustible] || {};
    histRegional[combustible][region] = (histRegional[combustible][region] || []).concat(rows.map(r => [r.fecha, parseFloat(r.precio_promedio)]));
  });
});

// comunal: solo lo que el propio monitor ha ido juntando (no hay respaldo historico oficial a nivel comunal)
const comunalDiarioRows = readSimpleCsv(path.join(__dirname, '..', 'data', 'aggregates', 'comunal_diario.csv'))
  .map(r => [r.fecha, regionIdx[r.region], comunaIdx[r.comuna], r.combustible, parseFloat(r.precio_promedio)])
  .filter(r => r[1] !== undefined && r[2] !== undefined);

const bundle = {
  fecha: lines[1] ? parseCsvLine(lines[1])[idx.fecha] : null,
  canvasWidth: Math.round(canvasWidth), canvasHeight: Math.round(canvasHeight),
  regionPaths, stations: stationsOut, regiones, comunas, comunasPorRegion, marcas, combustibles: FUEL_ORDER,
  histNacional, histRegional, comunalDiarioRows,
  fuelesConHistoriaOficial: Object.keys(HIST_FUEL_FILE)
};

const templatePath = path.join(__dirname, 'site_template.html');
const template = fs.readFileSync(templatePath, 'utf8');
const out = template.replace('__BUNDLE_JSON__', JSON.stringify(bundle));
const outDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), out);
console.log('Escrito docs/index.html (' + stationList.length + ' estaciones, ' + Math.round(out.length / 1024) + ' KB)');
