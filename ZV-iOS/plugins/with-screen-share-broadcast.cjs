const { withEntitlementsPlist, withInfoPlist, withXcodeProject, withPodfile } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const targetName = 'ZViewerBroadcast';

module.exports = (config, options = {}) => {
  const group = options.appGroup || 'group.com.zviewer.mobile.broadcast';
  if (!/^group\.[A-Za-z0-9.-]+$/.test(group)) throw new Error('Invalid screen sharing App Group');
  const keychain = '$(AppIdentifierPrefix)com.zviewer.mobile.share';
  const extension = config.extra?.eas?.build?.experimental?.ios?.appExtensions?.find(item => item.targetName === targetName);
  if (extension) {
    extension.entitlements ||= {};
    extension.entitlements['com.apple.security.application-groups'] = [group];
    extension.entitlements['keychain-access-groups'] = [keychain];
  }
  config = withEntitlementsPlist(config, value => {
    value.modResults['com.apple.security.application-groups'] = [...new Set([...(value.modResults['com.apple.security.application-groups'] || []), group])];
    value.modResults['keychain-access-groups'] = [...new Set([...(value.modResults['keychain-access-groups'] || []), keychain])];
    return value;
  });
  config = withInfoPlist(config, value => {
    value.modResults.ZViewerShareKeychainGroup = keychain;
    value.modResults.ZViewerShareAppGroup = group;
    value.modResults.UIBackgroundModes = [...new Set([...(value.modResults.UIBackgroundModes || []), 'screen-capture'])];
    return value;
  });
  config = withPodfile(config, value => {
    const marker = '# ZViewer native broadcast transport';
    if (!value.modResults.contents.includes(marker)) {
      value.modResults.contents = value.modResults.contents.replace('  use_expo_modules!', `  ${marker}\n  pod 'ZViewerScreenShare', :path => '../native/screen-share'\n  use_expo_modules!`);
    }
    if (!value.modResults.contents.includes(`target '${targetName}' do`)) {
      value.modResults.contents += `\n# ZViewer extension: no React, VLC or Bilicore dependencies.\ntarget '${targetName}' do\n  pod 'ZViewerScreenShare', :path => '../native/screen-share'\nend\n`;
    }
    return value;
  });
  config = withXcodeProject(config, value => {
    const root = value.modRequest.projectRoot;
    const directory = path.join(value.modRequest.platformProjectRoot, targetName);
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.join(root, 'native/broadcast-upload/SampleHandler.swift'), path.join(directory, 'SampleHandler.swift'));
    fs.writeFileSync(path.join(directory, `${targetName}-Info.plist`), plist.build({
      CFBundleDisplayName: 'ZViewer 屏幕共享', CFBundleName: '$(PRODUCT_NAME)',
      CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)', CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundlePackageType: 'XPC!', CFBundleShortVersionString: value.version,
      CFBundleVersion: value.ios.buildNumber,
      ZViewerShareKeychainGroup: keychain,
      ZViewerShareAppGroup: group,
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSExtension: {
        NSExtensionPointIdentifier: 'com.apple.broadcast-services-upload',
        NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).SampleHandler',
        RPBroadcastProcessMode: 'RPBroadcastProcessModeSampleBuffer',
      },
    }));
    fs.writeFileSync(path.join(directory, `${targetName}.entitlements`), plist.build({
      'com.apple.security.application-groups': [group], 'keychain-access-groups': [keychain],
    }));
    const project = value.modResults;
    project.hash.project.objects.PBXTargetDependency ||= {};
    project.hash.project.objects.PBXContainerItemProxy ||= {};
    const existing = Object.entries(project.pbxNativeTargetSection()).find(([, item]) => typeof item === 'object' && item.name?.replaceAll('"', '') === targetName);
    let target = existing?.[0];
    if (!target) {
      target = project.addTarget(targetName, 'app_extension', targetName, `${value.ios.bundleIdentifier}.BroadcastUpload`).uuid;
      const pbxGroup = project.addPbxGroup([], targetName, targetName).uuid;
      project.addToPbxGroup(pbxGroup, project.getFirstProject().firstProject.mainGroup);
      project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target);
      project.addSourceFile('SampleHandler.swift', { target }, pbxGroup);
    }
    const nativeTarget = project.pbxNativeTargetSection()[target];
    const host = project.getFirstTarget();
    const dependencies = project.hash.project.objects.PBXTargetDependency;
    if (!host.firstTarget.dependencies.some(item => dependencies[item.value]?.target === target)) {
      project.addTargetDependency(host.uuid, [target]);
    }
    for (const item of Object.values(project.pbxFileReferenceSection())) {
      if (typeof item !== 'object') continue;
      for (const key of Object.keys(item)) if (item[key] === undefined || item[key] === 'undefined') delete item[key];
    }
    const configurations = project.pbxXCConfigurationList()[nativeTarget.buildConfigurationList].buildConfigurations;
    for (const item of configurations) {
      const settings = project.pbxXCBuildConfigurationSection()[item.value].buildSettings;
      Object.assign(settings, {
        IPHONEOS_DEPLOYMENT_TARGET: '16.4', SWIFT_VERSION: '5.9',
        TARGETED_DEVICE_FAMILY: '"1,2"', APPLICATION_EXTENSION_API_ONLY: 'YES',
        CODE_SIGN_ENTITLEMENTS: `"${targetName}/${targetName}.entitlements"`,
        CURRENT_PROJECT_VERSION: value.ios.buildNumber, MARKETING_VERSION: value.version,
        GENERATE_INFOPLIST_FILE: 'NO', CLANG_ENABLE_MODULES: 'YES',
      });
    }
    return value;
  });
  return config;
};
