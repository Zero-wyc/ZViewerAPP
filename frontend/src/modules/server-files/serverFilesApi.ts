import { apiFetch, getApiUrl } from '@/lib/api'
import type {
  BilibiliDownloadedFile,
  BilibiliDownloadCallbacks,
  BilibiliDownloadProgress,
  EmbeddedSubtitleTrack,
  FfmpegInstallProgress,
  FfmpegStatus,
  ServerBrowseResult,
  ServerFileEntry,
  ServerFileResolved,
  ServerFileRoot,
  SystemDirBrowseResult,
  UploadedFile,
} from './types'

/** 浏览服务器文件目录。path 为前缀式路径（如 'uploads:/' 或 'custom:3:/videos'）。 */
export async function browseServerFiles(
  path?: string
): Promise<ServerBrowseResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  const res = await apiFetch(`/api/server-files/browse${query}`)
  const data = (await res.json()) as {
    success: boolean
    entries?: ServerFileEntry[]
    currentPath?: string
    readonly?: boolean
    message?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '浏览服务器文件失败')
  }
  return {
    entries: data.entries || [],
    currentPath: data.currentPath || '/',
    readonly: data.readonly,
  }
}

/** 上传文件到服务器。targetDir 为前缀式目录路径，支持 uploads 与 custom 根。 */
export async function uploadServerFiles(
  files: File[],
  targetDir: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<UploadedFile[]> {
  const formData = new FormData()
  formData.append('targetDir', targetDir)
  for (const file of files) {
    formData.append('files', file, file.name)
  }

  return new Promise<UploadedFile[]>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${getApiUrl()}/api/server-files/upload`)
    xhr.withCredentials = true

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total)
      }
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as {
          success: boolean
          files?: UploadedFile[]
          message?: string
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve(data.files || [])
        } else {
          reject(new Error(data.message || '上传失败'))
        }
      } catch {
        reject(new Error('上传响应解析失败'))
      }
    }

    xhr.onerror = () => reject(new Error('网络错误，上传失败'))
    xhr.send(formData)
  })
}

/** 新建文件夹。parent 为前缀式路径。 */
export async function createFolder(
  parent: string,
  name: string
): Promise<string> {
  const res = await apiFetch('/api/server-files/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent, name }),
  })
  const data = (await res.json()) as {
    success: boolean
    path?: string
    message?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '新建文件夹失败')
  }
  return data.path || ''
}

/** 重命名文件/文件夹。path 为前缀式路径。 */
export async function renameServerFile(
  path: string,
  newName: string
): Promise<string> {
  const res = await apiFetch('/api/server-files/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, newName }),
  })
  const data = (await res.json()) as {
    success: boolean
    path?: string
    message?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '重命名失败')
  }
  return data.path || ''
}

/** 删除文件或文件夹。path 为前缀式路径。 */
export async function deleteServerFile(path: string): Promise<void> {
  const res = await apiFetch(
    `/api/server-files/file?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' }
  )
  const data = (await res.json()) as { success: boolean; message?: string }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '删除失败')
  }
}

/** 解析文件 → 返回代理播放 URL + 格式。path 为前缀式路径。 */
export async function resolveServerFile(
  path: string
): Promise<ServerFileResolved> {
  const res = await apiFetch(
    `/api/server-files/resolve?path=${encodeURIComponent(path)}`
  )
  const data = (await res.json()) as {
    success: boolean
    message?: string
    title?: string
    videoUrl?: string
    format?: string
    size?: number
    audioCodec?: string | null
    duration?: number | null
    subtitleTracks?: EmbeddedSubtitleTrack[]
  }
  if (!res.ok || !data.success || !data.videoUrl) {
    throw new Error(data.message || '解析服务器文件失败')
  }
  return {
    title: data.title || '',
    videoUrl: data.videoUrl,
    format: data.format || 'mp4',
    size: data.size ?? 0,
    audioCodec: data.audioCodec,
    duration: data.duration,
    subtitleTracks: data.subtitleTracks,
  }
}

/**
 * 提取视频文件中指定内嵌字幕轨道的内容。
 *
 * 后端使用 ffmpeg 将字幕轨道导出为 SRT 格式。
 */
export async function extractEmbeddedSubtitle(
  path: string,
  streamIndex: number
): Promise<{ content: string; format: string; label: string; language: string | null }> {
  const res = await apiFetch(
    `/api/server-files/extract-subtitle?path=${encodeURIComponent(path)}&index=${streamIndex}`
  )
  const data = (await res.json()) as {
    success: boolean
    message?: string
    content?: string
    format?: string
    label?: string
    language?: string | null
  }
  if (!res.ok || !data.success || !data.content) {
    throw new Error(data.message || '提取字幕失败')
  }
  return {
    content: data.content,
    format: data.format || 'srt',
    label: data.label || `轨道 ${streamIndex}`,
    language: data.language ?? null,
  }
}

/** 构建服务器文件代理播放 URL（供 MoviePushPanel 直接拼装，免去 resolve 请求）。 */
export function buildServerFileProxyUrl(path: string): string {
  return `${getApiUrl()}/api/server-files/proxy?path=${encodeURIComponent(path)}`
}

// ============ 根目录管理 ============

/**
 * 浏览服务器文件系统任意目录（仅返回子目录）。
 * 用于"添加自定义根目录"时选取路径，不受已注册根目录限制。
 * 不提供 absPath 时返回系统根（Windows 盘符 / Unix 根目录）。
 */
export async function browseSystemDirs(
  absPath?: string
): Promise<SystemDirBrowseResult> {
  const query = absPath ? `?absPath=${encodeURIComponent(absPath)}` : ''
  const res = await apiFetch(`/api/server-files/browse-system${query}`)
  const data = (await res.json()) as {
    success: boolean
    entries?: { name: string; absPath: string }[]
    currentPath?: string
    parentPath?: string
    isRoot?: boolean
    message?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '浏览系统目录失败')
  }
  return {
    entries: data.entries || [],
    currentPath: data.currentPath || '',
    parentPath: data.parentPath || '',
    isRoot: data.isRoot === true,
  }
}

/** 列出所有可用根（uploads + 自定义）。 */
export async function listServerRoots(): Promise<ServerFileRoot[]> {
  const res = await apiFetch('/api/server-files/roots')
  const data = (await res.json()) as {
    success: boolean
    roots?: ServerFileRoot[]
    message?: string
  }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '加载根目录失败')
  }
  return data.roots || []
}

/** 添加自定义根目录。 */
export async function addServerRoot(
  name: string,
  absPath: string,
  readonly?: boolean
): Promise<ServerFileRoot> {
  const res = await apiFetch('/api/server-files/roots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, absPath, readonly: !!readonly }),
  })
  const data = (await res.json()) as {
    success: boolean
    root?: ServerFileRoot
    message?: string
  }
  if (!res.ok || !data.success || !data.root) {
    throw new Error(data.message || '添加根目录失败')
  }
  return data.root
}

/** 删除自定义根目录（仅删除挂载，不删真实文件）。 */
export async function deleteServerRoot(key: string): Promise<void> {
  // key 形如 'custom:3'，提取数字 id
  const match = key.match(/^custom:(\d+)$/)
  if (!match) {
    throw new Error('默认空间不可删除')
  }
  const id = match[1]
  const res = await apiFetch(`/api/server-files/roots/${id}`, {
    method: 'DELETE',
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  if (!res.ok || !data.success) {
    throw new Error(data.message || '删除根目录失败')
  }
}

/**
 * 从前缀式路径提取根 key。
 * 'uploads:/x' → 'uploads'，'custom:3:/x' → 'custom:3'，'/x' → 'uploads'。
 */
export function extractRootKey(path: string | undefined): string {
  if (!path) return 'uploads'
  const m = path.match(/^(uploads|custom:\d+):/)
  return m ? m[1] : 'uploads'
}

/**
 * 替换路径中的根 key（用于切换根时构造新路径）。
 */
export function withRootKey(rootKey: string): string {
  // 切换根时总是回到该根的根目录
  return `${rootKey}:/`
}

// ============ B站视频下载 ============

/** B站下载整体超时兜底（毫秒）：覆盖解析 + 任意大小文件下载。 */
const BILIBILI_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 下载 B站 视频到服务器指定目录。
 *
 * 后端以 NDJSON 流式响应推送进度：
 *   - `parsing` 阶段：调用 `onParsing(step, message)`
 *   - `downloading` 阶段：调用 `onDownloading(phase, received, total, percent)`
 *   - `merging` 阶段（仅 DASH 模式）：调用 `onMerging(percent, message)`
 *   - `done` 阶段：resolve 出文件信息
 *   - `error` 阶段：reject 错误
 *
 * 模式：
 *   - `mp4`（默认）：MP4 单文件直链，最高 1080P，无需 FFmpeg
 *   - `dash`：DASH 分离流，支持 4K/8K/HDR，需要服务器安装 FFmpeg
 *
 * 与 `resolveBilibili` 一样采用先 `res.text()` 再按行解析的方式，
 * 避免部分浏览器在流式读取时记录 `net::ERR_ABORTED`。
 */
export async function downloadBilibiliVideo(
  params: {
    url: string
    targetDir: string
    filename?: string
    qn?: number
    page?: number
    mode?: 'mp4' | 'dash'
  },
  callbacks?: BilibiliDownloadCallbacks
): Promise<BilibiliDownloadedFile> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    BILIBILI_DOWNLOAD_TIMEOUT_MS
  )

  try {
    const res = await apiFetch('/api/server-files/bilibili-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/x-ndjson')) {
      // 兼容直接返回 JSON 错误的情况
      const data = (await res.json().catch(() => null)) as {
        success?: boolean
        message?: string
      } | null
      throw new Error(data?.message || '下载 B站 视频失败')
    }

    let text: string
    try {
      text = await res.text()
    } catch (err) {
      throw new Error('读取下载响应失败', { cause: err })
    }

    let result: BilibiliDownloadedFile | null = null
    let streamError: Error | null = null

    const lines = text.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const data = JSON.parse(line) as BilibiliDownloadProgress
        if (data.status === 'parsing' && data.step && data.message) {
          callbacks?.onParsing?.(data.step, data.message)
        } else if (data.status === 'downloading') {
          callbacks?.onDownloading?.(
            data.phase ?? 'video',
            data.received ?? 0,
            data.total ?? 0,
            data.percent ?? 0
          )
        } else if (data.status === 'merging') {
          callbacks?.onMerging?.(data.percent ?? 0, data.message ?? '')
        } else if (data.status === 'done' && data.file) {
          result = data.file
        } else if (data.status === 'error') {
          streamError = new Error(data.message || '下载 B站 视频失败')
        }
      } catch (err) {
        console.warn('[downloadBilibiliVideo] 解析进度行失败:', line, err)
      }
    }

    if (streamError) throw streamError
    if (result) return result
    throw new Error('下载未完成')
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('下载 B站 视频超时，请稍后重试', { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 手动上传 zip 文件安装 FFmpeg。
 *
 * 用户上传包含 ffmpeg 可执行文件的 zip 压缩包，
 * 后端解压并提取 ffmpeg 到 bin/ 目录。
 */
export async function uploadFfmpeg(file: File): Promise<FfmpegStatus> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await apiFetch('/api/server-files/ffmpeg-upload', {
    method: 'POST',
    body: formData,
  })

  const data = (await res.json()) as FfmpegStatus & {
    success?: boolean
    message?: string
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || '上传安装失败')
  }

  return {
    available: !!data.available,
    source: data.source,
    path: data.path,
    version: data.version,
    transcodeCapable: data.transcodeCapable,
  }
}

// ============ FFmpeg 状态检测与在线安装 ============

/** 检测服务器 FFmpeg 状态。 */
export async function checkFfmpeg(force: boolean = false): Promise<FfmpegStatus> {
  const query = force ? '?force=true' : ''
  const res = await apiFetch(`/api/server-files/ffmpeg-status${query}`)
  const data = (await res.json()) as FfmpegStatus & { success?: boolean }
  if (!res.ok || data.success === false) {
    return {
      available: false,
      source: null,
      path: null,
      version: null,
      transcodeCapable: false,
      error: data.error || '检测失败',
    }
  }
  return {
    available: !!data.available,
    source: data.source,
    path: data.path,
    version: data.version,
    transcodeCapable: data.transcodeCapable,
  }
}

/** FFmpeg 安装整体超时（10 分钟，覆盖大文件下载+解压） */
const FFMPEG_INSTALL_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 在线下载并安装 FFmpeg。
 *
 * 后端以 NDJSON 流式响应推送进度：
 *   - `downloading` 阶段：拉取二进制压缩包
 *   - `extracting` 阶段：解压并提取 ffmpeg 可执行文件
 *   - `done` 阶段：安装完成
 *   - `error` 阶段：reject 错误
 */
export async function installFfmpeg(
  onProgress?: (p: FfmpegInstallProgress) => void
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FFMPEG_INSTALL_TIMEOUT_MS)

  try {
    const res = await apiFetch('/api/server-files/ffmpeg-install', {
      method: 'POST',
      signal: controller.signal,
    })

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/x-ndjson')) {
      const data = (await res.json().catch(() => null)) as {
        success?: boolean
        message?: string
      } | null
      throw new Error(data?.message || '安装 FFmpeg 失败')
    }

    let text: string
    try {
      text = await res.text()
    } catch (err) {
      throw new Error('读取安装响应失败', { cause: err })
    }

    let streamError: Error | null = null
    const lines = text.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const data = JSON.parse(line) as FfmpegInstallProgress
        if (data.status === 'done') {
          return
        }
        if (data.status === 'error') {
          streamError = new Error(data.message || '安装失败')
        } else {
          onProgress?.(data)
        }
      } catch (err) {
        console.warn('[installFfmpeg] 解析进度行失败:', line, err)
      }
    }

    if (streamError) throw streamError
    throw new Error('安装未完成')
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('安装 FFmpeg 超时，请稍后重试', { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
