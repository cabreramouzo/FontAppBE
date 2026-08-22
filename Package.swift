// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "FontAppBE",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.106.0"),
        .package(url: "https://github.com/vapor/fluent.git", from: "4.11.0"),
        .package(url: "https://github.com/vapor/fluent-postgres-driver.git", from: "2.9.0"),
        // Cliente S3 para subir imágenes a Cloudflare R2 (compatible con S3).
        .package(url: "https://github.com/soto-project/soto.git", from: "7.0.0"),
        // Verificación local de los ID tokens OIDC (Google ahora; Apple reutilizará esto).
        .package(url: "https://github.com/vapor/jwt-kit.git", from: "5.6.0"),
    ],
    targets: [
        .executableTarget(
            name: "App",
            dependencies: [
                .product(name: "Fluent", package: "fluent"),
                .product(name: "FluentPostgresDriver", package: "fluent-postgres-driver"),
                .product(name: "Vapor", package: "vapor"),
                .product(name: "SotoS3", package: "soto"),
                .product(name: "JWTKit", package: "jwt-kit"),
            ]
        ),
        .testTarget(
            name: "AppTests",
            dependencies: [
                .target(name: "App"),
                .product(name: "XCTVapor", package: "vapor"),
            ]
        ),
    ]
)
