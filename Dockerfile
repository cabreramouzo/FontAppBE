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
