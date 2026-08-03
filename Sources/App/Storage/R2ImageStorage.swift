import Foundation
import SotoCore
import SotoS3
import Vapor

/// Subida a Cloudflare R2 (compatible con S3). Guarda objetos bajo `uploads/<uuid>.<ext>`
/// y devuelve la URL pública (`publicBase` + key).
///
/// ⚠️ Compilado pero sin probar contra un bucket real; requiere credenciales R2.
struct R2ImageStorage: ImageStorage {
    let s3: S3
    let bucket: String
    let publicBase: String // p. ej. https://pub-xxxx.r2.dev (sin barra final)

    func save(_ data: ByteBuffer, ext: String) async throws -> String {
        let key = "uploads/\(UUID().uuidString).\(ext)"
        _ = try await s3.putObject(.init(
            body: .init(buffer: data),
            bucket: bucket,
            contentType: Self.contentType(for: ext),
            key: key
        ))
        return "\(publicBase)/\(key)"
    }

    func delete(_ reference: String) async throws {
        let prefix = publicBase + "/"
        guard reference.hasPrefix(prefix) else { return }
        let key = String(reference.dropFirst(prefix.count))
        _ = try await s3.deleteObject(.init(bucket: bucket, key: key))
    }

    func copy(_ reference: String) async throws -> String {
        let prefix = publicBase + "/"
        guard reference.hasPrefix(prefix) else { throw Abort(.badRequest, reason: "Referencia de imagen no válida") }
        let sourceKey = String(reference.dropFirst(prefix.count))
        let ext = (sourceKey as NSString).pathExtension
        let newKey = "uploads/\(UUID().uuidString).\(ext.isEmpty ? "jpg" : ext)"
        // `copySource` en Soto: "/<bucket>/<key>".
        _ = try await s3.copyObject(.init(bucket: bucket, copySource: "\(bucket)/\(sourceKey)", key: newKey))
        return "\(publicBase)/\(newKey)"
    }

    private static func contentType(for ext: String) -> String {
        switch ext {
        case "png": return "image/png"
        case "webp": return "image/webp"
        default: return "image/jpeg"
        }
    }
}

/// Cierra el `AWSClient` limpiamente al apagar la app (obligatorio en Soto).
struct AWSClientShutdown: LifecycleHandler {
    let client: AWSClient
    func shutdownAsync(_ application: Application) async throws {
        try await client.shutdown()
    }
}
