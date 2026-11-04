Pod::Spec.new do |s|
  s.name = 'ZViewerScreenShare'
  s.version = '1.0.0'
  s.summary = 'Native screen sharing transport shared by the app and broadcast extension'
  s.homepage = 'https://github.com/Zero-wyc/ZViewerAPP'
  s.license = { :type => 'MIT' }
  s.author = 'ZViewer'
  s.source = { :path => '.' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '*.{swift,h,m}'
  s.public_header_files = 'ZVShareAudioDevice.h'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'Security', 'VideoToolbox'
  s.dependency 'LiveKitWebRTC', '144.7559.15'
  s.dependency 'Socket.IO-Client-Swift', '16.1.1'
  s.dependency 'Starscream', '4.0.8'
  s.pod_target_xcconfig = { 'APPLICATION_EXTENSION_API_ONLY' => 'YES', 'DEFINES_MODULE' => 'YES' }
end
