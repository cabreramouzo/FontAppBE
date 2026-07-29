import Fluent
import FluentPostgresDriver
import Vapor

// Configuración de la aplicación: base de datos, migraciones y rutas.
public func configure(_ app: Application) async throws {
    // PostgreSQL. Config sólo por variables de entorno; nunca hardcodear secrets.
    // Preferimos DATABASE_URL (lo típico en PaaS: Fly, Railway, Render, Heroku);
    // si no, caemos a variables sueltas (dev local).
    if let databaseURL = Environment.get("DATABASE_URL") {
        app.databases.use(
            .postgres(configuration: try SQLPostgresConfiguration(url: databaseURL)),
            as: .psql
        )
    } else {
        // En producción las credenciales son obligatorias: si faltan, fallamos al
        // arrancar en vez de conectar con credenciales débiles por defecto.
        func requireInProduction(_ key: String, default fallback: String) throws -> String {
            if let value = Environment.get(key) { return value }
            guard app.environment != .production else {
                throw Abort(.internalServerError, reason: "Falta la variable de entorno obligatoria \(key) en producción")
            }
            return fallback
        }

        app.databases.use(
            .postgres(
                configuration: SQLPostgresConfiguration(
                    hostname: Environment.get("DATABASE_HOST") ?? "localhost",
                    port: Environment.get("DATABASE_PORT").flatMap(Int.init(_:))
                        ?? SQLPostgresConfiguration.ianaPortNumber,
                    username: try requireInProduction("DATABASE_USERNAME", default: "vapor"),
                    password: try requireInProduction("DATABASE_PASSWORD", default: "vapor"),
                    database: try requireInProduction("DATABASE_NAME", default: "fontapp"),
                    tls: .disable
                )
            ),
            as: .psql
        )
    }

    // Hashing de contraseñas.
    app.passwords.use(.bcrypt)

    // CORS. En dev se permite cualquier origen; en producción se restringe a
    // WEB_ORIGIN (uno o varios dominios separados por comas).
    let allowedOrigin: CORSMiddleware.AllowOriginSetting
    if let webOrigin = Environment.get("WEB_ORIGIN") {
        allowedOrigin = .any(webOrigin.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
    } else {
        allowedOrigin = .all
    }
    let cors = CORSMiddleware(configuration: .init(
        allowedOrigin: allowedOrigin,
        allowedMethods: [.GET, .POST, .PUT, .DELETE, .OPTIONS],
        allowedHeaders: [.accept, .authorization, .contentType, .origin]
    ))
    app.middleware.use(cors, at: .beginning)

    // Sirve ficheros estáticos de /Public (incluye las imágenes subidas en /Public/uploads).
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.publicDirectory))

    // Migraciones: una por modelo.
    app.migrations.add(CreateUser())
    app.migrations.add(CreateUserToken())
    app.migrations.add(CreateFont())
    app.migrations.add(CreateFontReport())
    app.migrations.add(CreateFontComment())
    app.migrations.add(AddUserToFontReport())
    app.migrations.add(AddUserToFontComment())
    app.migrations.add(AddReviewFieldsToFontComment())

    // Migración automática al arrancar si AUTO_MIGRATE=true (cómodo en despliegues
    // de un solo contenedor: la app migra sola en el primer boot).
    if Environment.get("AUTO_MIGRATE") == "true" {
        try await app.autoMigrate()
    }

    // Comandos CLI.
    app.asyncCommands.use(SeedCommand(), as: "seed")

    // Rutas.
    try routes(app)
}
