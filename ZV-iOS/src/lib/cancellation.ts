// RN 0.86 installs abort-controller: signal.aborted exists, throwIfAborted does not.
export function checkAbort(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('任务已取消'); error.name = 'AbortError'; throw error;
}
