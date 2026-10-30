/** Cancel the caller's wait even when the underlying browser operation hangs. */
export function awaitAbortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? new DOMException('Operation aborted', 'AbortError'))
    operation.then(
      value => { signal.removeEventListener('abort', aborted); resolve(value) },
      error => { signal.removeEventListener('abort', aborted); reject(error) }
    )
    if (signal.aborted) aborted()
    else signal.addEventListener('abort', aborted, { once: true })
  })
}
