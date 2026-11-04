import Foundation
import Security
import Starscream

// This policy belongs to one immutable socket origin. It never changes the
// trust policy for CDN URLs, room voice, or another server.
final class ZVShareTrust: CertificatePinning {
  private let host: String
  private let allowException: Bool
  init(host: String, allowException: Bool) { self.host = host.lowercased(); self.allowException = allowException }
  func evaluateTrust(trust: SecTrust, domain: String?, completion: ((PinningState) -> Void)) {
    guard domain?.lowercased() == host else { completion(.failed(nil)); return }
    if allowException { completion(.success); return }
    SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, host as CFString))
    var error: CFError?
    completion(SecTrustEvaluateWithError(trust, &error) ? .success : .failed(error))
  }
}
