import Foundation

public struct ZVShareVideoSettings {
  public let quality: String
  public let framesPerSecond: Int
  public let shortEdge: Int
  public let longEdge: Int
  public let maxBitrate: Int

  public init(quality: String?, framesPerSecond: Int?) {
    let presets = ["540p": (540, 960, 2_000_000), "720p": (720, 1280, 4_000_000),
      "1080p": (1080, 1920, 8_000_000), "1440p": (1440, 2560, 14_000_000)]
    self.quality = presets[quality ?? ""] == nil ? "720p" : quality!
    let preset = presets[self.quality]!
    self.shortEdge = preset.0; self.longEdge = preset.1
    self.framesPerSecond = [15, 24, 30, 60].contains(framesPerSecond ?? 0) ? framesPerSecond! : 30
    self.maxBitrate = preset.2 * self.framesPerSecond / 30
  }

  public func dimensions(width: Int, height: Int) -> (width: Int, height: Int) {
    guard width > 0, height > 0 else { return (2, 2) }
    let scale = min(1, Double(longEdge) / Double(max(width, height)),
      Double(shortEdge) / Double(min(width, height)))
    return (max(2, Int(Double(width) * scale) & ~1), max(2, Int(Double(height) * scale) & ~1))
  }

  public static func rotation(exif: Int) -> Int {
    switch exif {
    case 6, 7: return 90
    case 3, 4: return 180
    case 5, 8: return 270
    default: return 0
    }
  }

  public static func displayDimensions(width: Int, height: Int, rotation: Int) -> (width: Int, height: Int) {
    rotation == 90 || rotation == 270 ? (height, width) : (width, height)
  }
}
