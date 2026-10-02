// Convierte la planilla oficial de la CNE (Precio Mensual Regional de Combustibles
// Liquidos) en CSVs limpios, uno por combustible, en formato largo (fecha, region, precio).
// Este es un respaldo HISTORICO REGIONAL MENSUAL (1994-2026), de granularidad muy distinta
// a los snapshots diarios por estacion que junta fetch_snapshot.js -- no se pueden mezclar
// directamente, pero sirve de contexto de largo plazo.
//
// Uso: node scripts/build_historico_oficial.js <ruta_al_xlsx_de_la_cne>
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const srcPath = process.argv[2];
if (!srcPath) { console.error('Uso: node build_historico_oficial.js <ruta al xlsx de la CNE>'); process.exit(1); }

const REGION_LABEL = {
  13: 'Metropolitana', 15: 'Arica y Parinacota', 1: 'Tarapacá', 2: 'Antofagasta', 3: 'Atacama',
  4: 'Coquimbo', 5: 'Valparaíso', 6: "O'Higgins", 7: 'Maule', 16: 'Ñuble', 8: 'Biobío',
  9: 'Araucanía', 14: 'Los Ríos', 10: 'Los Lagos', 11: 'Aysén', 12: 'Magallanes'
};

const SHEETS = {
  'Gasolina 93 sp': 'gasolina_93',
  'Gasolina 95 sp': 'gasolina_95',
  'Gasolina 97 sp': 'gasolina_97',
  'Petróleo Diesel': 'diesel',
  'Kerosene Doméstico': 'kerosene'
};

function excelDate(serial) { return new Date(Math.round((serial - 25569) * 86400 * 1000)); }

const wb = XLSX.readFile(srcPath);
const outDir = path.join(__dirname, '..', 'data', 'historico_oficial_regional');
fs.mkdirSync(outDir, { recursive: true });

Object.entries(SHEETS).forEach(([sheetName, outName]) => {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log('AVISO: no se encontro la hoja', sheetName); return; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const codeRow = data[5]; // [null,null,13,15,1,2,3,4,5,6,7,16,8,9,14,10,11,12,...]
  const regionCodes = codeRow.slice(2, 18);
  const rows = data.filter(r => typeof r[1] === 'number' && r[1] > 20000);

  const lines = ['fecha,region,precio_clp_litro'];
  rows.forEach(r => {
    const fecha = excelDate(r[1]).toISOString().slice(0, 7);
    regionCodes.forEach((code, i) => {
      const v = r[2 + i];
      if (typeof v === 'number') lines.push(`${fecha},${REGION_LABEL[code]},${Math.round(v * 100) / 100}`);
    });
  });

  const outPath = path.join(outDir, outName + '.csv');
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log('Escrito', outPath, '(' + (lines.length - 1) + ' filas)');
});
