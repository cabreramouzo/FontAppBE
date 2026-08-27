# ================================
# Build image
# ================================
FROM swift:6.3-noble AS build

RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q dist-upgrade -y \
    && apt-get install -y libjemalloc-dev

WORKDIR /build

# Resolver dependencias primero (mejor cacheo de capas).
COPY ./Package.* ./
RUN swift package resolve --skip-update

# Y COMPILARLAS, que es lo que de verdad cuesta.
#
# Resolver solo descarga; el `swift build` de abajo va después de `COPY . .`, así que
# cualquier commit invalidaba esa capa y se recompilaba el árbol entero —Vapor, Fluent, el
# driver de Postgres, Soto, JWTKit, WebAuthn— aunque no hubieras tocado una dependencia en
# meses. Ahí estaba la mayor parte de los ~11 minutos del despliegue.
#
# SwiftPM no sabe compilar «solo las dependencias», así que se le da un fuente de relleno
# para que tenga algo que enlazar. Los artefactos quedan en `.build` y el build de verdad
# los reutiliza; el relleno se borra en la MISMA capa, o `Sources/App/main.swift` seguiría
# ahí después del `COPY . .` y habría dos puntos de entrada.
#
# Va con `|| true` a propósito: esto es una optimización, no un paso necesario. Si algún
# día el truco deja de funcionar —otra versión de SwiftPM, un target nuevo— el despliegue
# tiene que seguir saliendo, más lento, en vez de romperse.
#
# Medido con SwiftPM fuera de Docker: en frío con el relleno son **3.338 tareas y 126 s**;
# poniendo después el código de verdad, **151 tareas y 22 s**. O sea que lo que se reutiliza
# son las dependencias enteras.
RUN mkdir -p Sources/App \
    && printf 'print("relleno para precompilar dependencias")\n' > Sources/App/main.swift \
    && (swift build -c release --product App --static-swift-stdlib -Xlinker -ljemalloc || true) \
    && rm -rf Sources

# Compilar en release.
COPY . .
RUN swift build -c release --product App --static-swift-stdlib -Xlinker -ljemalloc

# Preparar artefactos de arranque.
WORKDIR /staging
RUN cp "$(swift build --package-path /build -c release --show-bin-path)/App" ./
RUN [ -d /build/Public ] && { mv /build/Public ./Public && chmod -R a-w ./Public; } || true
RUN [ -d /build/Resources ] && { mv /build/Resources ./Resources && chmod -R a-w ./Resources; } || true

# ================================
# Run image
# ================================
FROM ubuntu:noble

# `postgresql-client` (psql) va en la imagen de producción a propósito.
#
# Sin él, arreglar un destrozo en los datos exige **escribir un comando, compilarlo y
# desplegar**, que es lo que pasó al importar Italia por duplicado: la base tenía 8.728
# filas de más y no había forma de tocarlas desde la máquina. Media hora y un despliegue
# para un DELETE.
#
# No amplía el acceso de nadie: quien puede hacer `fly ssh console` ya tiene el
# `DATABASE_URL` en el entorno del proceso, así que la base ya estaba a su alcance con o
# sin cliente. Lo que añade es la herramienta, no el permiso. El coste es unos megas de
# imagen.
#
# Los arreglos repetibles siguen siendo comandos del binario (`dedupe-imported`,
# `clear-placeholder-names`): quedan en el repo, se prueban y se explican. `psql` es para
# lo irrepetible y lo urgente.

RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q dist-upgrade -y \
    && apt-get -q install -y libjemalloc2 ca-certificates tzdata postgresql-client \
    && rm -r /var/lib/apt/lists/*

RUN useradd --user-group --create-home --system --skel /dev/null --home-dir /app vapor
WORKDIR /app
COPY --from=build --chown=vapor:vapor /staging /app

USER vapor:vapor
EXPOSE 8080

ENTRYPOINT ["./App"]
CMD ["serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "8080"]
