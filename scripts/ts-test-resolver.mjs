const upstream = new URL('../src/upstream/', import.meta.url)

export async function resolve(specifier, context, nextResolve) {
  const target = specifier.startsWith('@/') ? new URL(specifier.slice(2), upstream).href : specifier
  try {
    return await nextResolve(target, context)
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !/^(?:file:|\.\.?\/)/.test(target)) throw error
    for (const suffix of ['.ts', '/index.ts']) {
      try { return await nextResolve(target + suffix, context) }
      catch (nested) { if (nested.code !== 'ERR_MODULE_NOT_FOUND') throw nested }
    }
    throw error
  }
}
