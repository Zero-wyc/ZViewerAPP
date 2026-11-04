import CoreMedia
import CoreVideo
import VideoToolbox

public final class ZVShareVideoProcessor {
  private let settings: ZVShareVideoSettings
  private var transfer: VTPixelTransferSession?
  private var rotationSession: VTPixelRotationSession?
  private var scratch: CVPixelBuffer?

  public init(settings: ZVShareVideoSettings) { self.settings = settings }

  deinit {
    if let transfer { VTPixelTransferSessionInvalidate(transfer) }
    if let rotationSession { VTPixelRotationSessionInvalidate(rotationSession) }
  }

  public static func rotation(for sample: CMSampleBuffer, key: CFString) -> Int {
    let attached = CMGetAttachment(sample, key: key, attachmentModeOut: nil) as? NSNumber
    let entries = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[String: Any]]
    let orientation = attached ?? entries?.first?[key as String] as? NSNumber
    return ZVShareVideoSettings.rotation(exif: orientation?.intValue ?? 1)
  }

  // Called serially while the capture callback still owns the source buffer.
  // Bake orientation into pixels so decoding never depends on RTP rotation metadata.
  public func copyFrame(_ input: CVPixelBuffer, rotation: Int) -> CVPixelBuffer? {
    let size = settings.dimensions(width: CVPixelBufferGetWidth(input), height: CVPixelBufferGetHeight(input))
    let displayed = ZVShareVideoSettings.displayDimensions(width: size.width, height: size.height, rotation: rotation)
    let format = CVPixelBufferGetPixelFormatType(input)
    guard let output = buffer(width: displayed.width, height: displayed.height, format: format) else { return nil }
    guard rotation != 0 else { return scale(input, to: output) ? output : nil }
    let source: CVPixelBuffer
    if CVPixelBufferGetWidth(input) == size.width && CVPixelBufferGetHeight(input) == size.height {
      source = input
    } else {
      if scratch.map({ CVPixelBufferGetWidth($0) != size.width || CVPixelBufferGetHeight($0) != size.height
        || CVPixelBufferGetPixelFormatType($0) != format }) ?? true {
        scratch = buffer(width: size.width, height: size.height, format: format)
      }
      guard let scratch, scale(input, to: scratch) else { return nil }
      source = scratch
    }
    if rotationSession == nil { VTPixelRotationSessionCreate(kCFAllocatorDefault, &rotationSession) }
    guard let rotationSession else { return nil }
    let angle: CFString
    switch rotation {
    case 90: angle = kVTRotation_CW90
    case 180: angle = kVTRotation_180
    case 270: angle = kVTRotation_CCW90
    default: return nil
    }
    guard VTSessionSetProperty(rotationSession, key: kVTPixelRotationPropertyKey_Rotation, value: angle) == noErr,
      VTPixelRotationSessionRotateImage(rotationSession, source, output) == noErr else { return nil }
    return output
  }

  private func scale(_ input: CVPixelBuffer, to output: CVPixelBuffer) -> Bool {
    if transfer == nil { VTPixelTransferSessionCreate(allocator: kCFAllocatorDefault, pixelTransferSessionOut: &transfer) }
    guard let transfer else { return false }
    return VTPixelTransferSessionTransferImage(transfer, from: input, to: output) == noErr
  }

  private func buffer(width: Int, height: Int, format: OSType) -> CVPixelBuffer? {
    var result: CVPixelBuffer?
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, format,
      [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &result) == kCVReturnSuccess else { return nil }
    return result
  }
}
