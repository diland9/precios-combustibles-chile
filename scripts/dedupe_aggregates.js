// Limpieza unica: elimina filas duplicadas en data/aggregates/*.csv (se produjeron cuando el job corrio
// mas de una vez el mismo dia). Conserva la ULTIMA fila de cada clave (fecha + dimension + combustible).
// Uso: node scripts/dedupe_aggregates.js
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'data', 'aggregates');
const CLAVES = {
  'nacional_diario.csv': ['fecha', 'combustible'],
  'regional_diario.csv': ['fecha', 'region', 'combustible'],
  'comunal_diario.csv': ['fecha', 'region', 'comuna', 'combustible'],
  'operador_diario.csv': ['fecha', 'marca', 'combustible']
};

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

for (const [file, claves] of Object.entries(CLAVES)) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.length);
  const header = parseLine(lines[0]);
  const idx = claves.map(c => header.indexOf(c));
  const ultima = new Map();
  lines.slice(1).forEach((l, i) => { const f = parseLine(l); ultima.set(idx.map(k => f[k]).join('|'), { i, l }); });
  const orden = [...ultima.values()].sort((a, b) => a.i - b.i).map(x => x.l);
  const quitadas = lines.length - 1 - orden.length;
  fs.writeFileSync(p, lines[0] + '\n' + orden.join('\n') + '\n');
  console.log(file.padEnd(22), 'filas', lines.length - 1, '->', orden.length, '| duplicadas eliminadas:', quitadas);
}
