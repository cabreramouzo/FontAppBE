import Fluent
import FluentPostgresDriver
import Vapor

// Configuración de la aplicación: base de datos, migraciones y rutas.
public func configure(_ app: Application) async throws {
    // PostgreSQL. Toda la config sensible viene de variables de entorno
    // (ver env.development / docker-compose.yml). Nunca hardcodear secrets.
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

    // Hashing de contraseñas.
    app.passwords.use(.bcrypt)

    // CORS: necesario para un frontend web servido en otro origen.
    // En producción, restringir `allowedOrigin` a los dominios del front.
    let cors = CORSMiddleware(configuration: .init(
        allowedOrigin: .all,
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

    // Comandos CLI.
    app.asyncCommands.use(SeedCommand(), as: "seed")

    // Rutas.
    try routes(app)
}
