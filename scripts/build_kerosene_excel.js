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

// ---------- Nacional anual (para graficar en Canva con un eje X limpio) ----------
// Un punto por año (el de julio, como representante del año) desde 1994 hasta el
// ultimo año completo; para 2026 (año en curso) se deja el detalle mensual completo
// en vez de un solo punto, para no perder la transicion reciente.
const nacionalPorFecha = {};
nacionalRows.forEach(r => { nacionalPorFecha[r.Fecha] = r; });

const ULTIMO_ANIO_COMPLETO = 2025;
const anualRows = [];
for (let y = 1994; y <= ULTIMO_ANIO_COMPLETO; y++) {
  const r = nacionalPorFecha[y + '-07'];
  anualRows.push({
    Fecha: String(y),
    Precio_promedio_CLP_L: r ? r.Precio_promedio_CLP_L : null,
    Fuente: r ? r.Fuente : 'Sin dato de julio ese año'
  });
}
// 2026 en curso: un punto por cada mes con dato (enero en adelante), para mostrar el detalle reciente
Object.keys(nacionalPorFecha).filter(f => f.startsWith('2026-') && f.length === 7).sort().forEach(f => {
  const r = nacionalPorFecha[f];
  anualRows.push({ Fecha: f, Precio_promedio_CLP_L: r.Precio_promedio_CLP_L, Fuente: r.Fuente });
});
// si ya hay monitoreo diario de octubre 2026 (o mas), se resume en un solo punto "2026-10" (mismo
// nivel de detalle que el resto: un punto por mes), promediando los dias capturados ese mes
const diasOctEnAdelante = Object.keys(nacionalPorFecha).filter(f => f.length === 10 && f >= '2026-10-01');
if (diasOctEnAdelante.length) {
  const porMes = {};
  diasOctEnAdelante.forEach(f => {
    const mes = f.slice(0, 7);
    (porMes[mes] = porMes[mes] || []).push(nacionalPorFecha[f].Precio_promedio_CLP_L);
  });
  Object.keys(porMes).sort().forEach(mes => {
    const vals = porMes[mes];
    anualRows.push({
      Fecha: mes,
      Precio_promedio_CLP_L: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      Fuente: 'Monitoreo diario propio (bencinaenlinea.cl) — promedio de ' + vals.length + ' día(s) capturado(s) ese mes'
    });
  });
}

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

metodologia.push(
  [''],
  ['Hoja "Nacional anual (jul)"', 'Pensada para graficar directo en Canva con un eje X limpio: un punto por año (1994-' + ULTIMO_ANIO_COMPLETO + '), tomando el valor de julio de cada año como representante. Para 2026 (año en curso) se deja el detalle mes a mes en vez de un solo punto, para no perder la transición reciente hacia el monitoreo diario.']
);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nacionalRows), 'Nacional');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anualRows), 'Nacional anual (jul)');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regionalRows), 'Regional');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metodologia), 'Fuente y metodologia');

const outPath = path.join(ROOT, '..', '..', 'Kerosene_Evolucion_Historica_Chile.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Escrito:', outPath);
console.log('Nacional:', nacionalRows.length, 'filas | Nacional anual:', anualRows.length, 'filas | Regional:', regionalRows.length, 'filas');
