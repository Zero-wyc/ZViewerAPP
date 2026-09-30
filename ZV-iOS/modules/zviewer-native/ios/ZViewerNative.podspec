Pod::Spec.new do |s|
  s.name = 'ZViewerNative'
  s.version = '1.0.0'
  s.summary = 'ZViewer local Bilibili and Socket.IO voice native services'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'ZViewer'
  s.homepage = 'https://github.com/Zero-wyc/ZViewer'
  s.source = { :path => '.' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{h,m,swift}'
  s.public_header_files = 'ZVBiliBridge.h', 'ZVVoiceCodec.h'
  s.vendored_frameworks = 'Vendor/Bilicore.xcframework'
  s.vendored_libraries = 'Vendor/libopus.a'
  s.resource_bundles = { 'ZViewerNativeLicenses' => ['Vendor/*-LICENSE'] }
  s.libraries = 'resolv'
  s.frameworks = 'AVFoundation', 'AudioToolbox', 'Security', 'VideoToolbox'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/Vendor/opus"' }
end
