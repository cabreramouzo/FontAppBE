# Comparación Encos con el backup de FontApp

Backup: **13/09/2026, 09:00:03 CEST**, 168.823 filas de `fonts`. Análisis realizado el 20/09/2026 exclusivamente en local, sin consultas a Neon ni a la API de FontApp. No se ha importado ni modificado ninguna fuente.

## Resultado

3.265 registros de Encos, con identificadores únicos. 3.260 tienen coordenadas válidas; cuatro no tienen coordenadas y uno tiene latitud inválida (id 3243, Font de la Fou, 440.7215). No se ha corregido por suposición.

| Distancia a la fuente más cercana del backup | Fuentes de Encos | Porcentaje de las 3.260 válidas |
|---|---:|---:|
| Hasta 50 m | 2.072 | 63,6 % |
| Más de 50 y hasta 200 m | 487 | 14,9 % |
| Más de 200 m | 701 | 21,5 % |

**1.188 registros (36,4 %) no tienen una fuente a 50 m.** Son candidatos a revisión, no 1.188 altas demostradas. El radio de 50 m coincide con el criterio documentado para deduplicar importaciones; la proximidad no demuestra identidad y una separación mayor tampoco demuestra ausencia.

Los 701 a más de 200 m son el grupo con mayor indicio geográfico de ausencia. Aun así, 28 tienen un nombre exactamente coincidente tras normalizar acentos, mayúsculas y puntuación dentro de 1 km: pueden ser desplazamientos de coordenadas u homónimos. Los recuentos son de registros Encos, no de nuevas fuentes físicas deduplicadas entre sí.

Se ha comparado contra toda la tabla, incluidas las ocultas, porque una retirada o un duplicado no debe confundirse con una fuente nueva. Solo un registro tiene como vecina más próxima una ficha no visible; se identifica en `results.json`.

## Sensibilidad al radio

| Radio | Con alguna fuente dentro | Sin ninguna dentro |
|---|---:|---:|
| 10 m | 1225 | 2035 |
| 25 m | 1818 | 1442 |
| 50 m | 2072 | 1188 |
| 75 m | 2197 | 1063 |
| 100 m | 2295 | 965 |
| 150 m | 2445 | 815 |
| 200 m | 2559 | 701 |
| 500 m | 2889 | 371 |
| 1000 m | 3058 | 202 |

## Ejemplo solicitado

Font des Paraigua (Encos 3270), Lloret de Mar: 41.7009, 2.8724. La fuente más próxima del backup está a **1.171,96 m** y no tiene nombre. No hay coincidencia geográfica cercana.

## Muestra aleatoria reproducible

30 registros elegidos con `random.Random(20260920).sample` entre los 3.260 válidos: 21 a ≤50 m, cinco entre 50 y 200 m y cuatro a >200 m. Es una comprobación de ejemplos; el recuento anterior usa todo el fichero y no una extrapolación. Las 30 distancias mínimas se verificaron además mediante un barrido independiente de toda la tabla.

| Encos | Municipio | Fuente más cercana en FontApp | Distancia |
|---|---|---|---:|
| 0270 · Font de la plaça dels Estudis | Vilallonga de Ter | [Sin nombre](https://fontapp.net/fonts/af69d3b6-0a1d-42f9-b113-90549247a6a0) | 4.00 m |
| 1493 · Font de Can Prat | Santa Coloma de Farners | [Font Esperguer](https://fontapp.net/fonts/b5a1128a-689f-4849-a327-b0c959a9fcdf) | 21.27 m |
| 1904 · Font del Daví | Sant Llorenç Savall | [Font del Daví o Fibles del Daví](https://fontapp.net/fonts/22fe83cc-ad18-4f77-8e63-e95858c4f132) | 13.88 m |
| 0659 · Font de Talltorta | Talltorta | [Sin nombre](https://fontapp.net/fonts/f436451b-844a-477f-a76e-05742462a208) | 6.08 m |
| 1054 · Font de Can Rafel o de la Figuera | Cervelló | [Font de can Rafel o de la Figuera](https://fontapp.net/fonts/566ca1fc-5938-4e7b-a2bd-030ad4ef4586) | 20.05 m |
| 0929 · Font de Baix del Carrer del Fossar | Rupit i Pruit | [Font Bellaneda](https://fontapp.net/fonts/59f65b5d-9be0-45f7-9a06-b6ad9e70f071) | 135.72 m |
| 2812 · Font de la Falzia | Moià | [Font Falsía](https://fontapp.net/fonts/8d0dfb7f-cc13-445a-b09c-a8fd2d236363) | 19.96 m |
| 2649 · Font de Sant Cosme o Nova | Sant Joan Les Fonts | [Font Sant Cosme (Mina Anna Alzamora)](https://fontapp.net/fonts/b61e7d0c-41fe-4bab-8d5f-e181240d071b) | 5.76 m |
| 0044 · Font de la Feixa | Ger | [Font de la Feixa](https://fontapp.net/fonts/d12cf342-b30e-41f0-b1cd-2179d85f05f9) | 8.72 m |
| 1207 · Font de la Saleta | Centelles | [Font de la Saleta](https://fontapp.net/fonts/404f95a6-392e-48f5-b54b-8872a5883233) | 16.59 m |
| 2650 · Font dels Capellans | Sant Joan Les Fonts | [Font dels Capellans o Fontica](https://fontapp.net/fonts/555650fd-df95-428a-8069-0afeb221abc3) | 11.12 m |
| 1248 · Font de Can Sàbat | Gelida | [Font de can Sàbat](https://fontapp.net/fonts/928e3485-c48d-414a-8a25-b05e22de8bbd) | 0.00 m |
| 2800 · Font de Can Morral del Riu | Abrera | [Font de la Casa Rigla](https://fontapp.net/fonts/3cdc041d-baad-4505-9323-4eeee7cb43d1) | 221.07 m |
| 1232 · Font Vella | Terrassa | [Font Vella](https://fontapp.net/fonts/f8228739-eaf5-49c3-b020-8aefa7bd28aa) | 62.22 m |
| 0603 · Font de Sant Josep | L'Espluga de Francolí | [Font de la Santa Fe](https://fontapp.net/fonts/af2c2e9a-574c-483a-b735-e5f7e43a33f3) | 22.24 m |
| 2896 · Font de Baix d'Estaon | Estaon | [font](https://fontapp.net/fonts/6cb97dac-6da0-4ff9-9e39-07be5d760b3b) | 65.39 m |
| 2256 · Font de la Madriguera o del Gos | Taradell | [Font del Gos o Font de la Madriguera](https://fontapp.net/fonts/4f133367-0451-448a-99ba-0052a121714d) | 19.94 m |
| 0023 · Font del Senglar | Teià | [Font del Senglar](https://fontapp.net/fonts/57cd3f83-f712-4c1b-8f43-18ff0def4c83) | 18.03 m |
| 2883 · Font de Sant Feliu de Boada | Sant Feliu de Boada | [Sin nombre](https://fontapp.net/fonts/7b1524dc-962b-41ea-9455-5b9aed934003) | 6.19 m |
| 3134 · Surgències dels Prats de Baix | La Vall de Boí | [Font de Boí](https://fontapp.net/fonts/f7c5cd70-9885-458f-a9b5-d3280b567135) | 2002.83 m |
| 1692 · Font Negra | Berga | [Font Negra - Ajmt Berga](https://fontapp.net/fonts/e45063b0-3557-4178-9006-1c435d3bb179) | 0.00 m |
| 0057 · Font del Sofre | Llívia | [Font del Sofre](https://fontapp.net/fonts/dd6b1b1d-45cd-40bb-93a7-a97884213bfd) | 0.00 m |
| 3428 · Font del Safareig de les Avellanes | Les Avellanes | [Font de les Avellanes](https://fontapp.net/fonts/b9952c38-c60b-41a1-b5bf-c025eb93f418) | 108.29 m |
| 3091 · Font dels Enginyers | Bagà | [Sin nombre](https://fontapp.net/fonts/620fed58-2702-4b69-b2ff-7aecef0944ce) | 1123.71 m |
| 0222 · Font del Gavatx | Argentona | [Font del Gavatx](https://fontapp.net/fonts/8e8dc4ac-5cc7-4569-8628-bb34d7be9758) | 16.50 m |
| 1274 · Font dels Minyons | Viladrau | [Font de la Beguda o dels Brucs Bords o dels Minyons](https://fontapp.net/fonts/15cf2752-42ca-4731-8740-9d91c0229eca) | 45.24 m |
| 1819 · Font del Ferro | Tona | [Sin nombre](https://fontapp.net/fonts/f349e5ca-76bc-4061-ab65-ad0e07c4f28c) | 576.65 m |
| 0650 · Font de Núria | Queralbs | [Font del doctor Tarrés](https://fontapp.net/fonts/2a166d46-a85a-4795-97d9-533e92b115a1) | 23.22 m |
| 0444 · Font de la plaça del Casino | Alp | [Font de la Plaça del Casino](https://fontapp.net/fonts/e25ad5f2-f5a7-43e4-9797-6e0e55e77dbd) | 5.11 m |
| 2653 · Font de la Boada | Els Hostalets d'en Bas | [Font de la Boada](https://fontapp.net/fonts/bffca5c0-755d-41e9-86d4-060f685e811f) | 107.84 m |

## Reproducir

Extraer únicamente la tabla, sin conectar a una BD:

```sh
/opt/homebrew/opt/postgresql@18/bin/pg_restore --data-only --table=fonts --file=/tmp/fontapp-encos-fonts-20260913.sql /Users/mac/Backups/fontapp/fontapp-20260913-090003.dump
python3 import-data/encos/comparison-20260913/compare_backup.py
```

Se usa distancia haversine sobre coordenadas WGS84. El prefiltro acota latitud y longitud según el radio y se amplía hasta encontrar una vecina dentro del radio, sin limitar por país ni por una caja catalana fija. `results.json` conserva cada registro, la vecina más próxima y las candidatas dentro de 200 m.

Este backup no permite certificar el estado actual tras las altas, borrados o reubicaciones del 13 al 20 de septiembre.
