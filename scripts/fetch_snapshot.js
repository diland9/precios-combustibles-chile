// Descarga el estado actual de todas las estaciones de bencinaenlinea.cl (CNE/SEC)
// y lo guarda como:
//   1) una foto completa del dia en data/snapshots/YYYY-MM-DD.csv (estacion x combustible)
//   2) una fila agregada por combustible en data/aggregates/nacional_diario.csv
//   3) una fila agregada por region+combustible en data/aggregates/regional_diario.csv
//   4) una fila agregada por comuna+combustible en data/aggregates/comunal_diario.csv
//
// Fuente: API publica (sin login) que usa el propio sitio bencinaenlinea.cl.
// Limite conocido: ~500 solicitudes/hora por IP.
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.bencinaenlinea.cl/api';
const DATA_DIR = path.join(__dirname, '..', 'data');

function today() {
  // fecha en horario de Chile (UTC-3/UTC-4 segun horario de verano); usamos UTC-3 fijo
  // como aproximacion razonable para "que dia es" al momento de correr el job.
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'precios-combustibles-chile-monitor/1.0 (github actions, uso ciudadano)' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + url);
  return res.json();
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => csvEscape(r[h])).join(',')));
  return lines.join('\n') + '\n';
}

async function main() {
  const fecha = today();
  console.log('Fecha de corrida (Chile aprox):', fecha);

  const [marcasResp, estacionesResp] = await Promise.all([
    fetchJson(API_BASE + '/marca_ciudadano'),
    fetchJson(API_BASE + '/busqueda_estacion_filtro')
  ]);

  const marcaPorId = {};
  (marcasResp.data || []).forEach(m => { marcaPorId[m.id] = m.nombre; });

  const estaciones = estacionesResp.data || [];
  console.log('Estaciones recibidas:', estaciones.length);

  // ---------- 1) snapshot completo (estacion x combustible) ----------
  const filas = [];
  estaciones.forEach(e => {
    const marcaNombre = marcaPorId[e.marca] || ('id_' + e.marca);
    (e.combustibles || []).forEach(c => {
      filas.push({
        fecha,
        estacion_id: e.id,
        marca: marcaNombre,
        region: e.region,
        comuna: e.comuna,
        direccion: (e.direccion || '').trim(),
        latitud: e.latitud,
        longitud: e.longitud,
        combustible_corto: c.nombre_corto,
        combustible_largo: c.nombre_largo,
        precio: c.precio,
        unidad_cobro: c.unidad_cobro,
        tipo_atencion: c.tipo_atencion_nombre,
        precio_fecha_origen: c.precio_fecha
      });
    });
  });

  const snapHeaders = ['fecha', 'estacion_id', 'marca', 'region', 'comuna', 'direccion', 'latitud', 'longitud', 'combustible_corto', 'combustible_largo', 'precio', 'unidad_cobro', 'tipo_atencion', 'precio_fecha_origen'];
  const snapPath = path.join(DATA_DIR, 'snapshots', fecha + '.csv');
  fs.writeFileSync(snapPath, toCsv(filas, snapHeaders));
  console.log('Escrito', snapPath, '(' + filas.length + ' filas)');

  // ---------- normaliza nombre de combustible para que 93/A93, 95/A95, etc. queden juntos ----------
  function grupoCombustible(corto) {
    const c = (corto || '').toUpperCase().replace(/^A/, '');
    if (c === '93') return 'Gasolina 93';
    if (c === '95') return 'Gasolina 95';
    if (c === '97') return 'Gasolina 97';
    if (corto === 'DI' || corto === 'ADI') return 'Diésel';
    if (corto === 'KE' || corto === 'AKE') return 'Kerosene';
    if (c === 'GLP') return 'GLP';
    if (c === 'GNC') return 'GNC';
    return corto || 'Otro';
  }

  // Rangos de cordura por combustible ($/L o $/m3 segun corresponda). Un registro fuera de
  // rango se excluye SOLO de los agregados (el snapshot crudo lo conserva tal cual viene
  // de la fuente, para que quede trazable). Mismo tipo de outliers que ya habiamos visto
  // antes en la base historica de la CNE (ceros, decimales corridos, etc).
  const RANGO_VALIDO = {
    'Gasolina 93': [500, 2500], 'Gasolina 95': [500, 2500], 'Gasolina 97': [500, 2500],
    'Diésel': [400, 2500], 'Kerosene': [300, 2000], 'GLP': [200, 1500], 'GNC': [150, 1500]
  };
  function precioValido(grupo, precio) {
    const rango = RANGO_VALIDO[grupo];
    if (!rango) return true;
    return precio >= rango[0] && precio <= rango[1];
  }

  function appendCsv(filePath, rows, headers) {
    const isNew = !fs.existsSync(filePath);
    const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(',')).join('\n') + '\n';
    if (isNew) fs.writeFileSync(filePath, headers.join(',') + '\n' + body);
    else fs.appendFileSync(filePath, body);
  }

  // Agrega `filas` por la combinacion de claves que entregue keyFn(f), separado ademas por
  // combustible. keyFn debe devolver un objeto plano, ej. {region: f.region}.
  function aggregateBy(keyFn) {
    const acc = {};
    let excluidos = 0;
    filas.forEach(f => {
      const precio = parseFloat(f.precio);
      if (!Number.isFinite(precio)) return;
      const grupo = grupoCombustible(f.combustible_corto);
      if (!precioValido(grupo, precio)) { excluidos++; return; }
      const keyObj = keyFn(f);
      const key = JSON.stringify(keyObj) + '|' + grupo;
      if (!acc[key]) acc[key] = { ...keyObj, combustible: grupo, sum: 0, n: 0, min: precio, max: precio };
      const a = acc[key];
      a.sum += precio; a.n++; if (precio < a.min) a.min = precio; if (precio > a.max) a.max = precio;
    });
    const rows = Object.values(acc).map(a => ({
      fecha, ...a, precio_promedio: Math.round((a.sum / a.n) * 100) / 100, precio_min: a.min, precio_max: a.max, n_registros: a.n
    }));
    return { rows, excluidos };
  }

  const { rows: nacional, excluidos: exclNac } = aggregateBy(() => ({}));
  appendCsv(path.join(DATA_DIR, 'aggregates', 'nacional_diario.csv'), nacional, ['fecha', 'combustible', 'precio_promedio', 'precio_min', 'precio_max', 'n_registros']);
  console.log('Agregado nacional:', nacional.length, 'filas (una por combustible) |', exclNac, 'registros excluidos por precio fuera de rango');

  const { rows: regional } = aggregateBy(f => ({ region: f.region }));
  appendCsv(path.join(DATA_DIR, 'aggregates', 'regional_diario.csv'), regional, ['fecha', 'region', 'combustible', 'precio_promedio', 'precio_min', 'precio_max', 'n_registros']);
  console.log('Agregado regional:', regional.length, 'filas');

  const { rows: comunal } = aggregateBy(f => ({ region: f.region, comuna: f.comuna }));
  appendCsv(path.join(DATA_DIR, 'aggregates', 'comunal_diario.csv'), comunal, ['fecha', 'region', 'comuna', 'combustible', 'precio_promedio', 'precio_min', 'precio_max', 'n_registros']);
  console.log('Agregado comunal:', comunal.length, 'filas');

  const { rows: porMarca } = aggregateBy(f => ({ marca: f.marca }));
  appendCsv(path.join(DATA_DIR, 'aggregates', 'operador_diario.csv'), porMarca, ['fecha', 'marca', 'combustible', 'precio_promedio', 'precio_min', 'precio_max', 'n_registros']);
  console.log('Agregado por operador:', porMarca.length, 'filas');

  console.log('\nListo.');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
