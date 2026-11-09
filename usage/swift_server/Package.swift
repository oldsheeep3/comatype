// swift-tools-version: 5.9
import PackageDescription

// The generated code is the target ComatypeGen (Sources/ComatypeGen); the sample files in this directory are the target App.
// The Swift runtime is not published to a registry yet (SwiftPM needs Package.swift at the repository root), so it is a local package.
let package = Package(
    name: "usage-swift-server",
    platforms: [.macOS(.v12), .iOS(.v15)],
    dependencies: [.package(path: "../../packages/swift")],
    targets: [
        .target(name: "ComatypeGen", dependencies: [.product(name: "Comatype", package: "swift")]),
        .target(
            name: "App",
            dependencies: ["ComatypeGen", .product(name: "Comatype", package: "swift")],
            path: ".",
            exclude: ["Sources", "Package.swift"]
        ),
    ]
)
