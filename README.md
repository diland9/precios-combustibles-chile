# Precios de combustibles en Chile — monitor diario

Captura automática, diaria, del precio de los combustibles en todas las estaciones de
servicio de Chile, para poder ver su evolución por **estación, operador, comuna y región**.
Corre sola todos los días vía GitHub Actions — no requiere servidor ni mantención.

**Páginas** (se regeneran solas en cada corrida, dentro de `docs/`; publicar en Settings → Pages → Branch `main` → carpeta `/docs`):

| Archivo | Qué es |
|---|---|
| `docs/index.html` | **Resumen**: precio nacional de hoy por combustible, evolución desde 1994, detalle por región y operador, estaciones más baratas y más caras, y un cuadro de qué datos hay y hasta cuándo |
| `docs/territorial.html` | **Territorial**: mapa por región y comuna con fichas emergentes (precio promedio de cada combustible elegido), selector de combustibles y barra de tiempo desde 1994 hasta hoy |
| `docs/buscador.html` | **Buscador de estaciones**: mapa de estaciones puntuales, filtros y precio de hoy |

## ¿De dónde salen los datos?

De la API pública que usa el propio sitio oficial [bencinaenlinea.cl](https://www.bencinaenlinea.cl)
(Comisión Nacional de Energía / Superintendencia de Electricidad y Combustibles). No requiere
login ni token — es la misma data que ves si entras al sitio y buscas una estación. Tiene un
límite de uso de ~500 solicitudes/hora por IP, que este proyecto no acerca a usar ni de lejos
(hace 2 llamadas, una vez al día).

**Importante — qué NO se puede hacer**: esta API solo entrega el precio *de ahora mismo*, no
tiene forma de pedir una fecha pasada. Por eso el historial por estación recién empieza el día
que se corrió este proyecto por primera vez — **no se puede reconstruir el pasado a nivel de
estación**, porque esa información histórica granular simplemente no existe en ninguna fuente
pública. Lo que sí se pudo reconstruir completo es la serie **regional mensual oficial de la
CNE desde 1994** (ver más abajo) — pero esa es una granularidad distinta (promedio por región,
no por estación).

## Estructura de datos

```
data/
  snapshots/
    2026-10-01.csv          # una fila por estación × combustible, TODOS los días desde que arrancó
  aggregates/                # recalculados y ampliados cada día, livianos, fáciles de graficar
    nacional_diario.csv      # fecha, combustible, precio promedio/min/max, n° de registros
    regional_diario.csv      # + región
    comunal_diario.csv       # + comuna
    operador_diario.csv      # + marca/operador (Copec, Shell, Aramco, Otros...)
  historico_oficial_regional/  # respaldo histórico, 1994-2026, mensual, por región (fuente CNE)
    gasolina_93.csv
    gasolina_95.csv
    gasolina_97.csv
    diesel.csv
    kerosene.csv
```

Los combustibles vehiculares se agrupan en: `Gasolina 93`, `Gasolina 95`, `Gasolina 97`,
`Diésel`, `Kerosene`, `GLP` (vehicular) y `GNC`. Las variantes "asistido"/"autoservicio" de
cada uno (ej. `93` y `A93`) se juntan en el mismo grupo.

### Filtro de precios

Antes de calcular los promedios se descartan registros claramente erróneos de la fuente
(ceros, decimales corridos, etc. — el mismo tipo de ruido que ya habíamos visto en la base
histórica de la CNE). El snapshot crudo (`data/snapshots/`) **no se toca**, el filtro solo
aplica a los agregados. Rangos usados (CLP):

| Combustible | Rango válido |
|---|---|
| Gasolina 93/95/97 | 500 – 2.500 |
| Diésel | 400 – 2.500 |
| Kerosene | 300 – 2.000 |
| GLP | 200 – 1.500 |
| GNC | 150 – 1.500 |

## Cómo correrlo tú mismo / en local

```bash
node scripts/fetch_snapshot.js
```

No tiene dependencias externas (usa `fetch` nativo de Node ≥ 18). Escribe/actualiza los
archivos en `data/`.

Para regenerar el histórico oficial regional (solo hace falta si la CNE publica una planilla
nueva y quieres actualizar `data/historico_oficial_regional/`):

```bash
npm install xlsx   # solo para este script puntual
node scripts/build_historico_oficial.js ruta/a/la/planilla_de_la_cne.xlsx
```

La planilla se descarga manualmente desde
[cne.cl/estadisticas/hidrocarburo](https://www.cne.cl/estadisticas/hidrocarburo/) →
"Precio Mensual Regional de Combustibles Líquidos".

## Automatización

`.github/workflows/snapshot.yml` corre **dos veces al día** (13:00 y 21:00 UTC): la primera es la captura
normal y la segunda es un respaldo por si la primera falló. Descarga el precio del día, actualiza `data/`,
regenera las tres páginas de `docs/` y hace commit + push. También se puede disparar a mano desde la pestaña
"Actions" ("Run workflow").

Fiabilidad:

- Cada llamada a la API se **reintenta hasta 6 veces** con espera creciente (5 s, 10 s, 20 s, 40 s, 80 s, 120 s). Un corte momentáneo ya no pierde el día.
- Correr el job más de una vez el mismo día es seguro: los agregados del día se **reemplazan**, no se duplican.
- Si aun así falla un día, ese día queda sin dato (no se puede reconstruir: la API solo entrega el precio de hoy). Las páginas lo muestran explícitamente como "sin captura".
- `node scripts/dedupe_aggregates.js` limpia duplicados históricos si alguna vez aparecen.

## Cobertura de datos

| Serie | Desde | Hasta | Notas |
|---|---|---|---|
| Promedio mensual por región (CNE) | ene 1994 | sep 2026 | 93/95/97, diésel y kerosene (95 y 97 desde dic 1994). Sin meses faltantes |
| Precio diario por estación (este monitor) | 1 oct 2026 | hoy | Los 7 combustibles, incluidos GLP y GNC |
| Promedio por comuna | 1 oct 2026 | hoy | Solo comunas con estaciones con precio |
| Antes del 1 oct 2026 | — | — | No existe precio por estación, comuna o día: la fuente solo entrega el precio de hoy |

Diseño: las tres páginas siguen el sistema visual de [dilandcastro.com](https://dilandcastro.com) (colores, tipografías y cabecera en `scripts/brand/`).

La portada y el mapa territorial empalman ambos tramos en una sola línea de tiempo. El promedio mensual histórico es el de las regiones y el diario es el de las estaciones, por lo que el empalme es aproximado.

Regenerar la geometría de comunas (solo si cambia el mapa de origen): `node scripts/build_comunas_geometry.js ruta/a/comunas.geojson`.

## Fuentes oficiales (para verificar manualmente)

- Precio en vivo por estación: <https://www.bencinaenlinea.cl>
- API pública usada por este proyecto: `https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro`
- Serie histórica regional mensual (CNE): <https://www.cne.cl/estadisticas/hidrocarburo/>

## Licencia

Código: MIT. Los datos son de origen público (CNE/SEC) — úsalos libremente, pero cita la
fuente original si los republicas.

## Herramientas Diland y cómo citar

Esta herramienta es parte de las **Herramientas Diland** de [dilandcastro.com](https://www.dilandcastro.com): desde el apartado "Herramientas" del sitio se llega a la portada (`docs/index.html`), que enlaza al Resumen, al mapa Territorial y al buscador de Estaciones.

Las páginas no ofrecen la data para descargarla. Cita sugerida:

> Castro, D. (2026). *Evolución del precio de los combustibles en Chile*. Elaboración propia a partir de datos de la CNE y la SEC. www.dilandcastro.com

El gráfico histórico marca la **Modificación MEPCO** del 22 de marzo de 2026 (la línea punteada). Los logos de los operadores son los publicados por la CNE (`scripts/lib/logos_marcas.json`), y las marcas duplicadas del catálogo oficial (por ejemplo "Sin Bandera" y "SIN BANDERA") se agrupan como una sola.
