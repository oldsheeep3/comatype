// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Comatype",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [
        .library(name: "Comatype", targets: ["Comatype"]),
    ],
    targets: [
        .target(name: "Comatype"),
        .executableTarget(name: "comatype-selftest", dependencies: ["Comatype"], path: "Sources/ComatypeSelfTest"),
    ],
    swiftLanguageVersions: [.v5]
)
