import Fluent
import SQLKit
import Vapor

/// Recovery is a transition between reports, never an inference from missing data.
enum WaterRecovery {
    static func isRecovery(previous: String?, current: String?) -> Bool {
        ["dry", "broken", "gone"].contains(previous ?? "") &&
            ["flowing", "trickle"].contains(current ?? "")
    }

    /// Serialize new reports for this fountain so simultaneous water reports do not
    /// both announce the same recovery. The report and decision commit together.
    static func save(_ comment: FontComment, on db: any Database) async throws -> Bool {
        try await db.transaction { transaction in
            guard let sql = transaction as? any SQLDatabase else {
                throw Abort(.internalServerError)
            }
            try await sql.raw("SELECT id FROM fonts WHERE id = \(bind: comment.$font.id) FOR UPDATE").run()
            let previous = try await FontComment.query(on: transaction)
                .filter(\.$font.$id == comment.$font.id)
                .filter(\.$waterStatus != nil)
                .sort(\.$createdAt, .descending)
                .first()
            let recovered = isRecovery(previous: previous?.waterStatus, current: comment.waterStatus)
            try await comment.save(on: transaction)
            return recovered
        }
    }
}
