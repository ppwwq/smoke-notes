import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let sourceURL = URL(fileURLWithPath: "apps/desktop/build/icon.png")
let outputURL = URL(fileURLWithPath: "apps/ios/Sources/Jotday/Assets.xcassets/AppIcon.appiconset/Jotday.png")
let size = 1024

guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let source = CGImageSourceCreateImageAtIndex(imageSource, 0, nil),
      source.width == source.height else {
    fail("Run from the repository root with the square apps/desktop/build/icon.png present.")
}

guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let canvas = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: colorSpace, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
      ) else {
    fail("Could not create the iOS app icon canvas.")
}

let bounds = CGRect(x: 0, y: 0, width: size, height: size)
canvas.setFillColor(red: 237.0 / 255, green: 233.0 / 255, blue: 251.0 / 255, alpha: 1)
canvas.fill(bounds)
canvas.interpolationQuality = .high
canvas.draw(source, in: bounds)

guard let image = canvas.makeImage(),
      let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fail("Could not create \(outputURL.path).")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    fail("Could not save \(outputURL.path).")
}
