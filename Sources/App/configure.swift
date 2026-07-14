import Fluent
import FluentPostgresDriver
import Vapor

// Configuración de la aplicación: base de datos, migraciones y rutas.
public func configure(_ app: Application) async throws {
    // PostgreSQL. Toda la config sensible viene de variables de entorno
    // (ver env.development / docker-compose.yml). Nunca hardcodear secrets.
    app.databases.use(
        .postgres(
            configuration: SQLPostgresConfiguration(
                hostname: Environment.get("DATABASE_HOST") ?? "localhost",
                port: Environment.get("DATABASE_PORT").flatMap(Int.init(_:))
                    ?? SQLPostgresConfiguration.ianaPortNumber,
                username: Environment.get("DATABASE_USERNAME") ?? "vapor",
                password: Environment.get("DATABASE_PASSWORD") ?? "vapor",
                database: Environment.get("DATABASE_NAME") ?? "fontapp",
                tls: .disable
            )
        ),
        as: .psql
    )

    // Hashing de contraseñas.
    app.passwords.use(.bcrypt)

    // Migraciones: una por modelo.
    app.migrations.add(CreateUser())
    app.migrations.add(CreateFont())
    app.migrations.add(CreateFontReport())
    app.migrations.add(CreateFontComment())

    // Rutas.
    try routes(app)
}
