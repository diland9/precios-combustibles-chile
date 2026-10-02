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

const bundle = {
  fecha: lines[1] ? parseCsvLine(lines[1])[idx.fecha] : null,
  canvasWidth: Math.round(canvasWidth), canvasHeight: Math.round(canvasHeight),
  regionPaths, stations: stationsOut, regiones, comunas, comunasPorRegion, marcas, combustibles: FUEL_ORDER
};

const templatePath = path.join(__dirname, 'site_template.html');
const template = fs.readFileSync(templatePath, 'utf8');
const out = template.replace('__BUNDLE_JSON__', JSON.stringify(bundle));
const outDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), out);
console.log('Escrito docs/index.html (' + stationList.length + ' estaciones, ' + Math.round(out.length / 1024) + ' KB)');
