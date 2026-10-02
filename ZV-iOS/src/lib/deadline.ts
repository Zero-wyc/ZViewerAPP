// Race the entire operation (including the response body), since a transport or
// native storage bridge may never settle even after its signal is aborted.
export async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds = 15000, externalSignal?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    const fail = (error: Error) => { controller.abort(); reject(error); };
    cancel = () => fail(new Error('请求已取消'));
    if (externalSignal?.aborted) cancel();
    else externalSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => fail(new Error('请求超时，请检查网络后重试')), milliseconds);
  });
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('请求已取消');
      return operation(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', cancel);
  }
}
