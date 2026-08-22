import Fluent
import Foundation

/// Identidad externa estable. El correo es perfil mutable; `(provider, subject)` es la
/// clave que Google/Apple garantizan y la única que sirve para volver a entrar.
final class AuthIdentity: Model, @unchecked Sendable {
    static let schema = "auth_identities"

    @ID(key: .id) var id: UUID?
    @Field(key: "provider") var provider: String
    @Field(key: "subject") var subject: String
    @Parent(key: "user_id") var user: User
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?

    init() {}
    init(provider: String, subject: String, userID: UUID) {
        self.provider = provider
        self.subject = subject
        self.$user.id = userID
    }
}
