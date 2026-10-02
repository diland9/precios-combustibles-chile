const fs = require('fs');

const D2R = Math.PI / 180;

function loadRegions() {
  const geojson = JSON.parse(fs.readFileSync(__dirname + '/regions_simplified.geojson', 'utf8'));
  const bbox = JSON.parse(fs.readFileSync(__dirname + '/regions_bbox.json', 'utf8'));
  return { geojson, bbox };
}

// Equirectangular projection with a single standard parallel (phi0) so that
// x = lon*cos(phi0) and y = -lat use the SAME linear scale (both ~km-equivalent).
// marginTop reserves a dedicated header band (for a legend/title) that sits
// ABOVE the projected data, so it can never overlap a point or the coastline.
function makeProjector(bbox, { canvasHeight = 1500, marginPx = 50, marginTop = null } = {}) {
  const top = marginTop == null ? marginPx : marginTop;
  const phi0 = ((bbox.minY + bbox.maxY) / 2) * D2R;
  const cosPhi0 = Math.cos(phi0);

  const px0 = bbox.minX * cosPhi0;
  const px1 = bbox.maxX * cosPhi0;
  const py0 = -bbox.maxY; // north (max lat) -> smallest y
  const py1 = -bbox.minY; // south (min lat) -> largest y

  const dataH = py1 - py0;
  const dataW = px1 - px0;

  const scale = (canvasHeight - top - marginPx) / dataH;
  const canvasWidth = dataW * scale + 2 * marginPx;

  function project(lon, lat) {
    const x = (lon * cosPhi0 - px0) * scale + marginPx;
    const y = (-lat - py0) * scale + top;
    return [x, y];
  }

  return { project, canvasWidth, canvasHeight, scale };
}

// Landscape projector: Chile rotated so its long north-south axis runs
// horizontally - north on the LEFT, south on the RIGHT (reading order), with
// the Pacific coast along the TOP edge and the Andes/Argentina border along
// the BOTTOM. This is just the portrait projection with x/y swapped (a
// transpose), so distances stay correct in both directions.
// marginLeft reserves a dedicated column (for the legend) to the LEFT of the
// map, exactly like marginTop did above the map in portrait mode.
function makeProjectorLandscape(bbox, { canvasWidth = 1600, marginPx = 45, marginLeft = null, marginTop = 78 } = {}) {
  const left = marginLeft == null ? marginPx : marginLeft;
  const phi0 = ((bbox.minY + bbox.maxY) / 2) * D2R;
  const cosPhi0 = Math.cos(phi0);

  const px0 = bbox.minX * cosPhi0; // west
  const px1 = bbox.maxX * cosPhi0; // east
  const py0 = -bbox.maxY; // north
  const py1 = -bbox.minY; // south

  const dataNS = py1 - py0; // north-south range -> now the horizontal extent
  const dataEW = px1 - px0; // east-west range -> now the vertical extent

  const scale = (canvasWidth - left - marginPx) / dataNS;
  const canvasHeight = dataEW * scale + marginTop + marginPx;

  function project(lon, lat) {
    const oldX = lon * cosPhi0 - px0; // 0 at west/coast
    const oldY = -lat - py0;          // 0 at north
    const x = oldY * scale + left;    // north -> left, south -> right
    const y = oldX * scale + marginTop; // west/coast -> top, east/Andes -> bottom
    return [x, y];
  }

  return { project, canvasWidth, canvasHeight, scale };
}

function ringToPath(ring, project) {
  // integer px is plenty at this canvas scale and meaningfully shrinks file size
  return ring.map((pt, i) => {
    const [x, y] = project(pt[0], pt[1]);
    return (i === 0 ? 'M' : 'L') + Math.round(x) + ',' + Math.round(y);
  }).join('') + 'Z';
}

function regionsToSvgPaths(geojson, project, { fill = '#FFFFFF', stroke = '#4A4946', strokeWidth = 1 } = {}) {
  let out = '';
  geojson.features.forEach(f => {
    const polys = f.geometry.coordinates; // MultiPolygon
    const d = polys.map(poly => poly.map(ring => ringToPath(ring, project)).join(' ')).join(' ');
    out += `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" fill-rule="evenodd"/>\n`;
  });
  return out;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgHeader(width, height, title) {
  // no background rect -> transparent canvas
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" font-family="Arial, Helvetica, sans-serif">
<title>${escapeXml(title)}</title>
`;
}

const svgFooter = '</svg>\n';

// Regional capitals, positioned by the mean coordinate of real stations/chargers
// registered under that comuna (far more reliable than a comuna-polygon centroid,
// since several capital comunas - Coyhaique, Punta Arenas - stretch out into huge,
// mostly-empty administrative territory well past the actual city).
const CAPITALES = [
  { city: 'Arica', lat: -18.4696, lon: -70.2890 },
  { city: 'Iquique', lat: -20.2306, lon: -70.1405 },
  { city: 'Antofagasta', lat: -23.6277, lon: -70.3707 },
  { city: 'Copiapó', lat: -27.3727, lon: -70.3377 },
  { city: 'La Serena', lat: -29.9164, lon: -71.2460 },
  { city: 'Valparaíso', lat: -33.0659, lon: -71.6015 },
  { city: 'Santiago', lat: -33.4513, lon: -70.6571 },
  { city: 'Rancagua', lat: -34.1640, lon: -70.7378 },
  { city: 'Talca', lat: -35.4285, lon: -71.6473 },
  { city: 'Chillán', lat: -36.6070, lon: -72.4276 },
  { city: 'Concepción', lat: -36.8171, lon: -73.0330 },
  { city: 'Temuco', lat: -38.7368, lon: -72.6110 },
  { city: 'Valdivia', lat: -39.8226, lon: -73.2290 },
  { city: 'Puerto Montt', lat: -41.4632, lon: -72.9532 },
  { city: 'Coyhaique', lat: -45.5741, lon: -72.6785 },
  { city: 'Punta Arenas', lat: -53.1545, lon: -70.9098 }
];

// Subtle index of regional-capital names running down the LEFT margin (ocean
// gutter), each at its own latitude - orientation aid, never on top of the
// coastline or a data point regardless of how the coast curves at that latitude.
function capitalsSvg(project, canvasWidth, canvasHeight, { marginLeft = 8, color = '#8A8981', fontSize = 9.5 } = {}) {
  let s = '<g id="capitales" font-family="Arial, Helvetica, sans-serif">\n';
  CAPITALES.forEach(cap => {
    const [, y] = project(cap.lon, cap.lat);
    if (y < 0 || y > canvasHeight) return;
    s += `<text x="${marginLeft}" y="${y.toFixed(1)}" font-size="${fontSize}" fill="${color}" font-style="italic">${escapeXml(cap.city)}</text>\n`;
  });
  s += '</g>\n';
  return s;
}

// Landscape counterpart: one vertical label per capital, anchored right at the
// top edge (the coastline row) and growing UPWARD into the margin above the
// map - stays right on the border, as close as the label's own height allows,
// and never sits on top of the land or a point.
function capitalsSvgLandscape(project, canvasWidth, canvasHeight, { topRow = null, color = '#8A8981', fontSize = 9.5, gap = 4 } = {}) {
  let s = '<g id="capitales" font-family="Arial, Helvetica, sans-serif">\n';
  CAPITALES.forEach(cap => {
    const [x, yCoast] = project(cap.lon, cap.lat);
    if (x < 0 || x > canvasWidth) return;
    const y = (topRow == null ? yCoast : topRow) - gap;
    s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fontSize}" fill="${color}" font-style="italic" text-anchor="start" transform="rotate(-90 ${x.toFixed(1)} ${y.toFixed(1)})">${escapeXml(cap.city)}</text>\n`;
  });
  s += '</g>\n';
  return s;
}

module.exports = { loadRegions, makeProjector, makeProjectorLandscape, regionsToSvgPaths, ringToPath, escapeXml, svgHeader, svgFooter, capitalsSvg, capitalsSvgLandscape, CAPITALES };
