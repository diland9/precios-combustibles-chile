// Inyecta el sistema visual de dilandcastro.com (CSS, tipografias, cabecera y pie) en las plantillas HTML.
const fs = require('fs');
const path = require('path');
const BRAND = path.join(__dirname, '..', 'brand');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600;700&display=swap"><link rel="icon" href="https://dilandcastro.com/assets/icon-192.png">';
function aplicarMarca(html, pagina) {
  const css = fs.readFileSync(path.join(BRAND, 'brand.css'), 'utf8');
  let header = fs.readFileSync(path.join(BRAND, 'header.html'), 'utf8');
  ['index', 'territorial', 'buscador'].forEach(p => { header = header.replace('__ON_' + p + '__', p === pagina ? 'class="on" aria-current="page"' : ''); });
  return html.replace('/*__BRAND_CSS__*/', () => css).replace('<!--__FONTS__-->', () => FONTS)
    .replace('<!--__HEADER__-->', () => header).replace('<!--__FOOTER__-->', () => fs.readFileSync(path.join(BRAND, 'footer.html'), 'utf8'));
}

// Version "ligera" para el buscador de estaciones (una app oscura con su propio CSS): cambia tipografias y
// paleta a las de la marca, reutiliza la rampa de precios (azul petroleo -> ambar -> naranja) y agrega la cabecera.
const HEADER_CSS = `header.site{position:sticky;top:0;z-index:60;margin:-18px -16px 18px;background:rgba(2,8,18,.82);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,.08)}
header.site .in{display:flex;align-items:center;gap:18px;height:56px;max-width:1240px;margin:0 auto;padding:0 clamp(16px,3vw,32px)}
header.site .brand{display:flex;align-items:center;gap:8px;font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:600;font-size:1.25rem;color:#fff;letter-spacing:-.03em;white-space:nowrap;text-decoration:none}
header.site .brand .bolt{width:15px;height:15px;color:#fcc400}header.site .brand img{width:26px;height:26px;border-radius:50%}header.site .brand b{color:#fcc400;font-weight:600}
header.site .where{font:600 .7rem Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9aa7ba;padding-left:14px;border-left:1px solid rgba(255,255,255,.15);white-space:nowrap;text-decoration:none}header.site .where:hover{color:#fcc400}
header.site nav.main{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap}
header.site nav.main a{color:#c9d3e2;font:500 .8rem Inter,system-ui,sans-serif;padding:7px 12px;border-radius:8px;white-space:nowrap;text-decoration:none}
header.site nav.main a:hover{color:#fff;background:rgba(255,255,255,.08)}
header.site nav.main a.on{color:#1a1400;background:#fcc400;font-weight:600}
header.site nav.main a.ext{color:#fcc400}
@media(max-width:860px){header.site .where{display:none}header.site .in{height:auto;padding-block:8px;flex-wrap:wrap;gap:6px 14px}header.site nav.main{margin-left:0;flex:1 0 100%}}`;
// Buscador: mapa de altura acotada (ampliable) y sin botones de exportar graficos (los datos no se ofrecen para descarga)
const EXTRA_CSS = `.map-wrap{display:block;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
.map-wrap svg{width:100%;height:min(62vh,580px);transition:height .3s;cursor:grab;touch-action:none}
.map-wrap svg.drag{cursor:grabbing}
.map-wrap.big svg{height:min(90vh,980px)}
.legend-top{margin:0 0 14px;padding:.7rem .9rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:12.5px;color:#dbe4f0;gap:8px 22px}
.legend-top b{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-size:13px;color:#fff;letter-spacing:.02em}
.legend-top .grad-bar{width:160px;height:10px}
.mapbar{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin-bottom:10px}
.mapbar-t{font:700 .72rem Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9aa7ba}
.mapctl{display:flex;gap:8px;flex-wrap:wrap}
.mbtn{background:#1a2638;color:#e8eef7;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:.65rem 1rem;font:600 .8rem Inter,system-ui,sans-serif;cursor:pointer;min-height:42px;transition:background .2s,border-color .2s,transform .2s}
.mbtn:hover{background:#25344b;border-color:#fcc400;color:#fff;transform:translateY(-1px)}
.mbtn.amber{background:#fcc400;color:#1a1400;border-color:#fcc400}.mbtn.amber:hover{background:#ffd60a}
#histExportSvg,#histExportPng,#cmpExportSvg,#cmpExportPng{display:none!important}
.chart-wrap svg{height:auto;max-height:none}`;
function aplicarMarcaLigera(html, pagina) {
  let header = fs.readFileSync(path.join(BRAND, 'header.html'), 'utf8');
  ['index', 'territorial', 'buscador'].forEach(p => { header = header.replace('__ON_' + p + '__', p === pagina ? 'class="on" aria-current="page"' : ''); });
  let s = html;
  // tipografias y enlace de Google Fonts
  s = s.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, () => FONTS);
  s = s.split('"Archivo"').join('"Bricolage Grotesque"').split('"Public Sans"').join('"Inter"');
  // paleta (fondos navy/negro de la marca, acento ambar)
  const mapa = { '#0A0F1A': '#020812', '#111826': '#0a1a30', '#161F30': '#0e2240', '#0D1420': '#071326', '#06090F': '#010409', '#EAF2F2': '#eef1f5', '#8CA0AC': '#9aa7ba', '#4FE3D2': '#fcc400',
    'rgba(79,227,210,0.16)': 'rgba(252,196,0,0.16)', 'rgba(94,234,212,0.14)': 'rgba(252,196,0,0.2)' };
  Object.entries(mapa).forEach(([a, b]) => { s = s.split(a).join(b); });
  // rampa de precios de tres tonos (la misma del mapa territorial)
  s = s.replace('var c1 = [0xFC,0xC4,0x00], c2 = [0xFF,0x8A,0x4C];\n    var rgb = c1.map(function(v,i){ return Math.round(v + (c2[i]-v)*t); });',
    'var S = [[0x1F,0x7A,0x8C],[0xFC,0xC4,0x00],[0xE4,0x57,0x2E]]; var u = t*2, k = Math.min(1, Math.floor(u)), f = u-k, a = S[k], b = S[Math.min(2,k+1)];\n    var rgb = a.map(function(v,i){ return Math.round(v + (b[i]-v)*f); });');
  s = s.replace('linear-gradient(90deg, var(--teal), var(--orange))', 'linear-gradient(90deg,#1f7a8c,#fcc400,#e4572e)');
  // cabecera de la marca
  s = s.replace('</style>', () => HEADER_CSS + '\n' + EXTRA_CSS + '\n</style>');
  s = s.replace('<div class="wrap">', () => header + '\n<div class="wrap">');
  // (la barra con zoom y el boton de ampliar ahora viven en site_template.html)
  return s;
}
module.exports = { aplicarMarca, aplicarMarcaLigera, FONTS };
