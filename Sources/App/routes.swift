import Fluent
import Vapor

func routes(_ app: Application) throws {
    app.get { _ async in
        "FontAppBE up ✅"
    }

    app.get("health") { _ async -> HTTPStatus in
        .ok
    }

    try app.register(collection: UserController())
    try app.register(collection: FontController())
}
