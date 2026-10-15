import { common, wantAgent, WantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';

/** One explicit multimedia task shared by active media owners (API 22+). */
class BackgroundMediaTasks {
  private owners: Map<string, string> = new Map();
  private context: common.UIAbilityContext | null = null;
  private agent: WantAgent | null = null;
  private running: boolean = false;
  private taskId: number = -1;
  private listening: boolean = false;
  private callbacks: Map<string, () => void> = new Map();
  private queue: Promise<void> = Promise.resolve();

  private revoke(id: number): void {
    if (id !== this.taskId) return;
    this.running = false; this.taskId = -1;
    const callbacks = Array.from(this.callbacks.values());
    this.owners.clear(); this.callbacks.clear();
    callbacks.forEach((callback: () => void) => { try { callback(); } catch (_) {} });
  }

  set(context: common.UIAbilityContext, owner: string, mode: string | null, revoked?: () => void): Promise<void> {
    this.context = context;
    const operation = this.queue.then(async () => {
      const previous = this.owners.get(owner);
      const previousCallback = this.callbacks.get(owner);
      if (mode === null) { this.owners.delete(owner); this.callbacks.delete(owner); }
      else { this.owners.set(owner, mode); if (revoked !== undefined) this.callbacks.set(owner, revoked); }
      this.context = context;
      const modes: string[] = Array.from(new Set(Array.from(this.owners.values())));
      try {
        if (modes.length === 0) {
          if (this.running) {
            const id = this.taskId;
            // SDK cancellation callbacks from our own stop cannot revoke the next session.
            this.taskId = -1;
            try {
              try { await backgroundTaskManager.stopBackgroundRunning(context, id); }
              catch (_) { await backgroundTaskManager.stopBackgroundRunning(context, id); }
            } catch (error) { this.taskId = id; throw new Error((error as Error).message); }
          }
          this.running = false;
          return;
        }
        if (!this.listening) {
          backgroundTaskManager.on('continuousTaskCancel', (info: backgroundTaskManager.ContinuousTaskCancelInfo) => { this.revoke(info.id); });
          backgroundTaskManager.on('continuousTaskSuspend', (info: backgroundTaskManager.ContinuousTaskSuspendInfo) => { if (info.suspendState) this.revoke(info.continuousTaskId); });
          this.listening = true;
        }
        if (this.agent === null) this.agent = await wantAgent.getWantAgent({
          wants: [{ bundleName: 'com.zviewer.mobile', abilityName: 'EntryAbility' }],
          operationType: wantAgent.OperationType.START_ABILITY, requestCode: 1,
          wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
        });
        const request = new backgroundTaskManager.ContinuousTaskRequest();
        request.backgroundTaskModes = modes.includes('audioRecording') ?
          [backgroundTaskManager.BackgroundTaskMode.MODE_AUDIO_RECORDING, backgroundTaskManager.BackgroundTaskMode.MODE_AUDIO_PLAYBACK] :
          [backgroundTaskManager.BackgroundTaskMode.MODE_AUDIO_PLAYBACK];
        // Screen sharing includes the renderer used by ArkWeb/WebRTC and room voice playback.
        request.backgroundTaskSubmodes = request.backgroundTaskModes.map((_mode: backgroundTaskManager.BackgroundTaskMode) =>
          backgroundTaskManager.BackgroundTaskSubmode.SUBMODE_NORMAL_NOTIFICATION);
        request.wantAgent = this.agent;
        let notification: backgroundTaskManager.ContinuousTaskNotification;
        if (this.running) {
          request.continuousTaskId = this.taskId;
          notification = await backgroundTaskManager.updateBackgroundRunning(context, request);
        } else notification = await backgroundTaskManager.startBackgroundRunning(context, request);
        if (notification.continuousTaskId === undefined) throw new Error('System did not return a continuous task ID');
        this.taskId = notification.continuousTaskId;
        this.running = true;
      } catch (error) {
        // A stopped capture must never regain ownership after an OS cleanup error.
        // Keep running=true so a repeated release (or the next update) retries the OS cleanup.
        if (mode !== null) {
          if (previous === undefined) this.owners.delete(owner); else this.owners.set(owner, previous);
          if (previousCallback === undefined) this.callbacks.delete(owner); else this.callbacks.set(owner, previousCallback);
        }
        throw new Error((error as Error).message);
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  release(owner: string): Promise<void> {
    if (this.context === null) return Promise.resolve();
    return this.set(this.context, owner, null);
  }
}

export const backgroundMediaTasks = new BackgroundMediaTasks();
