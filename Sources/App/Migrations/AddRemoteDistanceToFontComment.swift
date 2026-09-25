import Fluent

/// Reviews written far from the fountain: how far, and whether a moderator has looked.
///
/// `remote_distance_m` is the approximate distance (100 m steps, whole km past 10 km) between
/// the reviewer and the fountain **when the review was written**, and it is only set when
/// that was clearly more than a kilometre after allowing for the GPS accuracy. Null means
/// "near, or unknown" — no position, no permission or a vague fix — and that is the common
/// case. Only a distance is kept, never coordinates: enough to judge, without storing where
/// someone was.
///
/// Like `queued_offline` and the photo EXIF, the client asserts it and the server cannot
/// verify it, so nothing automatic hangs from it: it feeds a moderation lane
/// (`RemoteReviewController`), it does not hide the review or void its drops.
///
/// `remote_checked_at` takes a review out of that lane once someone has looked at it.
struct AddRemoteDistanceToFontComment: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("font_comments")
            .field("remote_distance_m", .int)
            .field("remote_checked_at", .datetime)
            .update()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("font_comments")
            .deleteField("remote_distance_m")
            .deleteField("remote_checked_at")
            .update()
    }
}
