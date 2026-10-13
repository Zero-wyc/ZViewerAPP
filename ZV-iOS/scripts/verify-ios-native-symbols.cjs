const fs = require('node:fs');
const path = require('node:path');

const appMarkers = ['ZViewerNativeModule', 'ZVBiliBridge', 'ZVVoiceCodec', 'LivekitReactNativeModule',
  'WebRTCModule', 'LiveKitExpoAppDelegate', 'VLCEventsLegacyConfiguration', 'setSharedEventsConfiguration:'];
const frameworkMarkers = ['_OBJC_CLASS_$_VLCEventsLegacyConfiguration', 'setSharedEventsConfiguration:'];

function verifyApp(app) {
  // Apple's strings scans Mach-O sections by default, excluding imported class
  // names in link-edit data. Search the full bytes so a linked reference cannot
  // fail merely because it is outside a section. Still require the app reference
  // as well as the framework definition; framework presence alone is insufficient.
  for (const [relative, markers] of [['ZViewer', appMarkers], ['Frameworks/VLCKit.framework/VLCKit', frameworkMarkers]]) {
    const binary = fs.readFileSync(path.join(app, relative));
    for (const marker of markers) {
      if (!binary.includes(Buffer.from(marker))) throw new Error(`Missing native symbol in ${relative}: ${marker}`);
    }
  }
}

if (require.main === module) {
  verifyApp(process.argv[2]);
  console.log('Native app references and VLCKit event configuration verified from full binary bytes');
}
module.exports = { verifyApp, appMarkers, frameworkMarkers };
