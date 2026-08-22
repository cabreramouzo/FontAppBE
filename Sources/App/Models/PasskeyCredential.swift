import Fluent
import Foundation

final class PasskeyCredential: Model, @unchecked Sendable {
    static let schema = "passkey_credentials"
    @ID(key: .id) var id: UUID?
    @Field(key: "credential_id") var credentialID: String
    @Field(key: "public_key") var publicKey: Data
    @Field(key: "sign_count") var signCount: Int64
    @Field(key: "label") var label: String
    @Parent(key: "user_id") var user: User
    @Timestamp(key: "created_at", on: .create) var createdAt: Date?
    @Timestamp(key: "last_used_at", on: .none) var lastUsedAt: Date?
    init() {}
    init(credentialID: String, publicKey: Data, signCount: UInt32, label: String, userID: UUID) {
        self.credentialID = credentialID; self.publicKey = publicKey
        self.signCount = Int64(signCount); self.label = label; self.$user.id = userID
    }
}

final class PasskeyChallenge: Model, @unchecked Sendable {
    static let schema = "passkey_challenges"
    @ID(key: .id) var id: UUID?
    @Field(key: "challenge") var challenge: Data
    @Field(key: "purpose") var purpose: String
    @OptionalParent(key: "user_id") var user: User?
    @Field(key: "expires_at") var expiresAt: Date
    init() {}
    init(challenge: [UInt8], purpose: String, userID: UUID?) {
        self.challenge = Data(challenge); self.purpose = purpose
        self.$user.id = userID; self.expiresAt = Date().addingTimeInterval(5 * 60)
    }
}
