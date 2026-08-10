import Foundation
import Vapor

// Subida de imágenes al disco local (/Public/uploads). Devuelve la URL relativa
// que luego se usa como campo `image` de una fuente.
// NOTA: almacenamiento local, no escala a producción; para eso migrar a S3/similar.
struct ImageController: RouteCollection {
    static let allowedExtensions = ["jpg", "jpeg", "png", "webp"]

    func boot(routes: RoutesBuilder) throws {
        let protected = routes.grouped(UserToken.authenticator(), User.guardMiddleware())
            // Cada foto ocupa espacio en R2 y se paga: una por fuente o reseña es lo
            // normal, 60 en una hora ya es otra cosa.
            .grouped(RateLimitMiddleware(scope: "image", max: 60, window: 60 * 60))
        // Body grande: subir hasta 8 MB.
        protected.on(.POST, "images", body: .collect(maxSize: "8mb"), use: upload)
    }

    /// POST /images (multipart form-data, campo `file`) — guarda la imagen y devuelve su URL.
    @Sendable func upload(req: Request) async throws -> ImageUploadResponse {
        let payload = try req.content.decode(ImageUpload.self)

        let ext = (payload.file.extension ?? "").lowercased()
        guard Self.allowedExtensions.contains(ext) else {
            throw Abort(.unsupportedMediaType, reason: "Formato no soportado (jpg, png, webp)")
        }

        let url = try await req.imageStorage.save(payload.file.data, ext: ext)
        return ImageUploadResponse(url: url)
    }
}

struct ImageUpload: Content {
    var file: File
}

struct ImageUploadResponse: Content {
    let url: String
}
