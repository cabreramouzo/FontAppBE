# Despliegue de FontAppBE

La app son **tres piezas** que se despliegan por separado:

1. **Backend** (Vapor) — contenedor Docker (ver `Dockerfile`).
2. **PostgreSQL** — base de datos gestionada (Fly Postgres, Railway, Render, Neon, Supabase…).
3. **Web** (`web/`) — build estático (Cloudflare Pages, Netlify, Vercel…).

## Backend

Imagen lista para construir:

```bash
docker build -t fontappbe .
```

### Variables de entorno (producción)

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | sí* | Cadena de conexión Postgres (`postgres://user:pass@host:5432/db`). |
| `DATABASE_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_NAME` | sí* | Alternativa a `DATABASE_URL` (variables sueltas). |
| `WEB_ORIGIN` | recomendada | Origen(es) del web permitidos por CORS, separados por comas (p. ej. `https://fontapp.com`). Si no se define, CORS permite todo (solo dev). |
| `AUTO_MIGRATE` | opcional | `true` → migra la BD al arrancar. Útil en un solo contenedor. **Vive en `fly.toml` (`[env]`), no en los secrets.** Para migrar a mano: `fly ssh console -a fontapp -C "/app/App migrate --yes"`. |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | opcional | Si están **las cinco**, las imágenes se suben a Cloudflare R2; si no, a disco local. `R2_PUBLIC_URL` es la base pública del bucket (p. ej. `https://pub-xxxx.r2.dev`). |
| `RESEND_API_KEY` | opcional | API key de [Resend](https://resend.com). Junto con `MAIL_FROM` activa el envío real de correo (bienvenida, resumen semanal y reset de contraseña); si falta, en dev solo se loguea (`LogMailSender`). |
| `MAIL_FROM` | opcional | Remitente de los correos, p. ej. `FontApp <no-reply@send.fontapp.net>`. Obligatoria junto con `RESEND_API_KEY`. |
| `MAIL_REPLY_TO` | opcional | Dirección de respuesta (p. ej. `admin@fontapp.net`), para enviar desde un no-reply pero recibir las respuestas en un buzón real. |
| `APP_SECRET` | recomendada | Clave con la que se firman los enlaces de baja del resumen semanal. Si falta, se usa una aleatoria por proceso y **los enlaces dejan de valer en cada reinicio** (la app lo avisa en el log al arrancar en producción). Genérala con `openssl rand -hex 32`. |
| `GEOIP_ENABLED` | opcional | `true` → deduce país/región de la IP al registrarse (solo estadística; nunca se guarda la IP). Noop si no se define. |
| `GOOGLE_CLIENT_ID` | para login Google | ID del cliente OAuth 2.0 de tipo **Aplicación web**. Es público, pero se configura por entorno y debe coincidir con `VITE_GOOGLE_CLIENT_ID`. No se usa client secret. |
| `PASSKEY_RP_ID` | opcional | Dominio al que quedan ligadas las passkeys. En producción usa `fontapp.net` por defecto; no incluye protocolo ni puerto. Cambiarlo invalida las passkeys existentes. |
| `PASSKEY_ORIGIN` | opcional | Origen web exacto permitido al verificar WebAuthn. Por defecto `https://fontapp.net` en producción y `http://localhost:5173` en desarrollo. |

\* Usa **o** `DATABASE_URL` **o** las variables sueltas. En `--env production` las credenciales son obligatorias (la app falla al arrancar si faltan).

El contenedor arranca con `serve --env production` (ver `CMD` del `Dockerfile`).

### Passkeys

No requieren cuentas ni secretos de terceros. La web crea la credencial mediante WebAuthn
y el backend guarda únicamente su clave pública. En producción los valores por defecto son
`PASSKEY_RP_ID=fontapp.net` y `PASSKEY_ORIGIN=https://fontapp.net`; pueden fijarse
explícitamente en Fly. El origen es una comprobación exacta: si la interfaz pasa a servirse
desde `www.fontapp.net`, habrá que decidir un único origen canónico antes de cambiarlo.

### Acceso con Google

1. En Google Cloud Console crea un cliente OAuth 2.0 de tipo **Aplicación web**.
2. Añade como orígenes JavaScript autorizados `https://fontapp.net` y
   `https://www.fontapp.net` (para desarrollo, también `http://localhost:5173`). No hace
   falta URI de redirección: Google Identity Services devuelve un ID token al navegador.
3. Backend/Fly: `fly secrets set GOOGLE_CLIENT_ID="…apps.googleusercontent.com" -a fontapp`.
4. Cloudflare Pages, tanto en Preview como Production: define
   `VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com` y vuelve a desplegar el frontend.

El ID del cliente no es un secreto. El backend verifica firma, emisor, caducidad, audiencia
y correo verificado antes de crear una sesión. La migración `CreateAuthIdentity` guarda el
`sub` estable de Google; con `AUTO_MIGRATE=true` se aplica al desplegar el backend.

### Migraciones

- Opción A: `AUTO_MIGRATE=true` (migra en el primer boot).
- Opción B (recomendada en equipo): un release step que ejecute
  `./App migrate --yes --env production` antes de arrancar el servidor.

### Datos iniciales (opcional)

`./App seed --env production` inserta las 67 fuentes reales del Moianès (OSM, ODbL).
**No** ejecutes `seed --demo` en producción (crea usuarios y reseñas de ejemplo).

### Fuentes oficiales de la ACA (las de CercaFonts)

La app CercaFonts (ICGC + ACA) ya no está, pero **su capa de datos sigue publicada** en el
WFS abierto de la ACA: `AIGUA:AIGUA_FONTS`, ~10.000 fuentes de toda Catalunya con topónimo,
tipo, municipio y comarca. **La ACA dio su visto bueno al uso** (agosto de 2026); se atribuye
con `© ICGC/ACA` en la descripción de cada fuente.

Descarga:

```bash
curl "https://sig.gencat.cat/ows/AIGUA/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=AIGUA:AIGUA_FONTS&outputFormat=application/json&srsName=EPSG:4326" -o fonts-aca-catalunya.json
```

Los tres pasos de preparación (filtrar, elegir el umbral, rescatar vecinas) están en
`scripts/fonts-import-tools.py`, sin dependencias. Necesita las fuentes actuales en CSV:

```bash
psql "$DATABASE_URL" -tAc "COPY (SELECT latitude, longitude, name FROM fonts) TO STDOUT WITH CSV" > /tmp/fonts.csv

python3 scripts/fonts-import-tools.py filtra  fonts-aca-catalunya.json fonts-aca-filtrado.json
python3 scripts/fonts-import-tools.py llindar fonts-aca-filtrado.json /tmp/fonts.csv     # ANTES de importar
python3 scripts/fonts-import-tools.py rescata fonts-aca-filtrado.json /tmp/fonts.csv \
    --min 25 --max 50 --limit 50 --enlaces --salida fonts-aca-extra50.json
```

**Filtrado previo.** Todo viene etiquetado como `TIPUS = Font`, pero por el nombre se cuelan
cosas que no son fuentes de beber. Se descartan por prefijo del nombre (227 de 10.057):
`BASSA`, `ESTANY(OL)`, `POU`, `MINA`, `GORG`, `CAPTACIÓ`, `SURGÈNCIA`, `PRESA`, `TORRENT`.
**No** filtrar por `TIPUSUS`: ese campo describe el aprovechamiento del agua, no lo que hay
allí — «Font Vella» figura como *Industrial* por la embotelladora y es una fuente de verdad.

```bash
swift run App import-geojson fonts-aca-filtrado.json --name-field NOM --dedupe 50 --titlecase --dry-run
swift run App import-geojson fonts-aca-filtrado.json --name-field NOM --dedupe 50 --titlecase
```

- Cada fuente viene como **MultiPoint** de un punto (el importador acepta ambas geometrías).
- `--titlecase` porque los nombres vienen EN MAYÚSCULAS.
- `--dedupe 50` evita duplicar y **mejora los nombres genéricos** de OSM («Font») con el
  topónimo oficial.

Resultado de la primera pasada: **6.602 nuevas · 111 renombradas · 3.117 saltadas**.

#### Por qué el dedupe es 50 m y no 25

Medido, no intuido. Distancia de cada punto de la ACA a la fuente más cercana ya existente:
pico fortísimo por debajo de 20 m que cae en picado, y a partir de ahí una cola larga. La
distancia sola no distingue «duplicado» de «fuente vecina», así que se cruzó por **nombre**:

| Distancia | Puntos | El nombre coincide |
|---|---|---|
| 0–10 m | 1.126 | 91 % |
| 10–25 m | 295 | 73 % |
| **25–50 m** | **191** | **59 %** (+40 con vecina genérica ⇒ ~80 % duplicados) |
| 50–100 m | 200 | 28 % |

En la banda 25–50 m cuatro de cada cinco son la misma fuente con las coordenadas puestas por
dos manos distintas. A 50–100 m la coincidencia se desploma: ahí empiezan las fuentes
realmente distintas. **Si alguien vuelve a plantear bajarlo a 25, este es el motivo de no
hacerlo**: se colarían ~190 duplicados para ganar ~40 fuentes.

#### Rescatar las vecinas que sí eran distintas

De esas 272 descartadas se recuperaron **80** revisándolas: se ordenan por *disimilitud* de
nombre con la vecina (descartando las que comparten alguna palabra larga, las de nombre-código
y las que la ACA marca como asociadas a bassa/mina/pou), y se revisan de arriba abajo. Las de
nombre completamente distinto son dos fuentes reales en la misma plaza — verificado sobre el
terreno con la Font del Lleó de Caldes de Montbui. Se importan **sin** dedupe grande, con
`--dedupe 20`, que solo sirve para quitar los puntos repetidos dentro del propio fichero:

```bash
swift run App import-geojson fonts-aca-extra10.json        --name-field NOM --titlecase --dedupe 20
swift run App import-geojson fonts-aca-extra50.json        --name-field NOM --titlecase --dedupe 20
swift run App import-geojson fonts-aca-cola-distintas.json --name-field NOM --titlecase --dedupe 20
```

Los ficheros no se versionan (`.gitignore`): se regeneran del GeoJSON de la ACA.

#### Llevarlo a producción

**No se copian filas entre bases de datos.** Se repiten las mismas importaciones apuntando a
Neon, así el dedupe se calcula contra lo que hay de verdad en producción (incluidas las
fuentes que hayan añadido los usuarios). El comando es un CLI: no hace falta entrar en Fly.

```bash
export NEON_URL=$(cat ~/.config/fontapp/neon_url)
/opt/homebrew/opt/postgresql@18/bin/pg_dump "$NEON_URL" -Fc -f ~/fontapp-antes-aca-$(date +%Y%m%d).dump

DATABASE_URL="$NEON_URL" swift run App import-geojson fonts-aca-filtrado.json --name-field NOM --dedupe 50 --titlecase --dry-run
# …y después las cuatro importaciones, la grande PRIMERO (las tres pequeñas
# asumen que ya ha pasado), y al final:
DATABASE_URL="$NEON_URL" swift run App populate-regions fronteres.geojson
```

Los recuentos en producción **no coinciden** con los de local: hay fuentes de usuarios que en
la copia local no están. Si el ensayo diera 9.800 nuevas (ninguna saltada), es que apuntas a
una base equivocada.

Para cargar cualquier otro GeoJSON de puntos, usa `import-geojson`
con dedupe por distancia (fusiona topónimos y evita duplicados de lo ya sembrado):

```bash
# En local, contra la BD de PROD (no uses env.development, que apunta a la BD local):
DATABASE_URL='postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' \
  swift run App import-geojson fonts_icgc.geojson --name-field Toponim --dedupe 50
```

Verifica el recuento con el cliente psql **v18** (Neon corre Postgres 18):
`SELECT count(*) FROM fonts WHERE description = '© ICGC/ACA';`

#### Importar un país nuevo desde OpenStreetMap (p. ej. Portugal)

Las fuentes de OSM (`amenity=drinking_water`, `natural=spring`, etc.) se importan con
`import-fonts` (JSON de Overpass, ODbL). Para un país **nuevo** (que no solape con lo ya
cargado) no hace falta dedupe; junto a España conviene `--dedupe` para no duplicar en la frontera.

1. Descarga los puntos de agua del país desde [Overpass Turbo](https://overpass-turbo.eu)
   (o la API). Query para **Portugal**:
   ```overpassql
   [out:json][timeout:120];
   area["ISO3166-1"="PT"][admin_level=2]->.pt;
   (
     node["amenity"="drinking_water"](area.pt);
     node["natural"="spring"]["drinking_water"](area.pt);
     node["man_made"="water_tap"](area.pt);
   );
   out body;
   ```
   Exporta el resultado como `portugal-osm.json` (Export → data → raw OSM data / JSON).

   Los puntos sin `name` en OSM —**tres de cada cuatro**— se guardan con `name = NULL`.
   No les pongas una palabra genérica del territorio: la app muestra «fuente sin nombre»
   en el idioma de quien lee. Un topónimo real se conserva tal cual y nunca se traduce.

   Ejemplo real, el Pirineo francés (bbox intersectado con el área de Francia para no
   colarse en España):
   ```overpassql
   [out:json][timeout:540];
   area["ISO3166-1"="FR"][admin_level=2]->.fr;
   (
     node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.fr)(42.25,-1.95,45.05,4.90);
     node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.fr)(42.25,-1.95,45.05,4.90);
     // Manantiales: solo los que **dicen algo de sí mismos**. Ver la nota de abajo.
     node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.fr)(42.25,-1.95,45.05,4.90);
     node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.fr)(42.25,-1.95,45.05,4.90);
     node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.fr)(42.25,-1.95,45.05,4.90);
   );
   out body;
   ```

   **Un `natural=spring` sin ningún otro tag no es una fuente.** Se comprobó mirando por
   satélite diez al azar de ese grupo: son charcos o el nacimiento de un riachuelo, no
   sitios a los que ir a beber. En la caja de Occitània eran **2.318 de 5.357** manantiales.
   Los que sí valen se reconocen porque llevan **nombre**, una **captación** (`man_made`,
   incluido `spring_box`) o algo dicho sobre **potabilidad** — de los diez de la primera
   muestra, los buenos («La Fontaine du Pélerin», «Source de la Barben») todos lo cumplían.

   Y fuera siempre lo de `access=no|private`: son captaciones de abastecimiento urbano.
   Eran 108 más.
   ```bash
   swift run App import-fonts pirineu-frances-osm.json
   ```
   Medido antes de importar: 2.168 nodos y **cero** a menos de 100 m de una fuente ya
   existente (la más cercana, a 218 m), así que no hacía falta dedupe. `import-fonts` **no
   deduplica** — compruébalo siempre antes, porque lo único que tiene es `--replace`, que
   borra la base entera.

   Para limpiar importaciones antiguas, primero mide y luego ejecuta la pasada explícita:
   ```bash
   swift run App clear-placeholder-names --dry-run
   swift run App clear-placeholder-names
   ```
   Solo vacía coincidencias exactas conocidas y sin creador; no toca topónimos de personas.
2. Importa contra la BD de PROD (cliente/servidor via `DATABASE_URL`, **no** `env.development`):
   ```bash
   DATABASE_URL='postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' \
     swift run App import-fonts portugal-osm.json
   ```
   `import-fonts` no borra nada salvo que pases `--replace`; inserta en lotes de 500.
3. Comprueba el recuento tras importar (psql v18): `SELECT count(*) FROM fonts;`.

#### Suiza: importación preparada, todavía no ejecutada

Suiza usa el mismo flujo europeo, pero el recorte y la clasificación deben hacerse con
un fichero que contenga **solo Switzerland**. La tabla `Admin1` cubre los 26 nombres
exactos de Natural Earth (incluidos `Genève`, `Lucerne` y `Sankt Gallen`) y sus códigos
ISO 3166-2 `CH-*`.

```overpassql
[out:json][timeout:540];
area["ISO3166-1"="CH"][admin_level=2]->.ch;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.ch);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.ch);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.ch);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.ch);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.ch);
);
out body;
```

Antes de escribir en producción, conserva el JSON crudo y prepara los límites:

```bash
python3 scripts/fonts-import-tools.py filtra suiza-osm-crudo.json suiza-limpio.json
python3 scripts/fronteras-subset.py \
  ne_10m_admin_1_states_provinces.geojson fronteras-suiza.geojson Switzerland
```

Haz primero todo el ciclo en la base local. La medición con los 15.244 puntos filtrados
de agosto de 2026 deja 136 fuera del borde simplificado: 127 se recuperan a ≤1 km, 8 más
a ≤2 km y el último a ≤5 km. El corte suizo queda por tanto en **5 km**; no hace falta
copiar los 10 km de países con archipiélagos. En producción, importa sin `--replace`,
clasifica únicamente las nuevas fuentes que aún no tienen región y audita `admin1` antes
de aplicarlo. No uses `--all`.

```bash
DATABASE_URL='postgresql://...' swift run App import-fonts suiza-limpio.json
DATABASE_URL='postgresql://...' swift run App populate-regions fronteras-suiza.geojson
DATABASE_URL='postgresql://...' swift run App populate-regions fronteras-suiza.geojson --fallback-nearest 5
DATABASE_URL='postgresql://...' swift run App backfill-admin1
DATABASE_URL='postgresql://...' swift run App backfill-admin1 --apply
```

Verificación mínima antes y después del `--apply`:

```sql
SELECT country, region, admin1, count(*)
FROM fonts
WHERE country = 'Switzerland'
GROUP BY country, region, admin1
ORDER BY region;
```

El dry-run de `backfill-admin1` debe informar de **cero demarcaciones desconocidas** y la
consulta final debe mostrar exclusivamente códigos `CH-*`. Si no, no ejecutes `--apply`.

#### Chile, y por qué un país nuevo no se importa con la receta de Europa

Chile (agosto 2026) es el primer país fuera de Europa, y lo primero que enseñó es que
**los filtros del Pirineo no se trasladan**. Medido, no supuesto:

| paso | quedan |
|---|---|
| todo lo que trae Overpass (`drinking_water` + `water_tap` + `spring`) | 448 |
| menos los `natural=spring` pelados (65) y `access=private` (1) | 382 |
| menos lo que **no es una fuente de beber** | **319** |

Las tres cosas las hace `filtra --es` de una vez. Las dos primeras vivían solo dentro de
la query de Overpass del apartado de Portugal, así que quien reusara un fichero ya
descargado se las comía; ahora están en la herramienta, y por eso del crudo al importable
hay **un solo paso** — que es lo que permite volver a comprobar el 319.

De los 129 que caen, 66 son los de siempre (manantiales pelados y captaciones privadas). Los otros 63 son de dos familias, y las dos son de allí:

- **El sistema de abastecimiento tageado como `amenity=drinking_water`** (29): el APR
  —Agua Potable Rural—, la cooperativa, el comité, el estanque, la planta potabilizadora,
  la sanitaria (Esval, Aguas Andinas). De los 55 nodos con nombre u operador, **30 eran
  eso**. Importarlos habría puesto en el mapa fuentes inexistentes con el nombre de una
  oficina.
- **Termas** (34): Chile es volcánico y sus `natural=spring` **con nombre** son termas,
  pozones y géiseres, no sitios de beber. Siete lo dicen a mano con `drinking_water=no` y
  cinco son `leisure=swimming_pool`; uno era un hotel. La regla europea «un manantial con
  nombre suele ser una fuente» **es falsa aquí**.

Los dos ficheros están **en el repo**, así que el paso 1 no hay que repetirlo:
`chile-osm-crudo.json` (448 nodos, lo que devolvió Overpass el 20/08/2026) y
`chile-limpio.json` (los 319 que se importan). Se commitean los dos a propósito: con el
crudo al lado, cualquiera puede volver a pasar el filtro y comprobar que salen 319 — que
es lo único que convierte «se descartaron 63» en una afirmación verificable y no en una
cifra de un mensaje.

```bash
# 1. Descarga (query igual que la de Portugal, con area["ISO3166-1"="CL"]).
#    Ya hecha: chile-osm-crudo.json.
# 2. Filtra. `--es` añade las reglas de Hispanoamérica y las de termas.
python3 scripts/fonts-import-tools.py filtra --es chile-osm-crudo.json chile-limpio.json
#    Ojo: `--es` incluye la regla de termas, y va ahí y no por defecto **a propósito**.
#    Es una regla de nombres, o sea de idioma: activada siempre se llevaba «FONT DELS
#    BANYS (BAÑOS)» de la ACA, que es una fuente real, y le cambiaba el resultado a una
#    importación ya medida. Sin `--es`, Catalunya da exactamente lo mismo que antes
#    (9.830 de 10.057), y hay que comprobarlo al tocar este fichero.
# 3. Importa. Sin --dedupe: la caja de Chile (lat -53,9..-18,5) no toca nada de lo que hay.
DATABASE_URL='...' swift run App import-fonts chile-limpio.json
# 4. Zona, o Chile no sale en /zones ni en el ranking ni en el correo semanal.
DATABASE_URL='...' swift run App populate-regions fronteras-chile.geojson --fallback-nearest 10
```

`filtra` **ahora lee JSON de Overpass** además de GeoJSON: antes solo el segundo, así que
la vía de OSM —la que trae países enteros— no tenía forma de filtrarse y por eso nadie
había mirado nunca lo que entraba.

Los 273 puntos sin topónimo se guardan con `name = NULL`. La interfaz muestra «fuente sin
nombre» en el idioma elegido por quien lee.

`fronteras-chile.geojson` (478 KB, Natural Earth admin-1 recortado a `admin: Chile`, solo
las propiedades `admin` y `name`) trae las 16 regiones. Sin `--fallback-nearest 10`
quedaban **12 sin clasificar**, las de costa — el mismo efecto de borde que ya se midió en
Catalunya.

#### Poblar país/región de las fuentes (`populate-regions`)

`fonts.country` y `fonts.region` se rellenan **offline** por *point-in-polygon* contra un
GeoJSON de fronteras (sin llamadas a terceros). `region` = **primera división administrativa**
del país (comunidad autónoma en España, région en Francia, distrito en Portugal…), una
semántica consistente en todo el mundo.

1. Descarga el dataset global (una sola vez): **Natural Earth 1:10m Admin 1 – States, Provinces**
   en GeoJSON (`ne_10m_admin_1_states_provinces`, [naturalearthdata.com](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/)).
   El comando lee dos **propiedades del fichero GeoJSON** (no tienen nada que ver con los
   administradores de la app): en Natural Earth se llaman `"admin"` (contiene el nombre del país,
   p. ej. `"Spain"`) y `"name"` (la región, p. ej. `"Catalunya"`). Con GADM nivel 1 esas propiedades
   se llaman distinto: pasa `--country-field NAME_0 --region-field NAME_1`.
2. Ejecuta el comando (tras importar las fuentes). Por defecto solo toca las que aún no tienen
   región; `--all` reprocesa todas:
   ```bash
   DATABASE_URL='postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' \
     swift run App populate-regions ne_10m_admin_1_states_provinces.geojson
   ```
   Al terminar imprime un **resumen por zona** (país / región : nº de fuentes) para verificar
   la granularidad de un vistazo. Es idempotente: puedes reimportar fuentes y volver a correrlo.
3. Sanity check: `SELECT region, count(*) FROM fonts GROUP BY region ORDER BY 2 DESC;`.

**Recorta el fichero a los países que estás importando** (`scripts/fronteras-subset.py`).
No es por el tamaño —que también: 40 MB y 4.596 regiones para clasificar dos países— sino
porque acota el daño: con solo esos polígonos, el comando **no puede escribir en fuentes de
otro país** aunque te equivoques de opción, y `--fallback-nearest` deja de ser un riesgo.

```bash
python3 scripts/fronteras-subset.py ne_10m_admin_1_states_provinces.geojson nordicos.geojson Sweden Finland
```

**Cuidado con los territorios que Natural Earth trata como país aparte.** Åland no figura
como región de Finlandia: tiene `admin: "Aland"` y viene partido en sus **11 municipios**.
Usarlo tal cual daría `country = "Aland"` (un país que no existe en `lib/countries.ts` y
que saldría como columna nueva en `/zones`) y `region = "Mariehamn"`, que es un municipio
—una cuarta profundidad en una columna que ya mezcla tres—. El script los fusiona en la
región FI-01 y los reetiqueta como Finlandia; sin eso, las 8 fuentes de las islas se
quedan sin región, y son justo las de la Finlandia sueco-parlante. La lista de arreglos
está en `ARREGLOS`, dentro del script.

**Dos pasadas, y la segunda con `--fallback-nearest` medido.** En Suecia y Finlandia el
12 % de los puntos cae fuera de todo polígono: son archipiélagos, y el borde de Natural
Earth no llega. El umbral **no se copia del de Chile**, se mide corriendo el comando con
valores crecientes y leyendo cuántas rescata cada tramo:

| ≤ | rescata |
|---|---|
| 1 km | 157 |
| 2 km | 37 |
| 5 km | 35 |
| **10 km** | **64** |
| 25 km | 5 |

El salto de 5 a 10 km son islas de verdad (los archipiélagos de Estocolmo y Turku), así
que el corte va en 10: 2.622 de 2.630 clasificadas y 8 sin región, que es honesto. A 25 km
solo entran 5 más y ya es adivinar. Ojo con subirlo mucho: con el fichero recortado el
peligro está acotado, pero un umbral enorme acabaría asignando regiones nórdicas a fuentes
de cualquier sitio.

**Al terminar, añade el país a `web/src/lib/countries.ts`** (`PAISES`) y sus **seis
traducciones** `country.<Nombre>` en `dictionaries.ts`. Sin lo primero el país sale en
`/zones` pero **no** en el selector de novedades; sin lo segundo se pinta el nombre inglés
de Natural Earth. Ninguna de las dos cosas rompe nada visible, que es exactamente por qué
se olvidan.

### Imágenes subidas

El almacenamiento es **pluggable** (`ImageStorage`): si defines las variables `R2_*`,
las imágenes van a **Cloudflare R2** (recomendado: sobrevive a redeploys, escala, sin coste de egress);
si no, se guardan en **disco local** (`/app/Public/uploads`).

- **R2 (recomendado):** crea un bucket, hazlo público, y define las cinco `R2_*`. ⚠️ El código
  compila pero **no está probado contra un bucket real** — verifícalo con tus credenciales.
- **Disco local:** solo con un **volumen persistente** montado en `/app/Public/uploads` y 1 instancia
  (el disco de muchos PaaS es efímero → perderías las fotos al redesplegar).

Las imágenes se **comprimen en el cliente** (redimensionado + JPEG) antes de subir, y se
**borran del almacén** al eliminar la fuente/reseña.

## Correo

Dos caras separadas (no confundir):

- **Enviar** (transaccional, desde la app: bienvenida, resumen semanal, reset de contraseña) → **Resend**.
- **Recibir** contacto humano en `admin@fontapp.net` → **iCloud+** (Custom Email Domain).

El envío es **pluggable** (`MailSender`): en dev, `LogMailSender` solo loguea el enlace;
en prod, `ResendMailSender` si están `RESEND_API_KEY` + `MAIL_FROM` (opcional `MAIL_REPLY_TO`).

### Envío con Resend (subdominio `send.fontapp.net`)

Se usa un **subdominio de envío** para no chocar con los registros de correo de iCloud en el
dominio raíz (SPF solo admite una política por dominio) y aislar la reputación.

1. Resend → **Add Domain** = `send.fontapp.net`.
2. Añade en Cloudflare (DNS **only**, nube gris) los registros que da Resend: **MX** (return-path),
   **TXT SPF** (`v=spf1 include:_spf.resend.com ~all`), **DKIM** y opcional **DMARC**.
3. Crea una **API key** (Sending) y ponla como secret:
   ```bash
   fly secrets set \
     RESEND_API_KEY='re_...' \
     MAIL_FROM='FontApp <no-reply@send.fontapp.net>' \
     MAIL_REPLY_TO='admin@fontapp.net' -a fontapp
   ```
4. Entregabilidad: el correo lleva versión **texto plano** (multipart). Añade un **DMARC**
   (`_dmarc.send.fontapp.net` → `v=DMARC1; p=none; rua=mailto:admin@fontapp.net`). Un dominio de
   envío nuevo no tiene reputación → algún spam inicial es normal y mejora con el tiempo.

### Buzón humano con iCloud+ (`admin@fontapp.net`)

iCloud+ incluye **Custom Email Domain** (buzón real: recibir y enviar). Ojo: un dominio solo puede
tener **un** juego de MX, así que **no** actives a la vez el Email Routing de Cloudflare sobre el raíz.
Configura el dominio en iCloud, y añade en Cloudflare los **MX/SPF/DKIM de iCloud** (DNS only).
Como iCloud va en el raíz y Resend en `send.`, **no hay conflicto de SPF**.

### Resumen semanal (cron)

El resumen semanal NO lo dispara el servidor: es un comando, para que con varias
instancias no se envíe una vez por instancia.

```bash
swift run App send-weekly-digest              # envía
swift run App send-weekly-digest --dry-run    # muestra a quién se enviaría, sin enviar
swift run App send-weekly-digest --user pepe  # solo a un usuario (pruebas)
```

También puedes lanzarlo **a mano desde el panel de administración** (solo propietario):
sección «Resumen semanal» → *Ver a quién se enviaría* y, si cuadra, *Enviar ahora*. Usa el mismo
código que el cron. Útil para el primer envío o para una semana suelta sin tocar el cron.

**Dónde poner el cron.** Dos opciones, ambas sin servidor extra:

**a) Máquina programada de Fly** (lo más simple, pero no eliges el día ni la hora: Fly solo
admite `hourly`/`daily`/`weekly`/`monthly` y decide él cuándo dentro de esa ventana):

```bash
fly machine run . --schedule weekly -a fontapp --entrypoint "/app/App" --command "send-weekly-digest"
```

**b) GitHub Actions** (recomendada: eliges día y hora exactos — el resumen luce más el jueves
o viernes por la tarde, antes de las salidas del fin de semana). Reutiliza el `FLY_API_TOKEN`
que ya usa el despliegue automático. Crea `.github/workflows/weekly-digest.yml` **cuando quieras
activarlo** (en cuanto esté en `main` empieza a enviar correo de verdad):

```yaml
name: weekly-digest
on:
  schedule:
    - cron: '0 16 * * 4'   # jueves 16:00 UTC — OJO: UTC, no hora local
  workflow_dispatch:        # permite lanzarlo a mano desde la pestaña Actions
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl ssh console -a fontapp -C "/app/App send-weekly-digest"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Prueba primero con `workflow_dispatch` y `--dry-run` en el comando; cuando el recuento cuadre,
quítalo. Si la máquina de Fly está parada por autostop, `ssh console` la despierta.

Requiere `APP_SECRET` (ver abajo), `WEB_ORIGIN` (enlaces del correo) y las variables de
Resend. Antes del primer envío real, pásale `--dry-run` y revisa el recuento.

### `APP_SECRET` — firma de los enlaces de baja

El enlace de «dejar de recibirlo» del resumen semanal se pulsa **desde el buzón, sin sesión
iniciada**. Para poder fiarnos de una petición anónima que dice «da de baja al usuario X», el
enlace lleva una firma **HMAC-SHA256** del id de usuario hecha con `APP_SECRET`:

```
/unsubscribe?u=<id-de-usuario>&t=HMAC-SHA256(APP_SECRET, id-de-usuario)
```

El servidor recalcula la firma y compara. Sin la clave no se puede fabricar una válida, así que
**nadie puede dar de baja a otro** (ni reusar su propio enlace cambiando el id). No se guarda
nada en la BD y el enlace **no caduca**: alguien puede pulsar el de un correo de hace meses.

Alternativa a obligar a iniciar sesión para darse de baja, que es justo lo que no hay que hacer:
quien no consigue salir en dos clics pulsa «esto es spam», y eso hunde la reputación del dominio
para **todos** los correos, incluido el de recuperar contraseña.

**Generar y fijar la clave** (obligatorio en producción):

```bash
openssl rand -hex 32
```

```bash
fly secrets set APP_SECRET='<lo que salga>' -a fontapp
```

- **Si falta**, la app usa una clave aleatoria por proceso: los enlaces de baja dejan de valer en
  **cada reinicio o despliegue** y el usuario se encuentra un «enlace no válido». Se avisa en el
  log al arrancar en producción, pero no falla el arranque.
- **No la cambies** salvo filtración: rotarla invalida los enlaces de todos los correos ya
  enviados. Si hay que rotar, hazlo justo **después** de un envío semanal, no antes.
- En dev hay un valor fijo y deliberadamente tonto en `env.development` (`dev-only-not-a-secret`)
  para que los enlaces locales sobrevivan a los reinicios. No protege nada y por eso sí está en git.
- El nombre es genérico a propósito: si algún día hay que firmar otra cosa (confirmaciones,
  invitaciones), la misma clave sirve.

> **Si mueves el backend a otro proveedor** (o recreas la app en Fly): `APP_SECRET` es un secreto
> del *entorno*, no del código, así que **no viaja con el repositorio**. Llévate el **mismo valor**
> al servidor nuevo — si generas uno distinto, todos los enlaces de baja ya enviados se rompen.
> Lo mismo aplica a `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `DATABASE_URL` y las `R2_*`;
> revisa la tabla de variables del principio y trasládalas todas antes de apuntar el DNS.

## Web

Build con la URL del backend:

```bash
cd web
VITE_API_URL=https://api.tu-dominio.com npm run build   # genera web/dist
```

Sube `web/dist` al hosting estático. En Cloudflare Pages / Netlify define `VITE_API_URL`
como variable de entorno de build (ver `web/.env.example`).

### Donaciones con Stripe Checkout

`/support` crea Checkout Sessions desde una Cloudflare Pages Function. Configura estas
variables **de ejecución** en Pages (Preview con valores de prueba; Production con valores
reales). Ninguna lleva el prefijo `VITE_`, porque la clave secreta no puede entrar en el bundle:

| Variable | Contenido |
|---|---|
| `STRIPE_SECRET_KEY` | Clave de servidor: `…_test_…` en Preview y `…_live_…` en Production. Mejor **restringida** (`rk_`) que secreta (`sk_`) — aquí solo hace falta *Checkout Sessions: write*, y así una filtración no da acceso a clientes ni a mover dinero. Las dos valen; la publishable (`pk_`) se rechaza a propósito, que es la que se pega por error. |
| `STRIPE_ONE_TIME_PRICE_ID` | `price_…` de un precio único en EUR. |
| `STRIPE_MONTHLY_PRICE_ID` | `price_…` de un precio recurrente mensual en EUR. |

Crea los dos precios en el mismo modo que la clave (test o live); los objetos de prueba y de
producción tienen identificadores distintos. En Stripe → Payment methods, deja activos los
métodos dinámicos que quieras mostrar. Checkout ofrece tarjeta y los monederos compatibles
con el dispositivo y el país; Apple Pay no aparece en todos los navegadores/dispositivos.
**Managed Payments va apagado en cada sesión, y tiene que seguir así.** Stripe lo enciende
por defecto en las cuentas nuevas, y con él la creación de la sesión falla entera si el
producto no lleva un `tax_code` elegible: `Invalid line_items[0]: this product tax code is
ineligible for Managed Payments`. Eso llega al usuario como «no podemos abrir el pago», sin
más pistas. Se apaga en el código (`managed_payments[enabled]=false`) y **no** en el panel,
aunque el panel también deje: un ajuste de panel es por cuenta e invisible desde el
repositorio, así que bastaría con que producción y el sandbox no coincidieran para que esto
funcionara en pruebas y fallara al cobrar de verdad. Y de fondo, Managed Payments es Stripe
haciendo de *merchant of record* —impuestos, fraude y disputas globales, cobrando por ello—,
que es un producto para vender y no para recibir una donación.

**Para probarlo en local hace falta el runtime de Pages, no Vite.** `npm run dev` no ejecuta
nada de `web/functions/`, así que `/stripe/checkout` da 404 y la pantalla dice exactamente lo
mismo que diría si Stripe estuviera caído:

```
npm --prefix web run build && npx wrangler pages dev web/dist --port 8788
```

Las claves salen de `web/.dev.vars` (ignorado por git; hay un `.dev.vars.example`). Ojo con
cruzarlas: `STRIPE_ONE_TIME_PRICE_ID` quiere un precio **one-off** y `STRIPE_MONTHLY_PRICE_ID`
uno **recurrente**; poner el de pago único en el mensual da
`You must provide at least one recurring price in subscription mode`.

Esta integración no necesita webhook mientras FontApp no conceda nada ni mantenga un estado
propio por la donación. Si más adelante se muestra el estado de mecenas dentro de FontApp,
añade un webhook firmado para `checkout.session.completed` y los eventos de suscripción.

### Analítica web (Cloudflare Web Analytics)

Analítica **sin cookies** y sin datos personales (encaja con la página legal, no exige banner
de consentimiento). El beacon solo se carga en producción y **solo si** existe el token:

1. Cloudflare → **Web Analytics** → *Add a site* (`fontapp.net`). Copia el **token** del snippet
   (una cadena hex; no es un secreto).
2. En Cloudflare Pages → *Settings → Environment variables* (build), añade
   `VITE_CF_ANALYTICS_TOKEN = <token>` y vuelve a desplegar.
3. Sin esa variable no se carga ningún script de terceros (útil para dev/preview).

> Alternativa cero-código: como el sitio está tras Cloudflare, se puede activar Web Analytics
> con **auto-inyección** desde el panel, sin variable ni redeploy. Se usa la variable para tener
> control explícito en el build.

## Despliegue en Fly.io (paso a paso)

Requisitos: `brew install flyctl` y `fly auth signup` (o `fly auth login`). El `fly.toml` ya está en el repo.

### 1. Backend + Postgres
```bash
git push                          # sube los últimos commits a GitHub

fly launch --no-deploy            # detecta Dockerfile + fly.toml; nombre único + región (mad)
fly postgres create               # Postgres gestionado (o durante el launch)
fly postgres attach <nombre-pg>   # inyecta DATABASE_URL como secret automáticamente
```
Si el arranque falla por TLS (BD **interna** de Fly), fuerza sin TLS:
```bash
fly secrets set DATABASE_URL="postgres://usuario:pass@host:5432/db?sslmode=disable"
```

> **En producción se usa Neon** (Postgres gestionado, externo a Fly), no la BD interna de Fly.
> En ese caso **sí** hace falta TLS: el `DATABASE_URL` de Neon lleva **`?sslmode=require`**
> (`SQLPostgresConfiguration(url:)` lo respeta). Ponlo como secret y **no** lo pegues en claro:
> ```bash
> fly secrets set DATABASE_URL='postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' -a fontapp
> ```

### 2. R2 + secrets
En Cloudflare: crea un **bucket R2**, hazlo **público** (URL `pub-xxxx.r2.dev`) y un **token de API**
(Object Read & Write) → obtienes access key, secret y el endpoint. Luego:
```bash
fly secrets set \
  R2_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com" \
  R2_ACCESS_KEY_ID="..." R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="fontapp-images" R2_PUBLIC_URL="https://pub-xxxx.r2.dev"
```

### 3. Desplegar y comprobar
```bash
fly deploy
fly open      # https://<tu-app>.fly.dev  (prueba /health)
fly logs      # arranque + migraciones (AUTO_MIGRATE)
```
Sembrar las fuentes reales una vez (**nunca `--demo` en producción**):
```bash
fly ssh console --command "/app/App seed"
```

### 4. Web (Cloudflare Pages) + cerrar el CORS
En Cloudflare Pages → conectar el repo de GitHub:
- **Root directory:** `web` · **Build:** `npm run build` · **Output:** `dist`
- **Variable de entorno:** `VITE_API_URL = https://<tu-app>.fly.dev`

Cuando tengas la URL de la web, ciérrale el CORS al backend:
```bash
fly secrets set WEB_ORIGIN="https://xxx.pages.dev"
```

#### Dominio propio (`fontapp.net`)
1. Cloudflare Pages → proyecto `fontapp-web` → **Custom domains** → añade `fontapp.net`
   (y opcionalmente `www.fontapp.net`). Como el dominio está en la misma cuenta de
   Cloudflare, crea los registros DNS y provisiona el TLS automáticamente.
2. Actualiza el CORS del backend con el dominio real, **canónico primero** (ese primer
   valor es también la base del enlace del email de reset):
   ```bash
   fly secrets set WEB_ORIGIN="https://fontapp.net,https://www.fontapp.net"
   ```
3. `VITE_API_URL` **no cambia** (`https://fontapp.fly.dev`); el backend sigue en fly.dev.
   (Opcional futuro: `api.fontapp.net` como dominio del backend.)

No requiere cambios de código: el frontend no hardcodea su dominio y `WEB_ORIGIN` admite
varios orígenes separados por comas.

## Despliegue automático (CI/CD) — push a `main`

Configurado en `.github/workflows/ci.yml`. Al hacer **push a `main`**:

1. Job **`backend`** — corre `swift test` (contenedor `swift:6.3-noble` + Postgres de servicio).
   Debe ir alineado con el `Dockerfile` (`FROM swift:6.3-noble`): si sube la versión de Swift,
   **actualiza los dos sitios a la vez**.
2. Job **`web`** — `npm ci` + `npm run build`.
3. Job **`deploy-backend`** — si `backend` y `web` pasan, ejecuta `flyctl deploy --remote-only`.
   Necesita el secret **`FLY_API_TOKEN`** en GitHub (Settings → Secrets → Actions). El token de Fly
   incluye el prefijo literal `FlyV1 ` (con el espacio) — guárdalo entero. Genéralo con
   `fly tokens create deploy -a fontapp`; si se filtra, revócalo con `fly tokens revoke`.
4. **Web (Cloudflare Pages)** se redespliega solo por su **integración con GitHub** (no va por el
   Action): cada push a `main` dispara un build de Pages con `VITE_API_URL` ya configurada.

Así, un `git push` a `main` despliega **backend (Fly) + web (Pages)**. Las migraciones nuevas se
aplican solas en el arranque gracias a `AUTO_MIGRATE=true`.

### Cuánto tarda (push → cambios visibles)

El ciclo completo son **~15-30 min**, y casi todo es el **build de la imagen Swift**, no la migración:

| Fase | Qué pasa | Tiempo aprox. |
|------|----------|---------------|
| Jobs `backend` + `web` | `swift test` (compila Swift en contenedor) + `npm build` | ~3-8 min |
| `deploy-backend` → `flyctl deploy` | **Build remoto de la imagen Docker (Swift)** — el cuello de botella | **~10-20 min** |
| Release + boot | Arranca la máquina; `AUTO_MIGRATE` aplica las migraciones pendientes | **segundos** |

> Ojo: "los tests están verdes" **no** significa "ya está desplegado". Los tests son los jobs
> `backend`/`web`; el `deploy-backend` (con el build de la imagen) corre **después** y es lo lento.
> La **migración en sí es instantánea**; si una tabla nueva "no existe" justo tras el push, es que
> el build aún no ha terminado, no que la migración tarde.

### Cómo saber que ya está en vivo

Dos señales fiables (no adivines por el reloj):

1. **GitHub → Actions**: espera a que el job **`deploy-backend`** se ponga **verde** (no solo los tests).
2. **`curl` a un endpoint del cambio nuevo.** Devuelve el código HTTP sin cuerpo:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://fontapp.fly.dev/health
   # o, para verificar una ruta nueva concreta (ejemplo: feedback):
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://fontapp.fly.dev/feedback \
     -H 'Content-Type: application/json' -d '{"message":"deploy check"}'
   ```
   - **404** → sigue el **código viejo** (el deploy aún no ha aplicado).
   - **500 / error de BD** → código nuevo pero **falta la migración** (fuérzala:
     `fly ssh console -a fontapp -C "/app/App migrate --yes"`).
   - **2xx** (p. ej. `204`) → desplegado **y** migrado. ✅

### Zonas de las fuentes (país/región)

Las fuentes nuevas **heredan la zona de la más cercana ya clasificada**, así que no se
quedan en blanco. Eso no sustituye a `populate-regions`: pásalo después de cada importación
grande y de vez en cuando, para corregir los puntos cerca de una frontera y clasificar zonas
donde todavía no hay ninguna fuente con región.

```bash
fly ssh console -a fontapp -C "/app/App populate-regions /app/fronteres.geojson"
```

### Activar o actualizar `admin1`

`admin1` es aditivo: no sustituye `region` ni cambia rankings, correos o insignias. Tras
un despliegue que añada la columna, audita primero. El primer comando no escribe nada y
falla si encuentra una demarcación que no esté en la tabla cerrada:

```bash
fly ssh console -a fontapp -C "/app/App backfill-admin1"
fly ssh console -a fontapp -C "/app/App backfill-admin1 --apply"
```

Antes de `--apply`, crea un backup con `scripts/backup-db.sh`. Después comprueba que no
queden huecos ni códigos inesperados:

```sql
SELECT count(*) FILTER (WHERE region IS NOT NULL AND admin1 IS NULL) AS pendientes,
       count(DISTINCT admin1) AS admin1_distintos
FROM fonts;
```

## Gamificación: el cron de liquidación

La fase 2 necesita que algo pase el barrido con regularidad. No es un temporizador dentro del
servidor por lo mismo que el resumen semanal: con varias instancias se ejecutaría tantas veces
como instancias haya. Aquí las escrituras son idempotentes y no rompería nada, pero sería
trabajo repetido contra la base de datos cada pocos minutos.

```bash
fly ssh console -a fontapp -C "/app/App gamification-sync"
```

Cada 15 minutos o cada hora vale igual: la ventana de liquidación es de 72 horas, así que la
frecuencia solo decide cuánto tarda una aportación en aparecer como «en camino».

**O mejor, sin cron:** con `GAMIFICATION_WORKER=true` la app lleva el recuento sola. Se
suscribe a los cambios con un middleware de modelo, así que la petición del usuario solo
marca un booleano (crear una fuente sigue tardando 39 ms) y el recuento va detrás. Medido en
local: **16 segundos** desde crear la fuente hasta que la aportación está registrada. Con
varias máquinas se coordinan con un cerrojo de Postgres, así que no duplican trabajo. El
cron sigue valiendo como red de seguridad: es el mismo código.

No hay nada que montar en Fly para esto. El trabajador es un temporizador de NIO **dentro
del mismo proceso** que sirve el HTTP —la misma llamada que ya limpia los tokens caducados
cada 6 h—, así que del alojamiento solo necesita que el proceso siga vivo
(`min_machines_running = 1`) y que le llegue la variable. Ni máquina aparte, ni cron de
Fly, ni cola.

> **No esperes verlo en los logs.** El trabajador anuncia el arranque y resume cada pasada,
> pero en nivel `info`, y **Vapor en release corta en `notice`**: en los logs de Fly no
> aparece ni una línea `[ INFO ]`. Para confirmarlo, `fly ssh console -a fontapp -C
> "printenv GAMIFICATION_WORKER"`, o sube `LOG_LEVEL=info` un rato.

| Variable | Qué hace |
|---|---|
| `GAMIFICATION_WORKER=true` | Recuento en segundo plano dentro de la app. |
| `GAMIFICATION_EPOCH=AAAA-MM-DD` | Fecha desde la que los puntos son definitivos. Sin definir, todo es provisional. |
| `GAMIFICATION_CAPABILITIES=true` | Enciende los permisos por nivel (fase 6). **Apagado por defecto.** Con esto basta para los permisos aditivos; los que destruyen trabajo ajeno piden además `GAMIFICATION_EPOCH` puesta y pasada. |

> **Antes de encender `GAMIFICATION_CAPABILITIES`:** los permisos cuelgan de las gotas, y
> mientras `GAMIFICATION_EPOCH` no esté puesta, `gamification-sync --rescore` puede
> reescribirlas. Un permiso que aparece y desaparece solo no es un permiso, es un error
> intermitente.
>
> La regla está partida en dos (`Capability.requiresDefinitivePoints`), porque exigírsela a
> todas dejaba inservibles justo las nuevas. Sin época se conceden **añadir una foto
> secundaria** (nivel 3) y **dar por resuelta una incidencia** (6): son aditivas y
> reversibles, y perderlas a media faena no rompe nada de nadie. Siguen esperando a la
> época **reubicar una fuente ajena** (5), **borrar una foto ajena** (7) y **deshacer una
> edición ajena** (8) — ésas destruyen o deshacen trabajo de otra persona.
>
> El orden completo sigue siendo: calibrar el baremo, fijar la época, y entonces se abren
> también las tres últimas.

Antes de la primera vez, conviene mirar qué haría:

```bash
fly ssh console -a fontapp -C "/app/App gamification-sync --dry-run"
```

La primera pasada vuelca **todo el historial** de golpe. Es lo esperado y es idempotente, pero
revisa el número de anuladas por techo diario antes de darlo por bueno: si sale alto, el techo
está mal calibrado para los datos reales y más vale ajustarlo antes de que nadie vea puntos.

## Portadas que están esperando dentro de una reseña

Desde agosto de 2026, publicar una reseña con foto sobre una fuente **sin portada** se la
pone como foto principal (`CoverPhoto`). Lo que queda es la cola de antes: fuentes cuya
única foto vive dentro de una reseña vieja y nunca se ascendió, así que la ficha se enseña
vacía. **Corre esto una vez tras desplegar**, porque mientras tanto la app invita a poner
«la primera foto» en fuentes que el baremo ya da por fotografiadas, y quien la ponga cobra
«foto sustituida» (80 gotas menos de lo que le tocaba).

Primero, cuántas son:

```bash
fly ssh console -a fontapp -C "/app/App adopt-cover-photos --dry-run"
```

Enseña el recuento y las veinte primeras, sin escribir nada. Para verlo también en SQL:

```bash
fly postgres connect -a <tu-db> -c "SELECT (SELECT count(*) FROM fonts WHERE image IS NOT NULL) AS con_portada, (SELECT count(DISTINCT c.font_id) FROM font_comments c JOIN fonts f ON f.id=c.font_id WHERE c.image IS NOT NULL AND f.image IS NULL) AS esperando;"
```

Si el número es grande, una primera tanda corta para comprobar el resultado en la web:

```bash
fly ssh console -a fontapp -C "/app/App adopt-cover-photos --limit 20"
```

Y ya del todo:

```bash
fly ssh console -a fontapp -C "/app/App adopt-cover-photos"
```

Cada ascenso **copia** el objeto (la reseña conserva el suyo) y deja su entrada en el
historial de ediciones, así que se revierte una a una desde el panel. Es idempotente: una
fuente que ya tenga portada no se toca, así que repetirlo no hace nada.

## Cloudflare delante de la API (`api.fontapp.net`)

### Por qué

El navegador llama hoy directo a `https://fontapp.fly.dev`, así que cada petición depende
de que el edge anycast de Fly sea alcanzable desde el operador del usuario. El 15 y 16 de
agosto de 2026 no lo fue durante más de un día desde un ISP español, **y las dos familias
se turnaban**: por la mañana IPv4 perdía el 40 % de los paquetes y IPv6 iba fino; por la
tarde IPv4 iba 15/15 e IPv6 fallaba 6 de 8.

No era la app (dos máquinas `started`, checks pasando, ~0,1 s de servicio real) ni la línea
(IPv4 contra Cloudflare, GitHub y Neon, impecable). Y no era *nuestra* dirección: `fly.io`
—su propia web, en `2a09:8280:1::a:791`— caía 0/6, mientras `api.fly.io`, en otro `/64`
(`2a09:8280:1:f28::`), respondía 6/6. Lo roto era la subred del edge de Fly, así que
**reasignar la IP no habría servido de nada**: cualquier anycast nueva cae en la misma.

Cloudflare Pages, en las mismas tandas, hizo 25/25 a 0,12 s. La idea es que los usuarios
entren por ahí y sea Cloudflare quien recorra el tramo flojo hasta Fly, por su backbone.

Las imágenes ya son inmunes: salen de R2 (`R2_PUBLIC_URL`, un `pub-….r2.dev`), no del
backend. Lo único que pasa por Fly es el JSON de la API.

### El orden importa

Si pones la nube naranja antes de que Fly tenga el certificado, Cloudflare llega al origen
con SNI `api.fontapp.net`, Fly no tiene certificado para ese nombre y **todo devuelve 525 /
526**. Los pasos van en este orden por eso.

**1. Desplegar el backend con el soporte de IP de cliente (antes de tocar el DNS).**

Detrás de Cloudflare, `Fly-Client-IP` deja de ser el usuario: es el edge de Cloudflare. Sin
esto, todo el tráfico compartiría contador de rate-limit y el geo-IP del registro situaría a
todo el mundo en el centro de datos de Cloudflare más cercano. Lo resuelve `ClientIP`, que
solo cree a `CF-Connecting-IP` si viene acompañada de un secreto que Cloudflare inyecta y
el navegador no conoce (a `fly.dev` se puede seguir llegando directo y falsificar la
cabecera). **Sin `EDGE_SECRET` definido no cambia nada**, por eso este paso va el primero y
es inofensivo.

```bash
fly secrets set EDGE_SECRET="$(openssl rand -hex 32)" -a fontapp
```

Guárdalo: hace falta literal en el paso 5.

**2. Pedir el certificado a Fly, con la nube GRIS.**

En Cloudflare → DNS, crea el registro **desactivando el proxy** (nube gris):

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| CNAME | `api` | `fontapp.fly.dev` | **DNS only (gris)** |

Y entonces:

```bash
fly certs add api.fontapp.net -a fontapp
fly certs show api.fontapp.net -a fontapp     # repetir hasta "Ready"
```

Tiene que decir `Ready` y listar el certificado emitido. Con la nube naranja desde el
principio, la validación de Let's Encrypt no llega y este paso se queda colgado.

**3. Comprobar que el origen funciona por su nombre nuevo, todavía sin proxy.**

```bash
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://api.fontapp.net/health
```

Debe dar `200`. Si da error de TLS, el certificado aún no está listo: vuelve al paso 2.

**4. Encender el proxy.**

En Cloudflare → DNS, cambia ese CNAME a nube **naranja**. Y en SSL/TLS → Overview, modo
**Full (strict)** — Fly tiene un certificado válido de Let's Encrypt, así que *strict* es
correcto y cualquier modo inferior sería dejarse el tramo Cloudflare↔Fly sin verificar.
**«Flexible» no**: haría peticiones HTTP al origen y entraría en bucle de redirección.

**5. Inyectar el secreto desde Cloudflare.**

Rules → Transform Rules → **Modify Request Header** → Create:

- Nombre: `Identifica el edge ante el backend`
- Si: `Hostname` `equals` `api.fontapp.net`
- Acción: **Set static** → nombre `X-Edge-Secret`, valor = el `EDGE_SECRET` del paso 1.

Sin esto el backend sigue funcionando, pero contando a todo el mundo como una sola IP.

**6. Comprobar que la IP real llega.** Regístrate con una cuenta de prueba y mira en el
panel que la ubicación deducida es la tuya y no Frankfurt/Ámsterdam. Si sale un centro de
datos, la Transform Rule no está aplicando.

**7. Caché: que la API NO se cachee.** Por defecto Cloudflare no cachea respuestas sin
extensión de fichero, así que de entrada estás bien. Aun así, déjalo explícito —
Rules → Cache Rules:

- Si: `Hostname` `equals` `api.fontapp.net`
- Entonces: **Bypass cache**

Cachear la API serviría a un anónimo la respuesta de un admin. Es el mismo motivo por el
que el ámbito entra en la clave de la caché de `/activity`.

**8. Apuntar la web al nombre nuevo.** En `web/.env.production` y en la variable de
entorno del proyecto de Cloudflare Pages:

```
VITE_API_URL=https://api.fontapp.net
```

Y redespliega Pages. Las dos cosas: el `.env` del repo es lo que usa el CI.

**9. Ampliar `WEB_ORIGIN`** solo si aún no incluye el origen de la web. `api.fontapp.net`
y `fontapp.net` son orígenes distintos, así que **el CORS sigue siendo necesario** (esto no
lo elimina; para eso habría que servir la API bajo `fontapp.net/api/*`, que es otra
reforma).

```bash
fly secrets set WEB_ORIGIN="https://fontapp.net,https://www.fontapp.net" -a fontapp
```

### Después

- `fontapp.fly.dev` **sigue funcionando y sigue siendo un bypass**: quien la conozca puede
  saltarse Cloudflare. Es aceptable (el rate-limit sigue actuando por `Fly-Client-IP`), pero
  si quieres cerrarlo, una regla en Fly o un chequeo de `X-Edge-Secret` que rechace lo que
  no venga del edge.
- El service worker **no se entera**: solo intercepta peticiones del mismo origen
  (`sw.js`), y la API era cross-origin antes y lo sigue siendo. No hay que subir la versión
  del caché por esto.
- Límites de Cloudflare que nos afectan: cuerpo de 100 MB (subimos 256 kB) y 100 s de
  espera al origen (lo más lento medido son 0,43 s). Ninguno estorba.

## Límites de uso (anti-bot)

Todos los endpoints de escritura llevan un límite por IP y ventana deslizante
(`RateLimitMiddleware`), calibrado a lo que haría una persona:

| Acción | Límite |
|---|---|
| Registro | 5 / hora |
| Crear fuente | 30 / hora |
| Reseña | 40 / hora |
| Incidencia | 20 / hora |
| Subir imagen | 10 / hora |
| Login | 10 / 5 min |
| Recuperar contraseña | 5 / 15 min |
| Sugerencias | 5 / 10 min |

Cada límite lleva su propia etiqueta (`scope`): si compartieran contador, registrarte te
dejaría sin margen para añadir fuentes. El contador es **en memoria y por instancia**: con
varias máquinas el límite efectivo se multiplica por el número de instancias. A esa escala,
Redis (o Cloudflare Rate Limiting delante) es el siguiente paso.

**Coste por petición.** Además del ritmo, se acota lo que una sola petición puede
costar: el término de búsqueda se recorta a 80 caracteres y se le escapan los comodines
de `LIKE` (`SearchTerm`), y el tamaño de página se topa en 100 (`SafePage`). Sin eso, un
`?search=` de 50.000 caracteres costaba **20 s de CPU** de base de datos y un `?per=100000`
devolvía **14 MB** — ambos sin necesidad de tener cuenta.

Siguiente nivel si aparecen bots de verdad: **Cloudflare Turnstile** en el formulario de
registro (gratuito, sin cookies ni puzles) y verificación del correo antes de poder publicar.

### Excepción temporal para una cuenta colaboradora

Las cuentas con menos de siete días tienen además un cupo de **5 fuentes durante las
últimas 24 horas**. Sirve contra cuentas desechables, pero puede bloquear a una persona
conocida que está cartografiando una zona. Para ese caso existe una excepción temporal
por usuario; no se debe ascender a la persona a moderador/admin ni cambiar a mano su fecha
de registro.

La excepción **solo omite el cupo de cuenta nueva**. Se mantienen:

- el límite general de 30 fuentes por hora;
- la detección de duplicados cercanos;
- las restricciones y sanciones de moderación;
- todos los permisos normales del rol `user`.

#### Concederla en producción

Primero despliega el commit que contiene la migración
`AddSourceLimitExemptionToUser`. Producción tiene `AUTO_MIGRATE=true`, así que la columna
nullable se crea al arrancar y no altera ninguna cuenta existente. Cuando `/health`
responda desde el nuevo despliegue:

```bash
fly ssh console -a fontapp -C "/app/App set-source-limit-exemption USUARIO --days 7"
```

Ejemplo real:

```bash
fly ssh console -a fontapp -C "/app/App set-source-limit-exemption font199 --days 7"
```

El valor predeterminado también es siete días, pero en operaciones conviene escribirlo
para que la intención quede clara. El comando acepta entre 0 y 30 días y muestra la fecha
exacta de caducidad. También registra la concesión en `moderation_actions` con
`source_limit_exemption_granted`; al ejecutarse desde CLI, `actor_id` queda nulo.

#### Revocarla antes de tiempo

```bash
fly ssh console -a fontapp -C "/app/App set-source-limit-exemption USUARIO --days 0"
```

La revocación elimina la fecha y deja una acción
`source_limit_exemption_revoked`. No hace falta ningún proceso de limpieza cuando vence:
el backend compara `source_limit_exempt_until` con la hora actual en cada alta y vuelve a
aplicar el cupo automáticamente.

#### Probarlo en local

Después de migrar la base local:

```bash
export $(cat env.development | xargs)
swift run App migrate --yes
swift run App set-source-limit-exemption USUARIO --days 7
```

El comando actúa sobre la base indicada por el entorno del proceso. `swift run` no
significa por sí solo «base local»: con variables de producción apuntaría a producción.
En Fly se usa `/app/App` porque la imagen final solo contiene el binario compilado, no el
código fuente ni la toolchain de Swift.

#### Verificación y diagnóstico

1. La salida debe decir `Excepción para 'USUARIO' activa hasta ...`.
2. Si responde `No existe el usuario`, comprueba mayúsculas/minúsculas del `username`.
3. Si Postgres dice que no existe `source_limit_exempt_until`, el backend nuevo todavía
   no terminó de desplegar/migrar: no manipules la tabla; espera y repite el comando.
4. Si aún recibe un 429 después de concederla, comprueba el código del error: la excepción
   no elimina el rate limit general de **30 altas/hora**.

El comportamiento está cubierto por
`IntegrationTests.testTemporarySourceLimitExemption`: quinta permitida, sexta bloqueada,
sexta permitida con excepción y bloqueo restaurado al caducar.

## Backups de la base de datos

La BD es lo irreemplazable (fuentes, reseñas, cuentas aportadas por los usuarios). Estrategia:

1. **PITR del proveedor (Neon):** recuperación a un punto en el tiempo dentro de la ventana de
   retención (en el plan gratuito es corta, ~24 h; ver *Settings → History retention* y subirla
   si el plan lo permite). Cubre "ups" recientes, pero **vive en el mismo proveedor**.
2. **Copia independiente (off-provider):** `pg_dump` periódico a un bucket **privado** (R2/B2).
   Regla 3-2-1. Recomendado **diario**; retención p. ej. 7 diarios + 4 semanales.

> ⚠️ **Versión del cliente `pg_dump`.** `pg_dump` solo vuelca servidores de versión **≤ la suya**.
> Neon corre Postgres **18**, así que el cliente debe ser **≥ 18**. Con el de Homebrew 16 falla con
> `server version mismatch`. Instala el 18 (es *keg-only*, no pisa el 16 de dev) y úsalo por ruta:
>
> ```bash
> brew install postgresql@18
> /opt/homebrew/opt/postgresql@18/bin/pg_dump "$NEON_URL" -Fc -f fontapp-$(date +%Y%m%d).dump
> # restaurar:
> /opt/homebrew/opt/postgresql@18/bin/pg_restore -d "$URL_DESTINO" fontapp-YYYYMMDD.dump
> ```
>
> Alternativa sin instalar nada: `docker run --rm postgres:18 pg_dump "$NEON_URL" -Fc > backup.dump`.
> El `.dump` lleva **emails y hashes** → guárdalo en sitio **privado**, nunca en git ni bucket público.
> La URL de Neon suele necesitar `?sslmode=require`.

### Backup automático a disco local (`scripts/backup-db.sh`)

Script versionado que vuelca la BD de Neon al disco, con rotación. **No** guarda la cadena de
conexión (la lee de env o de un fichero privado). Elige pg_dump 18 local o, si no está, la imagen
Docker `postgres:18`.

**1. Configura la URL de la BD** (una vez), en un fichero privado fuera del repo:
```bash
mkdir -p ~/.config/fontapp
printf '%s' 'postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' > ~/.config/fontapp/neon_url
chmod 600 ~/.config/fontapp/neon_url
```
(Alternativa: exportar `FONTAPP_DB_URL` en tu shell.) Variables opcionales: `FONTAPP_BACKUP_DIR`
(por defecto `~/Backups/fontapp`) y `FONTAPP_BACKUP_KEEP` (por defecto 8).

**2. Pruébalo a mano:**
```bash
./scripts/backup-db.sh
```

**3. Prográmalo semanal con launchd** (macOS; se recupera si el Mac estaba dormido, a diferencia de
cron). Crea `~/Library/LaunchAgents/net.fontapp.backup.plist` (usa **rutas absolutas**, launchd no
expande `~`; cambia `USER` y `RUTA_AL_REPO`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>net.fontapp.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/USER/RUTA_AL_REPO/scripts/backup-db.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/Users/USER/Backups/fontapp/backup.log</string>
  <key>StandardErrorPath</key><string>/Users/USER/Backups/fontapp/backup.log</string>
</dict></plist>
```
Cárgalo (y para actualizarlo, `unload` antes):
```bash
launchctl load ~/Library/LaunchAgents/net.fontapp.backup.plist
launchctl start net.fontapp.backup   # ejecución inmediata de prueba
```
`Weekday 0` = domingo, a las 10:00. Revisa el log en `~/Backups/fontapp/backup.log`.

**Restaurar** un dump:
```bash
/opt/homebrew/opt/postgresql@18/bin/pg_restore -d "$URL_DESTINO" ~/Backups/fontapp/fontapp-YYYYMMDD-HHMMSS.dump
```

> Esto es **una** copia en tu disco (empezar). Para 3-2-1 real, más adelante añade una **off-site**
> (subir el `.dump` a un bucket **privado** R2/B2, o un Action programado). El `.dump` lleva emails y
> hashes → mantenlo en sitio privado, **nunca** en git ni carpeta sincronizada/pública.

## Backup de las fotos (`scripts/backup-fotos.sh`)

Las fotos viven **solo en R2**, y R2 es una copia única: sin versiones, sin papelera. Un
bucket borrado o una credencial filtrada se las lleva todas. Y son lo único de FontApp que
**no se puede reconstruir**: las fuentes vuelven de OpenStreetMap y del ICGC, pero la foto
de una fuente la hizo alguien que pasó por allí.

Medido el 26/08/2026: **91 ficheros, 43,5 MB**, media de 489 KB. O sea que hoy el backup
cabe en un correo; el motivo de hacerlo no es el tamaño, es que no hay segunda copia.

**1. Credenciales** en `~/.config/fontapp/r2.env` (`chmod 600`), con `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`. Se sacan del panel de Cloudflare
→ R2 → *Manage API tokens*. **No se pueden recuperar de Fly**: allí los secretos solo se
escriben.

**2. `brew install rclone`** y lánzalo:

```bash
./scripts/backup-fotos.sh
```

Destino por defecto `~/Backups/fontapp-fotos`, configurable con `FONTAPP_FOTOS_DIR`.

**3. Prográmalo** con el mismo launchd del backup de la base, añadiendo un segundo
`.plist` que apunte a este script.

> Usa `rclone copy` y **no `sync`** a propósito: `sync` borraría del disco lo que ya no
> esté en R2, así que un borrado accidental en producción se propagaría al backup a la
> siguiente pasada. Con `copy` el destino solo crece. El precio es que se acumulan fotos
> retiradas por moderación; con 43 MB eso todavía no es un problema.

**Cuota de R2:** el plan gratuito cubre 10 GB de almacenamiento y la salida de datos no se
cobra nunca (es lo que distingue a R2 de S3). A 489 KB por foto son unas **20.000 fotos**
antes de pagar nada. El script avisa al pasar de 8 GB. Conviene confirmar los importes en
el panel de Cloudflare antes de fiarse de esta línea: los precios cambian.

## Checklist antes de abrir al público

- [x] `WEB_ORIGIN` restringido al dominio real del web.
- [x] HTTPS + dominio (lo suele dar la plataforma).
- [x] Imágenes: R2 configurado (`R2_*`) **y probado**, o volumen persistente para `/uploads`.
- [ ] Backups de la BD (script `scripts/backup-db.sh` + launchd semanal; ver *Backups*. Off-site 3-2-1 pendiente).
- [x] Rate-limit en `/auth/login` y `/auth/*` (en memoria, por IP; `RateLimitMiddleware`).
- [x] Limpieza de tokens caducados (tarea periódica cada 6 h en `configure.swift`).
- [x] Aviso legal / privacidad (GDPR) y atribución de datos OSM (ODbL) e ICGC/ACA.
- [x] CI que corra `swift test` y `npm run build` (`.github/workflows/ci.yml`).
- [x] Correo de reset con dominio propio (Resend + SPF/DKIM); **pendiente** el DMARC y vigilar el spam.
