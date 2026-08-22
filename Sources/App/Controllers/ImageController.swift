import Fluent
import Foundation
import Vapor

// Subida de imágenes al disco local (/Public/uploads). Devuelve la URL relativa
// que luego se usa como campo `image` de una fuente.
// NOTA: almacenamiento local, no escala a producción; para eso migrar a S3/similar.
struct ImageController: RouteCollection {
    static let allowedExtensions = ["jpg", "jpeg", "png", "webp"]

    func boot(routes: RoutesBuilder) throws {
        let protected = routes.grouped(UserToken.authenticator(), User.guardMiddleware())
            // Coherente con las 30 fuentes/hora: quien documenta una ruta puede poner
            // una foto a cada una. Por usuario, no por IP compartida de una casa/refugio.
            .grouped(RateLimitMiddleware(scope: "image", max: 30, window: 60 * 60,
                                         identity: .authenticatedUser, errorCode: "image.rateLimit"))
        // Body grande: subir hasta 8 MB.
        protected.on(.POST, "images", body: .collect(maxSize: "8mb"), use: upload)
        // Lo que el móvil escribió dentro de la foto. **Solo admins**: la fecha y sobre
        // todo las coordenadas son dato personal de quien la subió, y esto existe para
        // moderar, no para enseñárselo a nadie más.
        protected.get("images", "meta", use: meta)
    }

    /// POST /images (multipart form-data, campo `file`) — guarda la imagen y devuelve su URL.
    @Sendable func upload(req: Request) async throws -> ImageUploadResponse {
        let payload = try req.content.decode(ImageUpload.self)

        let ext = (payload.file.extension ?? "").lowercased()
        guard Self.allowedExtensions.contains(ext) else {
            throw AppError(.unsupportedMediaType, "image.badFormat", "Formato no soportado (jpg, png, webp)")
        }

        let url = try await req.imageStorage.save(payload.file.data, ext: ext)

        // El EXIF lo lee el cliente del fichero ORIGINAL: nuestra compresión con canvas
        // reencoda el JPEG y borra todos los metadatos, así que cuando la imagen llega
        // aquí ya no queda nada que leer. Por eso viaja en campos aparte.
        //
        // Se guarda **siempre**, aunque venga todo vacío: así «no hay fila» significa
        // «subida antes de que esto existiera» y no se confunde con «no traía EXIF», que
        // es lo más normal del mundo y no es sospechoso de nada.
        if let photoID = PhotoExif.photoID(fromURL: url) {
            let exif = PhotoExif(
                photoID: photoID,
                takenAt: payload.takenAt.flatMap(ImageController.fecha(de:)),
                // Coordenadas imposibles fuera: un EXIF corrupto no debe guardarse como
                // si fuera un sitio.
                latitude: payload.latitude.flatMap { (-90...90).contains($0) ? $0 : nil },
                longitude: payload.longitude.flatMap { (-180...180).contains($0) ? $0 : nil },
                uploaderID: try? req.auth.require(User.self).requireID())
            // Que falle esto no puede tumbar una subida: la foto ya está guardada y es lo
            // que la persona venía a hacer. El dato de moderación es secundario.
            do { try await exif.save(on: req.db) } catch { req.logger.report(error: error) }
        }
        return ImageUploadResponse(url: url)
    }

    /// ISO-8601, con o sin fracciones de segundo (según el navegador).
    static func fecha(de texto: String) -> Date? {
        let conFraccion = ISO8601DateFormatter()
        conFraccion.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return conFraccion.date(from: texto) ?? ISO8601DateFormatter().date(from: texto)
    }

    struct MetaResponse: Content, Sendable {
        let photoID: UUID
        let takenAt: Date?
        let uploadedAt: Date?
        let latitude: Double?
        let longitude: Double?

        // Explícito, como todo opcional de esta API: el codificador sintetizado omite los
        // nulos y en el cliente `undefined !== null` ya nos ha costado dos pantallas.
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: Key.self)
            try c.encode(photoID, forKey: .photoID)
            try c.encode(takenAt, forKey: .takenAt)
            try c.encode(uploadedAt, forKey: .uploadedAt)
            try c.encode(latitude, forKey: .latitude)
            try c.encode(longitude, forKey: .longitude)
        }
        private enum Key: String, CodingKey { case photoID, takenAt, uploadedAt, latitude, longitude }
    }

    /// GET /images/meta?ids=uuid,uuid — **solo admins**.
    @Sendable func meta(req: Request) async throws -> [MetaResponse] {
        let user = try req.auth.require(User.self)
        guard user.isAdmin else { throw Abort(.forbidden) }
        let ids = (req.query[String.self, at: "ids"] ?? "")
            .split(separator: ",").compactMap { UUID(uuidString: String($0)) }
        guard !ids.isEmpty else { return [] }
        // Tope por si alguien construye una petición enorme a mano.
        let filas = try await PhotoExif.query(on: req.db)
            .filter(\.$photoID ~~ Array(ids.prefix(100))).all()
        return filas.map {
            MetaResponse(photoID: $0.photoID, takenAt: $0.takenAt, uploadedAt: $0.createdAt,
                         latitude: $0.latitude, longitude: $0.longitude)
        }
    }
}

struct ImageUpload: Content {
    var file: File
    /// EXIF leído en el cliente antes de comprimir. Opcionales porque la mayoría de las
    /// fotos no traen nada: lo que llega por mensajería viene limpio.
    ///
    /// La fecha viaja como **texto ISO-8601** y se interpreta abajo: el decodificador
    /// multipart de Vapor no promete ninguna estrategia concreta para `Date`, y enterarse
    /// de eso en producción sería tarde.
    var takenAt: String?
    var latitude: Double?
    var longitude: Double?
}

struct ImageUploadResponse: Content {
    let url: String
}
