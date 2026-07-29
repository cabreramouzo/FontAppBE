import Foundation
import Vapor

/// Almacén de imágenes: guarda los bytes y devuelve la referencia (ruta o URL) que se
/// guarda en BD; y borra por esa misma referencia. Desacopla el "dónde" del resto del código.
protocol ImageStorage: Sendable {
    func save(_ data: ByteBuffer, ext: String) async throws -> String
    func delete(_ reference: String) async throws
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
        guard reference.hasPrefix("/uploads/") else { return }
        let filename = String(reference.dropFirst("/uploads/".count))
        try? FileManager.default.removeItem(atPath: directory + "uploads/" + filename)
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
