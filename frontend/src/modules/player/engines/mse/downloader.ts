/**
 * HTTP Range 下载器（v2 重写）。
 *
 * 职责单一：发起 Range 请求，处理代理包装、重试与 abort。
 * 不涉及 SourceBuffer、moof 扫描、缓冲管理等逻辑。
 *
 * 三个层级：
 * - downloadHead       下载文件头部（0..HEAD_SIZE），供 init/sidx 解析
 * - downloadRange      下载闭区间字节块，供 seek 快速路径
 * - downloadStream(WithRetry)  开放式流下载（bytes=start-），供主下载循环
 *
 * 缓存说明：仅依赖 SourceBuffer 实时缓冲（MSE 原生），不再做 IndexedDB 持久化。
 * 刷新页面后会重新下载 init/sidx，但播放过程中的实时缓冲仍由 MSE 管理。
 */
import { apiFetch } from '@/lib/api'
import { resolveProxyUrl } from '../../services/url-proxy'
import { HEAD_SIZE, MAX_FETCH_RETRIES } from './types'
import type { DownloadOptions } from './types'

/**
 * 检测错误是否为 SourceBuffer 不可恢复状态错误。
 *
 * 两种情况都会抛出此错误：
 * 1. video.error 已设置 → appendBuffer 永久失败
 * 2. MediaSource 已被 detach/close → SourceBuffer 不再可用
 */
export function isInvalidStateError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'InvalidStateError')
    return true
  if (
    err instanceof Error &&
    err.message.includes('HTMLMediaElement.error attribute is not null')
  )
    return true
  return false
}

/** 判断错误是否为 abort（用户取消 / 实例被取代），不应重试。 */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

/** 请求被中止或实例被取代时静默退出。 */
export interface DownloadAbortCheck {
  signal: AbortSignal
  superseded?: () => boolean
}

/** 下载结果。 */
export interface DownloadResult {
  response: Response
  /** 实际请求的字节起始位置 */
  startByte: number
}

/** 统一代理策略：MSE 用于 DASH m4s 合并播放，始终走代理（有防盗链 + 无 CORS）。 */
function resolveTargetUrl(url: string): string {
  return resolveProxyUrl(url, undefined, 'dash')
}

/**
 * 核心 Range 请求（无缓存、无重试）。
 *
 * @param endByte 闭区间终点；省略时开放式下载（bytes=start-）
 */
async function fetchRange(
  url: string,
  startByte: number,
  endByte: number | undefined,
  signal: AbortSignal
): Promise<Response> {
  const headers: Record<string, string> = {
    Range: `bytes=${startByte}-${endByte ?? ''}`,
  }
  const response = await apiFetch(resolveTargetUrl(url), { headers, signal })
  if (!response.ok && response.status !== 206) {
    throw new Error(`获取媒体失败: ${response.status} ${response.statusText}`)
  }
  return response
}

/**
 * 创建一个跳过前 skipBytes 字节的 ReadableStream。
 *
 * 用于服务器未处理 Range 请求（返回 200 + 整个文件）时的兜底：
 * 客户端通过流式读取跳过已下载的部分，避免 arrayBuffer() 把整个文件读入内存。
 *
 * @param source 原始响应 body
 * @param skipBytes 需要跳过的字节数
 * @param maxBytes 最多输出的字节数（闭区间 Range 场景）；省略时输出到流结束
 * @param signal 中断信号
 */
function createSkippingStream(
  source: ReadableStream<Uint8Array>,
  skipBytes: number,
  maxBytes: number | undefined,
  signal: AbortSignal
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let skipped = 0
  let emitted = 0
  let pending: Uint8Array | null = null

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted) {
        reader.cancel().catch(() => {})
        controller.error(new DOMException('Aborted', 'AbortError'))
        return
      }

      // 优先输出上次读取遗留的有用数据
      if (pending) {
        const remaining =
          maxBytes !== undefined ? maxBytes - emitted : pending.length
        if (remaining <= 0) {
          controller.close()
          reader.cancel().catch(() => {})
          return
        }
        const chunk = pending.subarray(0, Math.min(pending.length, remaining))
        controller.enqueue(chunk)
        emitted += chunk.length
        pending =
          chunk.length < pending.length ? pending.subarray(chunk.length) : null
        if (maxBytes !== undefined && emitted >= maxBytes) {
          controller.close()
          reader.cancel().catch(() => {})
        }
        return
      }

      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        reader.cancel().catch(() => {})
        return
      }

      // 仍在跳过阶段
      if (skipped < skipBytes) {
        skipped += value.length
        if (skipped > skipBytes) {
          // 本次读取跨越了跳过边界，保留有用部分
          const overshoot = skipped - skipBytes
          pending = value.subarray(value.length - overshoot)
        }
        return
      }

      // 跳过完成，直接输出（受 maxBytes 限制）
      const remaining =
        maxBytes !== undefined ? maxBytes - emitted : value.length
      if (remaining <= 0) {
        controller.close()
        reader.cancel().catch(() => {})
        return
      }
      const chunk = value.subarray(0, Math.min(value.length, remaining))
      controller.enqueue(chunk)
      emitted += chunk.length
      if (chunk.length < value.length) {
        pending = value.subarray(chunk.length)
      }
      if (maxBytes !== undefined && emitted >= maxBytes) {
        controller.close()
        reader.cancel().catch(() => {})
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })
}

/**
 * 下载文件头部（0..HEAD_SIZE），返回 Response 与已读入内存的数据。
 *
 * 注意：返回的 Response.body 已被消费（网络路径），调用方必须使用 data 字段
 * 而非再次调用 response.arrayBuffer()，否则抛 "Body has already been consumed"。
 * response 仅用于读取 headers（Content-Range / Content-Length）。
 */
export async function downloadHead(
  url: string,
  signal: AbortSignal
): Promise<{ response: Response; data: Uint8Array }> {
  return downloadRange(url, 0, HEAD_SIZE - 1, signal)
}

/**
 * 检测 status=200 响应是否实际为 Range 请求的结果（被中间代理改写状态码）。
 *
 * 场景：Vite preview/dev 代理将上游 206 响应的状态码改写成 200，但
 * Content-Range 头仍正确透传。如果仅凭 status=200 启动跳过逻辑，
 * 会跳过 startByte 字节（可达数十 MB），导致 MSE 首次 flush 超时。
 *
 * 判定标准：content-range 头存在且起始字节匹配请求的 startByte。
 */
function isRangeResponseMaskedAs200(
  response: Response,
  startByte: number
): boolean {
  if (response.status !== 200) return false
  const contentRange = response.headers.get('content-range')
  if (!contentRange) return false
  // Content-Range: bytes <start>-<end>/<total> 或 bytes <start>-<end>/*
  const match = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i)
  if (!match) return false
  const rangeStart = parseInt(match[1], 10)
  return rangeStart === startByte
}

/**
 * 下载指定字节范围（闭区间），返回 Response 与已读入内存的数据。
 * 用于 head 下载与 seek 快速路径（先下小块找 moof 立即 flush）。
 *
 * 服务器兼容：
 * - 中间代理改写 206→200 但保留 Content-Range 头：当作 206 直接读取
 *   （Vite preview/dev 代理的常见行为）。
 * - 上游真正未处理 Range（200 + 整个文件，无 Content-Range）：
 *   流式跳过 startByte 字节并截取请求范围，避免整个文件读入内存导致 OOM。
 */
export async function downloadRange(
  url: string,
  startByte: number,
  endByte: number,
  signal: AbortSignal
): Promise<{ response: Response; data: Uint8Array }> {
  const response = await fetchRange(url, startByte, endByte, signal)
  const requestedSize = endByte - startByte + 1
  const contentRange = response.headers.get('content-range')
  console.warn(
    `[downloadRange] status=${response.status} start=${startByte} end=${endByte} size=${requestedSize} content-range=${contentRange ?? 'none'} content-length=${response.headers.get('content-length') ?? 'none'}`
  )

  // 中间代理改写 206→200 但 Content-Range 匹配：当作 206 直接读取
  if (isRangeResponseMaskedAs200(response, startByte)) {
    console.warn(
      `[downloadRange] status=200 但 Content-Range 匹配 startByte=${startByte}，按 206 处理`
    )
    const data = new Uint8Array(await response.arrayBuffer())
    // 构造标准 206 响应，供 parseTotalSize 解析 totalSize
    const wrapped = new Response(data, {
      status: 206,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Content-Range': contentRange!,
        'Content-Length': String(data.byteLength),
      },
    })
    return { response: wrapped, data }
  }

  // 上游真正未处理 Range（200 + 整个文件，无 Content-Range）：流式跳过 + 截取
  if (response.status === 200 && response.body) {
    console.warn(
      `[downloadRange] 服务器返回 200（未处理 Range），跳过 ${startByte} 字节后截取 ${requestedSize} 字节`
    )
    const limitedStream = createSkippingStream(
      response.body,
      startByte,
      requestedSize,
      signal
    )
    const buffer = await new Response(limitedStream).arrayBuffer()
    const data = new Uint8Array(buffer)
    // 构造携带正确 Range 头的虚拟 206 响应，供 parseTotalSize 解析
    const wrapped = new Response(data, {
      status: 206,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Content-Range': `bytes ${startByte}-${endByte}/*`,
        'Content-Length': String(data.byteLength),
      },
    })
    return { response: wrapped, data }
  }

  const data = new Uint8Array(await response.arrayBuffer())
  return { response, data }
}

/**
 * 从指定字节位置开始开放式下载媒体流（bytes=start-）。
 *
 * 支持断点续传重试，遇到 video.error / InvalidStateError / abort 时立即失败不重试。
 *
 * 服务器兼容：
 * - 中间代理改写 206→200 但保留 Content-Range 头：当作 206 直接透传 body
 *   （Vite preview/dev 代理的常见行为）。
 * - 上游真正未处理 Range（200 + 整个文件，无 Content-Range）：使用流式读取
 *   跳过 startByte 字节，构造虚拟 206 响应，避免数据错位导致 SourceBuffer
 *   接收到 ftyp+moov 重复数据触发 CHUNK_DEMUXER_ERROR。
 */
export async function downloadStream(
  url: string,
  options: DownloadOptions
): Promise<DownloadResult> {
  const { startByte = 0, signal } = options
  const response = await fetchRange(url, startByte, undefined, signal)
  if (!response.body) {
    throw new Error('响应体为空')
  }

  // 中间代理改写 206→200 但 Content-Range 匹配：当作 206 直接透传 body
  if (isRangeResponseMaskedAs200(response, startByte)) {
    console.warn(
      `[downloadStream] status=200 但 Content-Range 匹配 startByte=${startByte}，按 206 透传`
    )
    const wrapped = new Response(response.body, {
      status: 206,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Content-Range': response.headers.get('content-range')!,
      },
    })
    return { response: wrapped, startByte }
  }

  // 上游真正未处理 Range（200 + 整个文件，无 Content-Range）且 startByte > 0：流式跳过
  if (response.status === 200 && startByte > 0) {
    const skippedStream = createSkippingStream(
      response.body,
      startByte,
      undefined,
      signal
    )
    const wrapped = new Response(skippedStream, {
      status: 206,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Content-Range': `bytes ${startByte}-*/*`,
      },
    })
    return { response: wrapped, startByte }
  }

  return { response, startByte }
}

/**
 * 带重试的媒体流下载。
 *
 * 返回 Response，调用方自行读取 body。
 * 重试策略：指数退避（500ms × 2^n，最多 MAX_FETCH_RETRIES 次）。
 * 当 signal.aborted / superseded / AbortError / InvalidStateError 时立即退出不重试。
 */
export async function downloadStreamWithRetry(
  url: string,
  options: DownloadOptions & { check?: DownloadAbortCheck }
): Promise<DownloadResult> {
  const { startByte = 0, signal, check } = options
  let attempt = 0

  while (true) {
    if (signal.aborted || check?.superseded?.()) {
      throw new Error('下载被取消')
    }

    try {
      return await downloadStream(url, { startByte, signal })
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw err
      if (check?.superseded?.()) throw err
      // 不可恢复错误不重试
      if (isInvalidStateError(err)) throw err

      attempt += 1
      if (attempt > MAX_FETCH_RETRIES) {
        throw new Error(
          `媒体流下载失败（已重试 ${MAX_FETCH_RETRIES} 次）: ${(err as Error).message}`,
          { cause: err }
        )
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)))
    }
  }
}
