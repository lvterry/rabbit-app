// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RabbitKit",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "RabbitKit",
            targets: ["RabbitKit"]),
    ],
    targets: [
        .target(
            name: "RabbitKit",
            dependencies: []
        ),
        .testTarget(
            name: "RabbitKitTests",
            dependencies: ["RabbitKit"]
        ),
    ]
)
