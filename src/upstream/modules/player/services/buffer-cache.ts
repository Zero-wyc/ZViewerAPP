/**
 * B站 DASH 缓冲模式 IndexedDB 缓存模块。
 *
 * 设计目标：
 * - 房主/观众端将完整 m4s 流缓存到 IndexedDB，避免播放过程中 URL 过期或网络波动
 * - 缓存完成后生成 blob URL 给 dash.js，零代理流量、零网络延迟
 * - 支持持久化，刷新页面可复用缓存（直到 deadline 过期或手动清理）
 *
 * 数据库结构：
 * - DB: `zcontrol-buffer`
 * - Store: `videos`（keyPath: `key`）
 *   - key: `${bvid}-${cid}-${qn}`（同一视频同一清晰度可复用，与个人 cookie 无关）
 *   - value: { videoBlob, audioBlob, videoCodec, audioCodec, duration, ... }
 *
 * 清理策略：
 * - 启动时扫描所有缓存，删除超过 MAX_AGE_MS 的条目
 * - 写入前若总大小超过 MAX_TOTAL_SIZE，按 lastAccessedAt 升序删除最旧的
 */

const DB_NAME = 'zcontrol-buffer'
const DB_VERSION = 1
const STORE_NAME = 'videos'
/** 缓存最大保留时间：24 小时 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** 缓存最大总大小：1.5 GB（防止 IndexedDB 占满磁盘） */
const MAX_TOTAL_SIZE = 1.5 * 1024 * 1024 * 1024

export interface BufferCacheEntry {
  /** 缓存 key: `${bvid}-${cid}-${qn}` */
  key: string
  /** B站视频 BV 号 */
  bvid: string
  /** B站视频 cid */
  cid: number
  /** 清晰度 qn */
  qn: number
  /** 视频流 Blob */
  videoBlob: Blob
  /** 音频流 Blob */
  audioBlob: Blob
  /** 视频编码 */
  videoCodec?: string
  /** 音频编码 */
  audioCodec?: string
  /** 视频时长（秒） */
  duration?: number
  /** 视频标题 */
  title?: string
  /** 创建时间戳（毫秒） */
  createdAt: number
  /** 最近访问时间戳（毫秒） */
  lastAccessedAt: number
}

let dbInstance: IDBDatabase | null = null

/** 打开 IndexedDB 连接（单例） */
function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('bvid', 'bvid', { unique: false })
        store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false })
      }
    }
  })
}

/** 生成缓存 key：`${bvid}-${cid}-${qn}` */
export function buildCacheKey(
  bvid: string,
  cid: number,
  qn: number | undefined
): string {
  return `${bvid}-${cid}-${qn ?? 0}`
}

/**
 * 读取缓存条目。
 *
 * 命中时自动更新 lastAccessedAt，避免 LRU 清理误删活跃缓存。
 */
export async function getCacheEntry(
  key: string
): Promise<BufferCacheEntry | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const entry = request.result as BufferCacheEntry | undefined
        if (!entry) {
          resolve(null)
          return
        }
        // 更新最近访问时间
        entry.lastAccessedAt = Date.now()
        store.put(entry)
        resolve(entry)
      }
    })
  } catch (err) {
    console.warn('[buffer-cache] 读取缓存失败:', err)
    return null
  }
}

/** 写入缓存条目（覆盖同 key 旧值） */
export async function setCacheEntry(entry: BufferCacheEntry): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(entry)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
    // 写入后异步清理超限缓存
    void evictIfOverLimit()
  } catch (err) {
    console.warn('[buffer-cache] 写入缓存失败:', err)
    throw err
  }
}

/** 删除指定缓存条目 */
export async function deleteCacheEntry(key: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (err) {
    console.warn('[buffer-cache] 删除缓存失败:', err)
  }
}

/**
 * 启动时清理：
 * 1. 删除超过 MAX_AGE_MS 的缓存
 * 2. 若总大小超过 MAX_TOTAL_SIZE，按 lastAccessedAt 升序删除最旧的
 */
export async function evictIfOverLimit(): Promise<void> {
  try {
    const db = await openDb()
    const allEntries = await new Promise<BufferCacheEntry[]>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result as BufferCacheEntry[])
      }
    )

    const now = Date.now()
    const expired = allEntries.filter((e) => now - e.createdAt > MAX_AGE_MS)
    const valid = allEntries.filter((e) => now - e.createdAt <= MAX_AGE_MS)

    // 删除过期缓存
    if (expired.length > 0) {
      console.log(
        `[buffer-cache] 清理 ${expired.length} 个过期缓存（超过 ${MAX_AGE_MS / 60 / 60 / 1000} 小时）`
      )
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      for (const e of expired) {
        store.delete(e.key)
      }
    }

    // 按总大小清理
    const totalSize = valid.reduce(
      (sum, e) => sum + e.videoBlob.size + e.audioBlob.size,
      0
    )
    if (totalSize <= MAX_TOTAL_SIZE) return

    // 按 lastAccessedAt 升序排序，删除最旧的
    valid.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
    let currentSize = totalSize
    const toDelete: BufferCacheEntry[] = []
    for (const e of valid) {
      if (currentSize <= MAX_TOTAL_SIZE) break
      toDelete.push(e)
      currentSize -= e.videoBlob.size + e.audioBlob.size
    }
    if (toDelete.length > 0) {
      console.log(
        `[buffer-cache] 总大小 ${(totalSize / 1024 / 1024).toFixed(0)}MB 超限，` +
          `删除 ${toDelete.length} 个最旧缓存释放 ${((totalSize - currentSize) / 1024 / 1024).toFixed(0)}MB`
      )
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      for (const e of toDelete) {
        store.delete(e.key)
      }
    }
  } catch (err) {
    console.warn('[buffer-cache] 清理缓存失败:', err)
  }
}

/**
 * 估算缓存总大小（用于 UI 显示已缓存多少）。
 * 不阻塞主流程，失败返回 0。
 */
export async function getCacheStats(): Promise<{
  count: number
  totalBytes: number
}> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const entries = request.result as BufferCacheEntry[]
        const totalBytes = entries.reduce(
          (sum, e) => sum + e.videoBlob.size + e.audioBlob.size,
          0
        )
        resolve({ count: entries.length, totalBytes })
      }
    })
  } catch {
    return { count: 0, totalBytes: 0 }
  }
}
