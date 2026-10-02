# Precios de combustibles en Chile — monitor diario

Captura automática, diaria, del precio de los combustibles en todas las estaciones de
servicio de Chile, para poder ver su evolución por **estación, operador, comuna y región**.
Corre sola todos los días vía GitHub Actions — no requiere servidor ni mantención.

**Buscador en vivo**: `docs/index.html` es un buscador + mapa de Chile (estilo oscuro,
puntos con glow teal→naranjo según precio) que lee el snapshot del día. Se regenera solo
en cada corrida del workflow. Para publicarlo como página web: Settings → Pages → Branch
`main` → carpeta `/docs`.

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

`.github/workflows/snapshot.yml` corre todos los días a las 13:00 UTC (~9-10 AM hora Chile),
descarga el precio del día, actualiza `data/` y hace commit + push automáticamente. También se
puede disparar a mano desde la pestaña "Actions" del repo ("Run workflow").

## Fuentes oficiales (para verificar manualmente)

- Precio en vivo por estación: <https://www.bencinaenlinea.cl>
- API pública usada por este proyecto: `https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro`
- Serie histórica regional mensual (CNE): <https://www.cne.cl/estadisticas/hidrocarburo/>

## Licencia

Código: MIT. Los datos son de origen público (CNE/SEC) — úsalos libremente, pero cita la
fuente original si los republicas.
