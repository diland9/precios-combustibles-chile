// Genera un Excel con la evolucion historica del Kerosene: nacional y regional,
// combinando la serie oficial mensual de la CNE (1994+) con el monitoreo diario propio.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

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
function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.length);
  const h = parseCsvLine(lines[0]);
  return lines.slice(1).map(l => { const p = parseCsvLine(l); const o = {}; h.forEach((c, i) => o[c] = p[i]); return o; });
}

const ROOT = path.join(__dirname, '..');
const histRows = readCsv(path.join(ROOT, 'data', 'historico_oficial_regional', 'kerosene.csv'));
const dailyNac = readCsv(path.join(ROOT, 'data', 'aggregates', 'nacional_diario.csv')).filter(r => r.combustible === 'Kerosene');
const dailyReg = readCsv(path.join(ROOT, 'data', 'aggregates', 'regional_diario.csv')).filter(r => r.combustible === 'Kerosene');

// ---------- Regional: historico + diario, ordenado ----------
const regionalRows = histRows.map(r => ({
  Fecha: r.fecha, Region: r.region, Precio_CLP_L: Math.round(parseFloat(r.precio_clp_litro) * 100) / 100, Fuente: 'CNE - serie oficial mensual'
}));
// de-duplicar el diario (el workflow se corrio varias veces de prueba el mismo dia)
const seenReg = new Set();
dailyReg.forEach(r => {
  const key = r.fecha + '|' + r.region;
  if (seenReg.has(key)) return;
  seenReg.add(key);
  regionalRows.push({ Fecha: r.fecha, Region: r.region, Precio_CLP_L: Math.round(parseFloat(r.precio_promedio) * 100) / 100, Fuente: 'Monitoreo diario propio (bencinaenlinea.cl)' });
});
regionalRows.sort((a, b) => a.Fecha < b.Fecha ? -1 : a.Fecha > b.Fecha ? 1 : a.Region.localeCompare(b.Region));

// ---------- Nacional: promedio simple entre regiones por mes/dia ----------
const porFecha = {};
regionalRows.forEach(r => {
  if (!porFecha[r.Fecha]) porFecha[r.Fecha] = { vals: [], fuente: r.Fuente };
  porFecha[r.Fecha].vals.push(r.Precio_CLP_L);
});
const nacionalRows = Object.entries(porFecha).sort(([a], [b]) => a < b ? -1 : 1).map(([fecha, d]) => ({
  Fecha: fecha,
  Precio_promedio_CLP_L: Math.round((d.vals.reduce((a, b) => a + b, 0) / d.vals.length) * 100) / 100,
  N_regiones: d.vals.length,
  Fuente: d.fuente
}));

// ---------- Metodologia ----------
const metodologia = [
  ['Kerosene (doméstico) — evolución histórica del precio, Chile'],
  [''],
  ['Fuente histórica (hasta sep-2026, mensual, por región)', 'Comisión Nacional de Energía (CNE)'],
  ['Nombre del archivo fuente', 'Precio Mensual Regional de Combustibles Líquidos'],
  ['Descarga directa', 'https://www.cne.cl/wp-content/uploads/2026/09/precios_comb_liquidos_en_el_pais-2026-09-07-2.xlsx'],
  ['Para buscar una version mas nueva', 'https://www.cne.cl/estadisticas/hidrocarburo/  ->  sección "Precios" -> "Precio Mensual Regional de Combustibles Líquidos"'],
  [''],
  ['Fuente real detrás, segun la propia planilla de la CNE', ''],
  ['Hasta diciembre de 2012', 'Encuesta de Precios SERNAC'],
  ['Desde enero de 2013', 'Precio a público promedio en estaciones, del sistema de información de precios de la CNE, misma metodología y muestra que la encuesta SERNAC'],
  [''],
  ['Fuente del monitoreo diario (desde 1-oct-2026 en adelante)', 'API pública de bencinaenlinea.cl (CNE/SEC), repo precios-combustibles-chile'],
  ['Repo con el monitor diario (código + datos crudos)', 'https://github.com/diland9/precios-combustibles-chile'],
  ['Página en vivo (mapa + buscador + este mismo histórico, actualizado solo)', 'https://diland9.github.io/precios-combustibles-chile/'],
  [''],
  ['Cómo se calculó "Nacional"', 'Promedio simple entre las regiones con dato disponible ese mes/día (no ponderado por consumo ni población). La CNE no publica un promedio nacional oficial para esta serie, solo el dato por región.'],
  ['Por qué hay un salto en la columna Fuente', 'Antes de oct-2026 cada fila es un promedio MENSUAL oficial; desde oct-2026 cada fila es una foto DIARIA del monitoreo propio. No son estrictamente la misma medida, pero el empalme es el mejor disponible — revisar la columna Fuente de cada fila.'],
  ['Valores', 'CLP $/litro, nominales (no ajustados por inflación), sin IVA especificado por la fuente.']
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nacionalRows), 'Nacional');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regionalRows), 'Regional');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metodologia), 'Fuente y metodologia');

const outPath = path.join(ROOT, '..', 'Kerosene_Evolucion_Historica_Chile.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Escrito:', outPath);
console.log('Nacional:', nacionalRows.length, 'filas | Regional:', regionalRows.length, 'filas');
