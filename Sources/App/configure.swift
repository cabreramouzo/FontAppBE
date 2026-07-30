import Fluent
import FluentPostgresDriver
import SotoCore
import SotoS3
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

    // Límite de tamaño de cuerpo por defecto (JSON pequeño). La subida de imágenes
    // sube su propio límite a 8 MB en su ruta.
    app.routes.defaultMaxBodySize = "256kb"

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

    // Almacenamiento de imágenes: Cloudflare R2 si hay credenciales; si no, disco local.
    if let endpoint = Environment.get("R2_ENDPOINT"),
       let accessKey = Environment.get("R2_ACCESS_KEY_ID"),
       let secret = Environment.get("R2_SECRET_ACCESS_KEY"),
       let bucket = Environment.get("R2_BUCKET"),
       let publicBase = Environment.get("R2_PUBLIC_URL") {
        let awsClient = AWSClient(credentialProvider: .static(accessKeyId: accessKey, secretAccessKey: secret))
        let s3 = S3(client: awsClient, region: .init(rawValue: "auto"), endpoint: endpoint)
        let base = publicBase.hasSuffix("/") ? String(publicBase.dropLast()) : publicBase
        app.imageStorage = R2ImageStorage(s3: s3, bucket: bucket, publicBase: base)
        app.lifecycle.use(AWSClientShutdown(client: awsClient))
    }

    // Envío de correo: Resend si hay credenciales; si no, log (dev). Ver MailSender.
    if let apiKey = Environment.get("RESEND_API_KEY"), let from = Environment.get("MAIL_FROM") {
        app.mailSender = ResendMailSender(apiKey: apiKey, from: from)
    }

    // Migraciones: una por tabla (esquema consolidado; orden = dependencias de FKs).
    app.migrations.add(CreateUser())
    app.migrations.add(CreateUserToken())
    app.migrations.add(CreateFont())            // referencia a users (created_by)
    app.migrations.add(CreateFontReport())      // referencia a fonts + users
    app.migrations.add(CreateFontComment())     // referencia a fonts + users
    app.migrations.add(CreateFontConfirmation()) // referencia a font_comments + users
    app.migrations.add(CreatePasswordReset())   // referencia a users
    app.migrations.add(CreateContentFlag())     // referencia a users

    // Migración automática al arrancar si AUTO_MIGRATE=true (cómodo en despliegues
    // de un solo contenedor: la app migra sola en el primer boot).
    if Environment.get("AUTO_MIGRATE") == "true" {
        try await app.autoMigrate()
    }

    // Limpieza periódica de tokens de sesión caducados (cada 6 h). En memoria/sin deps.
    app.eventLoopGroup.next().scheduleRepeatedTask(initialDelay: .minutes(10), delay: .hours(6)) { _ in
        Task {
            try? await UserToken.query(on: app.db).filter(\.$expiresAt < Date()).delete()
        }
    }

    // Comandos CLI.
    app.asyncCommands.use(SeedCommand(), as: "seed")
    app.asyncCommands.use(ImportCommand(), as: "import-fonts")

    // Rutas.
    try routes(app)
}
