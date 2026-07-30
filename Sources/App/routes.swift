import Fluent
import Vapor

func routes(_ app: Application) throws {
    app.get { _ async in
        "FontAppBE up ✅"
    }

    app.get("health") { _ async -> HTTPStatus in
        .ok
    }

    try app.register(collection: AuthController())
    try app.register(collection: UserController())
    try app.register(collection: FontController())
    try app.register(collection: FontReportController())
    try app.register(collection: FontCommentController())
    try app.register(collection: FlagController())
    try app.register(collection: ImageController())
}
