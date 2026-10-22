// Cancellation stops reads and future items. An already submitted write is
// allowed to confirm, so its successful item is never offered for re-addition.
export async function addSourceBatch<T>(items: T[], identity: (item: T) => string, add: (item: T) => Promise<void>, signal?: AbortSignal) {
  const added: string[] = []; const failures: { id: string; message: string }[] = []; const visited = new Set<string>();
  for (const item of items) {
    if (signal?.aborted) break;
    const id = identity(item); if (visited.has(id)) continue; visited.add(id);
    try { await add(item); added.push(id); }
    catch (failure) {
      if (signal?.aborted) break;
      failures.push({ id, message: failure instanceof Error ? failure.message : '添加失败' });
    }
  }
  return { added, failures, ...(signal?.aborted ? { cancelled: true } : {}) };
}
