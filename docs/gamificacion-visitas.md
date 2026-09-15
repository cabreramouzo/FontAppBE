# Ideas de gamificación — Visitas a fuentes

Documento de ideación para incentivar que la gente visite físicamente las fuentes,
aunque ya estén reseñadas. Inspirado en el check-in de Foursquare/Swarm (con su
figura del "alcalde") y en mecánicas de Pokémon GO.

Las ideas están ordenadas de más sencillas a más ambiciosas. Al final hay una
propuesta de MVP.

## 1. Check-in con geolocalización (base de todo)

El corazón del sistema, estilo Foursquare/Swarm:

* **Check-in validado por GPS:** solo cuenta si el usuario está a <50 m de la
  fuente. Evita "check-ins de sofá".
* **Anti-trampas:**
  * Cooldown por fuente (p. ej. 1 check-in cada 6–12 h).
  * Opcionalmente, pedir una foto del momento o resolver un mini-reto in-situ
    (ver sección 5).
* Cada check-in otorga puntos/XP que alimentan el resto de mecánicas.

## 2. "Alcalde" / Guardián de la fuente

La mecánica clásica de Foursquare:

* Quien más check-ins acumula en los últimos 60 días es el **Guardián** de esa
  fuente. Se usa una ventana móvil, no el histórico total, para que el título
  sea reconquistable y no lo monopolice el primer usuario.
* **Beneficios del Guardián:** insignia visible, avatar en la ficha de la fuente,
  posible bonus de puntos.
* **Notificación de destronamiento:** cuando alguien te arrebata el título,
  recibes un aviso. Es uno de los mayores ganchos emocionales (rivalidad sana).

## 3. Mecánicas tipo Pokémon GO

### Captura / colección

* Cada fuente es un coleccionable. Un **"Pokédex de fuentes"** muestra
  visitadas vs. totales de la ciudad/país. Engancha al perfil completista.
* **Rarezas:** fuentes comunes, raras y legendarias (históricas, monumentales o
  difíciles de alcanzar). Las raras dan más recompensa e incentivan salir de la
  ruta habitual.

### Eventos temporales

* **Fuente destacada de la semana:** check-in con puntos x2. Rota entre fuentes
  poco visitadas para redistribuir el tráfico.
* **Eventos por temporada/clima:** "Ruta del agua fresca" en verano, fuentes
  iluminadas en Navidad, etc.

### Rutas / distancia

* Recompensar la distancia caminada entre fuentes (como incubar huevos).
  Reto tipo "Visita 5 fuentes distintas hoy".

## 4. Retos, rachas y niveles

* **Rachas (streaks) diarias/semanales:** mantener X días seguidos con al menos
  un check-in.
* **Misiones:** "Visita 3 fuentes de un barrio", "Sé el primero en reseñar una
  fuente sin reseñas", "Visita una fuente al amanecer".
* **Niveles de perfil con títulos:** Sediento → Explorador → Cartógrafo →
  Maestro de fuentes.

## 5. Que aporte valor real (no gamificación vacía)

Clave para que las visitas repetidas sí sumen, aunque la fuente ya esté reseñada,
y a la vez sirve para verificar la visita:

* **Reto de foto/dato in-situ:** al hacer check-in, pedir una foto actual o
  responder "¿mana agua ahora mismo? ¿está limpia?".
* Cada visita actualiza el estado real de la fuente (funciona / seca /
  vandalizada), información útil para toda la comunidad.
* Convierte la gamificación en **crowdsourcing de mantenimiento:** la gente juega
  y de paso mantiene los datos frescos.

## 6. Social / competitivo

* **Rankings:** global, por ciudad y entre amigos (los rankings de amigos
  retienen mucho más que el global).
* **Equipos/facciones** (como en Pokémon GO): las fuentes "pertenecen" al equipo
  con más check-ins. Fomenta comunidad y competición local.
* **Compartir logros** con una imagen generada atractiva (bueno para captación
  viral).

## Recomendación de MVP

Empezar por lo que da más enganche con menos esfuerzo:

1. **Check-in por GPS con puntos** — base imprescindible.
2. **Guardián de la fuente** con ventana de 60 días + notificación de
   destronamiento — el gancho emocional más fuerte.
3. **Pokédex de fuentes visitadas + rachas** — progresión personal.

**Diferenciador con propósito:** el mini-reto de estado in-situ en el check-in,
que hace que las visitas repetidas aporten valor aunque la fuente ya esté
reseñada.

## Entidades candidatas (borrador)

* `CheckIn` — usuario, fuente, timestamp, ubicación GPS, foto/estado opcional.
* `Guardian` — fuente, usuario actual, ventana de cálculo.
* `Fountain.rarity` — común / rara / legendaria.
* `Fountain.status` — funciona / seca / vandalizada (última actualización).
* `UserProfile` — XP, nivel, racha actual, colección de fuentes visitadas.
* `Mission` / `Event` — retos temporales y de temporada.
