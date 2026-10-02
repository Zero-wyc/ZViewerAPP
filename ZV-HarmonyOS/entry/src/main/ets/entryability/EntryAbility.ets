import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN = 0x5A56;

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, 'ZViewer', 'Ability created');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(DOMAIN, 'ZViewer', 'Failed to load main page: %{public}d', error.code);
        return;
      }
      // Keep the system safe areas aligned with the Web surface on phones and tablets.
      const mainWindow = windowStage.getMainWindowSync();
      mainWindow.setPreferredOrientation(window.Orientation.AUTO_ROTATION_RESTRICTED)
        .catch(() => hilog.error(DOMAIN, 'ZViewer', 'Failed to enable automatic rotation'));
      mainWindow.setWindowLayoutFullScreen(true)
        .catch(() => hilog.error(DOMAIN, 'ZViewer', 'Failed to enable edge-to-edge layout'));
      mainWindow.setWindowSystemBarProperties({
        statusBarColor: '#00000000',
        navigationBarColor: '#00000000',
        statusBarContentColor: '#FFFFFF',
        navigationBarContentColor: '#FFFFFF'
      }).catch(() => hilog.error(DOMAIN, 'ZViewer', 'Failed to style system bars'));
    });
  }
}
