const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

function patchAppDelegate(source) {
  if (!source.includes('ExpoReactNativeFactoryProvider')) {
    const declaration = 'class AppDelegate: ExpoAppDelegate {';
    if (!source.includes(declaration)) throw new Error('Review AppDelegate before enabling iOS scene support');
    source = source.replace(declaration, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  }
  const legacy = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s+#endif/;
  source = source.replace(legacy, '// ZViewerSceneLifecycle: ExpoAppSceneDelegate creates the scene window and starts React Native.');
  if (source.includes('factory.startReactNative(') || source.includes('UIWindow(frame: UIScreen.main.bounds)')) {
    throw new Error('Legacy React Native window startup remains; review the scene migration');
  }
  if (!source.includes('reactNativeFactory = factory')) throw new Error('The scene delegate requires a retained React Native factory');
  return source;
}

function sceneManifest(previous = {}) {
  return {
    ...previous,
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      ...previous.UISceneConfigurations,
      UIWindowSceneSessionRoleApplication: [{
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
      }],
    },
  };
}

module.exports = config => {
  config = withInfoPlist(config, mod => {
    mod.modResults.UIApplicationSceneManifest = sceneManifest(mod.modResults.UIApplicationSceneManifest);
    return mod;
  });
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('ZViewer scene support expects a Swift AppDelegate');
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents);
    return mod;
  });
};
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.sceneManifest = sceneManifest;
