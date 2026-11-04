import Foundation

@main
enum ScreenShareSettingsTest {
  static func main() {
    let fallback = ZVShareVideoSettings(quality: "4k", framesPerSecond: 120)
    precondition(fallback.quality == "720p" && fallback.framesPerSecond == 30)
    for quality in ["540p", "720p", "1080p", "1440p"] {
      for fps in [15, 24, 30, 60] {
        let settings = ZVShareVideoSettings(quality: quality, framesPerSecond: fps)
        precondition(settings.quality == quality && settings.framesPerSecond == fps)
        for (width, height) in [(2732, 2048), (2048, 2732), (3840, 2160), (2160, 3840), (320, 240)] {
          let size = settings.dimensions(width: width, height: height)
          precondition(size.width <= width && size.height <= height)
          precondition(max(size.width, size.height) <= settings.longEdge)
          precondition(min(size.width, size.height) <= settings.shortEdge)
          precondition(size.width % 2 == 0 && size.height % 2 == 0)
          precondition(abs(Double(size.width) / Double(size.height) - Double(width) / Double(height)) < 0.015)
        }
      }
    }
    let fullHD = ZVShareVideoSettings(quality: "1080p", framesPerSecond: 60)
    let landscape = fullHD.dimensions(width: 3840, height: 2160)
    precondition(landscape.width == 1920 && landscape.height == 1080)
    let tablet = fullHD.dimensions(width: 2732, height: 2048)
    precondition(tablet.height == 1080 && tablet.width <= 1920)
    for (exif, rotation) in [(1, 0), (3, 180), (6, 270), (8, 90)] {
      precondition(ZVShareVideoSettings.rotation(exif: exif) == rotation)
      let displayed = ZVShareVideoSettings.displayDimensions(width: 1440, height: 1080, rotation: rotation)
      precondition(displayed.width == (rotation == 90 || rotation == 270 ? 1080 : 1440))
      precondition(displayed.height == (rotation == 90 || rotation == 270 ? 1440 : 1080))
    }
    print("Screen sharing presets passed: portrait, landscape, iPad, no upscaling, bounds and fallback")
  }
}
