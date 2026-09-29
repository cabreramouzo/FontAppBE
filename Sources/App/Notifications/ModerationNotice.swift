import Fluent
import SQLKit
import Vapor

/// Records a moderation decision and tells the affected author, in one place.
///
/// Before this, deleting a reported review or photo from `/admin/moderation` asked the
/// moderator for a reason (fake, spam, abuse) and then threw it away, and the author
/// simply found their content gone. Now every removal leaves a row in
/// `moderation_actions` with the reason, and the author gets a bell notice saying what
/// was removed and why. No push: it does not change what they are about to do.
///
/// The notice has **no actor** on purpose: it is a decision of the house, and who took it
/// is not the author's business — the same rule as `sourceLimit`. The excerpt is a code
/// (`comment:spam`), not a sentence; the browser composes it in the reader's language.
enum ModerationNotice {
    static let reasons: Set<String> = ["fake", "spam", "abuse"]

    /// Reads the optional `?reason=` of a moderator's DELETE. `nil` when absent, 400 when
    /// it is not one of the known reasons.
    static func reason(from req: Request) throws -> String? {
        guard let reason = req.query[String.self, at: "reason"] else { return nil }
        guard reasons.contains(reason) else { throw Abort(.badRequest, reason: "Motivo no válido") }
        return reason
    }

    /// `target` is `font`, `comment` or `photo`. Nothing is sent when the moderator is the
    /// author: removing your own content is not a sanction.
    static func record(on db: any Database, target: String, reason: String,
                       fontID: UUID?, subjectID: UUID?, actorID: UUID?) async throws {
        if let sql = db as? SQLDatabase {
            try await sql.raw("""
                INSERT INTO moderation_actions (id, font_id, subject_user_id, actor_id, action, reason, created_at)
                VALUES (\(bind: UUID()), \(bind: fontID), \(bind: subjectID), \(bind: actorID),
                        \(bind: "remove_" + target), \(bind: reason), CURRENT_TIMESTAMP)
                """).run()
        }
        guard let subjectID, subjectID != actorID else { return }
        var fontName: String?
        if let fontID { fontName = try await Font.find(fontID, on: db)?.name }
        try await Notification(userID: subjectID, kind: .contentRemoved, actorID: nil, actorName: "",
                               fontID: fontID, fontName: fontName,
                               excerpt: "\(target):\(reason)").save(on: db)
    }
}
