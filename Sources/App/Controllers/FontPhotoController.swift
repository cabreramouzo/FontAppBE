import Fluent
import Vapor

/// Las fotos secundarias de una fuente: la galería que hay detrás de «otras fotos».
///
/// ## Por qué es una ruta aparte y no un campo más de la ficha
///
/// La portada vive en `fonts.image` y se queda ahí. `GET /fonts` y el mapa devuelven
/// miles de fuentes de una vez, y meter la galería en esa respuesta —o hasta un `COUNT`
/// por fuente— sería pagar un join por cada punto del mapa para un dato que casi nadie
/// mira. Esto solo se pide cuando alguien abre la galería, que es cuando importa.
///
/// ## Quién puede subir qué
///
/// - `document` (informe de salubridad, cartel, aviso): **cualquiera con sesión**. Nace
///   de un caso real —un geólogo con el análisis del agua— y quien tiene ese papel puede
///   haberse registrado esta mañana. Poner una puerta de nivel delante cerraría justo la
///   aportación más valiosa.
/// - `fountain` y `context`: **nivel 3** (`Capabilities.addSecondaryPhoto`). Ahí sí hay
///   ruido posible —cinco veces el mismo ángulo— y la puerta filtra sin perder nada.
///
/// El tope por persona y fuente es para las de la fuente, no para los documentos: dos
/// análisis de años distintos son dos datos, y cinco fotos del mismo caño no.
struct FontPhotoController: RouteCollection {
    /// Fotos `fountain`/`context` que puede subir una persona a una misma fuente.
    static let perPersonLimit = 3

    func boot(routes: any RoutesBuilder) throws {
        let fotos = routes.grouped("fonts", ":fontID", "photos")
        fotos.get(use: index)

        let protected = fotos.grouped(UserToken.authenticator(), User.guardMiddleware())
        protected.post(use: create)
        protected.delete(":photoID", use: destroy)
    }

    /// Lo que sale por la API. El autor va como `{id, username}` y no entero: aquí hace
    /// falta para enlazar y dar crédito, no el perfil completo.
    struct PhotoResponse: Content {
        let id: UUID
        let url: String
        let kind: PhotoKind
        let caption: String?
        let createdAt: Date?
        let uploader: Uploader

        /// `caption` y `createdAt` van explícitos por la misma razón de siempre: el
        /// codificador sintetizado omite los opcionales nulos y en el cliente llegan como
        /// `undefined`. Aquí hoy no rompe nada, pero es la cuarta vez que aparece el
        /// patrón en este proyecto y ya no merece la pena confiar en que no romperá.
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(id, forKey: .id)
            try c.encode(url, forKey: .url)
            try c.encode(kind, forKey: .kind)
            try c.encode(caption, forKey: .caption)
            try c.encode(createdAt, forKey: .createdAt)
            try c.encode(uploader, forKey: .uploader)
        }

        struct Uploader: Content {
            let id: UUID?
            let username: String?

            /// Explícito, como en `Font.creator`: omitido, el cliente lee `undefined` y la
            /// comprobación de «no consta autor» falla. Tercera vez en este proyecto.
            func encode(to encoder: any Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(id, forKey: .id)
                try c.encode(username, forKey: .username)
            }
        }
    }

    /// GET /fonts/:fontID/photos — la galería. Pública.
    @Sendable func index(req: Request) async throws -> [PhotoResponse] {
        guard let fontID = req.parameters.get("fontID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Identificador de fuente no válido")
        }
        let fotos = try await FontPhoto.query(on: req.db)
            .filter(\.$font.$id == fontID)
            .sort(\.$createdAt, .descending)
            .with(\.$uploader)
            .all()
        return fotos.compactMap { f in
            guard let id = f.id else { return nil }
            return PhotoResponse(
                id: id, url: f.url, kind: f.kind, caption: f.caption, createdAt: f.createdAt,
                uploader: .init(id: f.$uploader.id, username: f.uploader?.username))
        }
    }

    struct CreatePhotoDTO: Content {
        let url: String
        let kind: PhotoKind
        let caption: String?
    }

    /// POST /fonts/:fontID/photos
    @Sendable func create(req: Request) async throws -> PhotoResponse {
        let user = try req.auth.require(User.self)
        guard let fontID = req.parameters.get("fontID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Identificador de fuente no válido")
        }
        guard try await Font.find(fontID, on: req.db) != nil else {
            throw Abort(.notFound, reason: "Fuente no encontrada")
        }
        let dto = try req.content.decode(CreatePhotoDTO.self)
        guard !dto.url.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw Abort(.badRequest, reason: "Falta la imagen")
        }
        if let caption = dto.caption, caption.count > 200 {
            throw Abort(.badRequest, reason: "La descripción es demasiado larga")
        }

        let userID = try user.requireID()

        // Los documentos pasan sin puerta; ver el comentario de arriba.
        if dto.kind != .document {
            guard try await Capabilities.has(.addSecondaryPhoto, user, on: req.db) else {
                throw Abort(.forbidden, reason: "Todavía no puedes añadir fotos de la fuente")
            }
            let mias = try await FontPhoto.query(on: req.db)
                .filter(\.$font.$id == fontID)
                .filter(\.$uploader.$id == userID)
                .filter(\.$kind != PhotoKind.document)
                .count()
            guard mias < Self.perPersonLimit else {
                throw Abort(.tooManyRequests, reason: "Ya has añadido bastantes fotos de esta fuente")
            }
        }

        let foto = FontPhoto(fontID: fontID, url: dto.url, kind: dto.kind,
                             uploaderID: userID, caption: dto.caption)
        try await foto.save(on: req.db)
        return PhotoResponse(
            id: try foto.requireID(), url: foto.url, kind: foto.kind, caption: foto.caption,
            createdAt: foto.createdAt, uploader: .init(id: userID, username: user.username))
    }

    /// DELETE /fonts/:fontID/photos/:photoID — quien la subió, o un moderador.
    ///
    /// Moderador y no solo admin: esto es contenido de otra persona en una ficha pública,
    /// que es exactamente lo que modera un moderador. El creador de la fuente **no** entra
    /// aquí: la ficha no es suya y no debería poder borrar el análisis que aportó alguien.
    @Sendable func destroy(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        guard let photoID = req.parameters.get("photoID", as: UUID.self),
              let foto = try await FontPhoto.find(photoID, on: req.db) else {
            throw Abort(.notFound, reason: "Foto no encontrada")
        }
        let userID = try user.requireID()
        guard foto.$uploader.id == userID || user.canModerate else {
            throw Abort(.forbidden, reason: "No puedes borrar esta foto")
        }
        // El fichero se borra en best-effort, igual que en fuentes y reseñas: si falla,
        // queda un huérfano en el disco y no una petición rota.
        try? await req.imageStorage.delete(foto.url)
        try await foto.delete(on: req.db)
        return .noContent
    }
}
