import Foundation
import Vapor

/// Almacén de imágenes: guarda los bytes y devuelve la referencia (ruta o URL) que se
/// guarda en BD; y borra por esa misma referencia. Desacopla el "dónde" del resto del código.
protocol ImageStorage: Sendable {
    func save(_ data: ByteBuffer, ext: String) async throws -> String
    func delete(_ reference: String) async throws
    /// Copia un objeto ya almacenado y devuelve una **referencia nueva e independiente**.
    /// Se usa al promover la foto de una reseña a foto principal de la fuente, para que
    /// no compartan el mismo fichero (borrar una no rompería la otra).
    func copy(_ reference: String) async throws -> String
}

/// Disco local (dev / volumen persistente). Se sirve en `/uploads` vía FileMiddleware.
struct LocalImageStorage: ImageStorage {
    let directory: String // publicDirectory

    func save(_ data: ByteBuffer, ext: String) async throws -> String {
        let filename = "\(UUID().uuidString).\(ext)"
        let dir = directory + "uploads/"
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        var buffer = data
        let bytes = buffer.readBytes(length: buffer.readableBytes) ?? []
        try Data(bytes).write(to: URL(fileURLWithPath: dir + filename))
        return "/uploads/\(filename)"
    }

    func delete(_ reference: String) async throws {
        guard let filename = Self.safeFilename(reference) else { return }
        try? FileManager.default.removeItem(atPath: directory + "uploads/" + filename)
    }

    func copy(_ reference: String) async throws -> String {
        guard let source = Self.safeFilename(reference) else {
            throw Abort(.badRequest, reason: "Referencia de imagen no válida")
        }
        let ext = (source as NSString).pathExtension
        let filename = "\(UUID().uuidString).\(ext.isEmpty ? "jpg" : ext)"
        let dir = directory + "uploads/"
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try FileManager.default.copyItem(atPath: dir + source, toPath: dir + filename)
        return "/uploads/\(filename)"
    }

    /// La referencia `image` la guarda el cliente, así que puede ser hostil.
    /// Aceptamos solo `/uploads/<archivo>` con un único componente (sin separadores
    /// ni `..`), para que nunca se resuelva fuera del directorio de subidas.
    static func safeFilename(_ reference: String) -> String? {
        guard reference.hasPrefix("/uploads/") else { return nil }
        let filename = String(reference.dropFirst("/uploads/".count))
        guard !filename.isEmpty, !filename.contains("/"), !filename.contains("..") else { return nil }
        return filename
    }
}

private struct ImageStorageKey: StorageKey {
    typealias Value = any ImageStorage
}

extension Application {
    var imageStorage: any ImageStorage {
        get { storage[ImageStorageKey.self] ?? LocalImageStorage(directory: directory.publicDirectory) }
        set { storage[ImageStorageKey.self] = newValue }
    }
}

extension Request {
    var imageStorage: any ImageStorage { application.imageStorage }
}
