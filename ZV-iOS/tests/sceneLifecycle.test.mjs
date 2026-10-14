import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { patchAppDelegate, sceneManifest } = createRequire(import.meta.url)('../plugins/with-ios-scene-support.cjs');
const delegate = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  func application() {
    reactNativeFactory = factory
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  // Existing Linking override must stay intact.
  func open() { RCTLinkingManager.application(app, open: url, options: options) }
}`;
test('scene startup owns the window once and preserves factory and link forwarding', () => {
  const result = patchAppDelegate(delegate);
  assert.match(result, /AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert(!result.includes('factory.startReactNative('));
  assert(!result.includes('UIScreen.main.bounds'));
  assert(result.includes('reactNativeFactory = factory'));
  assert(result.includes('return super.application(application, didFinishLaunchingWithOptions: launchOptions)'));
  assert(result.includes('RCTLinkingManager.application(app, open: url, options: options)'));
  assert.equal(patchAppDelegate(result), result);
  assert.throws(() => patchAppDelegate(delegate.replace('launchOptions: launchOptions)', 'launchOptions: customOptions)')), /Legacy/);
});
test('scene manifest resolves the shipped Expo delegate and retains other scene roles', () => {
  const external = [{ UISceneDelegateClassName: 'ExternalDisplayDelegate' }];
  const result = sceneManifest({ UISceneConfigurations: { UIWindowSceneSessionRoleExternalDisplay: external } });
  assert.equal(result.UIApplicationSupportsMultipleScenes, false);
  assert.equal(result.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName, 'EXExpoAppSceneDelegate');
  assert.equal(result.UISceneConfigurations.UIWindowSceneSessionRoleExternalDisplay, external);
  assert.deepEqual(sceneManifest(result), result);
});
