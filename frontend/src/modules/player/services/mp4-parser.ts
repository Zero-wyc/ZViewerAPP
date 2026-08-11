/**
 * MP4 Box 解析器
 *
 * 用于解析 fragmented MP4 (fMP4) 文件结构，支持：
 * - 找到 init segment 边界（ftyp + moov 连续区域的结束位置）
 * - 解析 mvhd 获取视频时长（秒）
 * - 在数据中扫描第一个完整的 moof box 边界
 *
 * 用于 MSE seek 到未缓冲区域时，通过 Range 请求从目标位置附近开始下载，
 * 避免从头下载导致的长时间等待。
 */

interface BoxInfo {
  type: string
  offset: number
  size: number
  end: number
}

/** 读取大端 uint32 */
function readU32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  )
}

/** 读取大端 uint64（返回 number，对于时间戳够用） */
function readU64(data: Uint8Array, offset: number): number {
  const hi = readU32(data, offset)
  const lo = readU32(data, offset + 4)
  return hi * 0x100000000 + lo
}

/** 读取 4 字节 ASCII type */
function readType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3]
  )
}

/**
 * 解析单个 box header。
 * @returns box 信息，或 null 如果数据不足
 */
function parseBox(data: Uint8Array, offset: number): BoxInfo | null {
  if (offset + 8 > data.length) return null

  let size = readU32(data, offset)
  const type = readType(data, offset + 4)
  let headerSize = 8

  if (size === 1) {
    // extended size（64 位）
    if (offset + 16 > data.length) return null
    size = readU64(data, offset + 8)
    headerSize = 16
  } else if (size === 0) {
    // box 延伸到文件末尾
    size = data.length - offset
  }

  if (size < headerSize) return null

  return { type, offset, size, end: offset + size }
}

/**
 * 遍历顶层数据中的所有 box。
 */
export function* iterBoxes(
  data: Uint8Array,
  start: number = 0
): Generator<BoxInfo> {
  let offset = start
  while (offset < data.length) {
    const box = parseBox(data, offset)
    if (!box) break
    yield box
    offset = box.end
  }
}

/**
 * 找到 init segment 的字节大小（ftyp [+ free/skip...] + moov 的结束位置）。
 *
 * fMP4 文件的 init segment 由 ftyp + moov 组成，在文件开头连续排列。
 * 部分文件（如 B站 m4s）在 ftyp 与 moov 之间会插入 free/skip 填充 box，
 * 需要跳过这些 padding box 才能找到 moov。
 * moov 之后是 sidx（可选）和 moof + mdat（媒体分片）。
 *
 * @param data 文件头部数据（至少包含完整的 ftyp + moov）
 * @returns init segment 大小，或 null 如果未找到 moov
 */
export function findInitSegmentSize(data: Uint8Array): number | null {
  let foundFtyp = false
  for (const box of iterBoxes(data, 0)) {
    if (box.type === 'ftyp') {
      foundFtyp = true
    } else if (box.type === 'moov') {
      // moov 前必须有 ftyp（init segment 起始于 ftyp）
      if (!foundFtyp) return null
      return box.end
    } else if (box.type === 'free' || box.type === 'skip') {
      // 跳过 padding box，继续寻找 moov（B站 m4s 在 ftyp 后有 free box）
      continue
    } else {
      // 遇到其他类型 box（sidx/moof/mdat 等）说明 moov 不会出现了
      break
    }
  }
  return null
}

/**
 * 从 moov box 中解析 mvhd，获取媒体时长（秒）。
 *
 * mvhd（Movie Header Box）包含 timescale 和 duration，
 * duration（秒）= duration / timescale。
 *
 * @param data 文件头部数据（至少包含完整的 moov）
 * @returns { duration, timescale } 或 null 如果解析失败
 */
export function parseMvhdDuration(
  data: Uint8Array
): { duration: number; timescale: number } | null {
  // 找到 moov box
  let moovBox: BoxInfo | null = null
  for (const box of iterBoxes(data, 0)) {
    if (box.type === 'moov') {
      moovBox = box
      break
    }
  }
  if (!moovBox) return null

  // 在 moov 内部找 mvhd（mvhd 通常是 moov 的第一个子 box）
  const moovData = data.subarray(moovBox.offset + 8, moovBox.end)
  for (const box of iterBoxes(moovData, 0)) {
    if (box.type === 'mvhd') {
      const mvhdData = moovData.subarray(box.offset + 8, box.end)
      if (mvhdData.length < 4) return null
      const version = mvhdData[0]
      let offset = 4 // version(1) + flags(3)

      if (version === 1) {
        // version 1: creation_time(8) + modification_time(8) + timescale(4) + duration(8)
        if (mvhdData.length < offset + 28) return null
        offset += 16 // creation_time + modification_time
        const timescale = readU32(mvhdData, offset)
        const duration = readU64(mvhdData, offset + 4)
        return { duration: duration / timescale, timescale }
      } else {
        // version 0: creation_time(4) + modification_time(4) + timescale(4) + duration(4)
        if (mvhdData.length < offset + 16) return null
        offset += 8 // creation_time + modification_time
        const timescale = readU32(mvhdData, offset)
        const duration = readU32(mvhdData, offset + 4)
        return { duration: duration / timescale, timescale }
      }
    }
  }
  return null
}

/**
 * sidx 解析结果。
 */
export interface SidxInfo {
  /** 媒体时间刻度 */
  timescale: number
  /** sidx box 结束位置（init segment 之后） */
  end: number
  /** 第一个媒体分片相对于 sidx box 结束位置的字节偏移 */
  firstOffset: number
  /** 每个 reference 的累计开始时间（秒）和字节大小 */
  references: { startTime: number; duration: number; size: number }[]
}

/**
 * 解析 sidx（Segment Index Box）。
 *
 * sidx 描述了 fMP4 文件中每个 subsegment 的字节偏移和时间信息，
 * 用于 seek 时精确定位到目标时间所在的 subsegment 起始位置，
 * 避免线性估算在 VBR 视频下的较大偏差。
 *
 * @param data 包含完整 sidx box 的文件头部数据
 * @param sidxOffset sidx box 的起始偏移
 * @returns SidxInfo 或 null 如果解析失败
 */
export function parseSidx(
  data: Uint8Array,
  sidxOffset: number
): SidxInfo | null {
  const sidxBox = parseBox(data, sidxOffset)
  if (!sidxBox || sidxBox.type !== 'sidx') return null

  const boxData = data.subarray(sidxBox.offset + 8, sidxBox.end)
  if (boxData.length < 12) return null

  const version = boxData[0]
  let offset = 4 // version(1) + flags(3)

  if (boxData.length < offset + 8) return null
  offset += 4 // reference_ID
  const timescale = readU32(boxData, offset)
  offset += 4

  let earliestPresentationTime: number
  let firstOffset: number

  if (version === 0) {
    if (boxData.length < offset + 8) return null
    earliestPresentationTime = readU32(boxData, offset)
    offset += 4
    firstOffset = readU32(boxData, offset)
    offset += 4
  } else {
    if (boxData.length < offset + 16) return null
    earliestPresentationTime = readU64(boxData, offset)
    offset += 8
    firstOffset = readU64(boxData, offset)
    offset += 8
  }

  if (boxData.length < offset + 4) return null
  offset += 2 // reserved
  const referenceCount = readU16(boxData, offset)
  offset += 2

  const references: { startTime: number; duration: number; size: number }[] = []
  let currentTime = earliestPresentationTime
  for (let i = 0; i < referenceCount; i++) {
    if (boxData.length < offset + 12) return null
    const ref1 = readU32(boxData, offset)
    const referenceSize = ref1 & 0x7fffffff
    // const referenceType = ref1 >>> 31
    const subsegmentDuration = readU32(boxData, offset + 4)
    offset += 8
    // const ref2 = readU32(boxData, offset) // SAP info
    offset += 4

    references.push({
      startTime: currentTime / timescale,
      duration: subsegmentDuration / timescale,
      size: referenceSize,
    })
    currentTime += subsegmentDuration
  }

  return {
    timescale,
    end: sidxBox.end,
    firstOffset,
    references,
  }
}

/** 读取大端 uint16 */
function readU16(data: Uint8Array, offset: number): number {
  return ((data[offset] << 8) | data[offset + 1]) >>> 0
}

/**
 * 根据目标时间从 sidx 信息中计算精确的字节偏移。
 *
 * 返回目标时间所在 subsegment 的起始字节偏移（相对于文件开头）。
 * 如果目标时间早于第一个 subsegment，返回 sidx.end + firstOffset。
 *
 * @param sidx SidxInfo
 * @param targetTime 目标时间（秒）
 * @returns 字节偏移，或 null 如果无法计算
 */
export function findByteOffsetByTime(
  sidx: SidxInfo,
  targetTime: number
): number | null {
  if (sidx.references.length === 0) return null

  let offset = sidx.end + sidx.firstOffset
  for (const ref of sidx.references) {
    if (targetTime <= ref.startTime + ref.duration) {
      return offset
    }
    offset += ref.size
  }

  // 目标时间超过最后一个 subsegment，返回最后一个 subsegment 起始位置
  return offset - sidx.references[sidx.references.length - 1].size
}

/**
 * 在数据中查找第一个完整的 moof box 的起始偏移量。
 *
 * 当从文件中间位置开始下载时，数据开头可能不是完整的 box。
 * 此函数扫描数据，找到 'moof' 标记并验证其完整性。
 *
 * @param data 从中间位置开始下载的数据
 * @returns moof box 起始偏移量，或 null 如果未找到完整 moof
 */
export function findFirstMoof(data: Uint8Array): number | null {
  // 'moof' 的 ASCII 码：0x6D 0x6F 0x6F 0x66
  for (let i = 4; i <= data.length - 8; i++) {
    if (
      data[i] === 0x6d && // 'm'
      data[i + 1] === 0x6f && // 'o'
      data[i + 2] === 0x6f && // 'o'
      data[i + 3] === 0x66 // 'f'
    ) {
      // size 字段在 type 之前 4 字节
      const boxOffset = i - 4
      if (boxOffset < 0) continue

      // 验证 box header 的有效性
      const box = parseBox(data, boxOffset)
      if (box && box.type === 'moof' && box.end <= data.length) {
        return boxOffset
      }
    }
  }
  return null
}

/**
 * 找到数据中最后一个完整的 moof+mdat fragment 的结束位置。
 *
 * fMP4 的媒体数据由多个 moof+mdat fragment 组成。Chrome 的 chunk demuxer
 * 要求 append 的数据以完整 fragment 边界结束——如果末尾是截断的 mdat
 * (mdat box 未完整包含在数据内)，demuxer 会尝试解码不完整帧并抛出
 * CHUNK_DEMUXER_ERROR_APPEND_FAILED (video.error code=3)，导致永久黑屏。
 *
 * 此函数扫描数据中的 moof/mdat box 边界，返回最后一个完整 fragment
 * (moof + 完整 mdat) 的结束字节偏移。调用方据此只 flush 完整 fragment，
 * 保留剩余数据等待下一次 flush。
 *
 * @param data 已对齐到 moof 起点的数据（第一个 box 应为 moof）
 * @returns 最后一个完整 fragment 的结束偏移；无完整 fragment 时返回 0
 */
export function findLastCompleteFragmentEnd(data: Uint8Array): number {
  let lastCompleteEnd = 0
  let offset = 0
  while (offset + 8 <= data.length) {
    const box = parseBox(data, offset)
    if (!box) break
    if (box.type === 'moof') {
      // moof 后应紧跟 mdat；若 mdat 未完整包含则此 fragment 不完整
      if (box.end + 8 > data.length) break
      const mdatBox = parseBox(data, box.end)
      if (mdatBox && mdatBox.type === 'mdat' && mdatBox.end <= data.length) {
        lastCompleteEnd = mdatBox.end
        offset = mdatBox.end
      } else {
        // moof 后非 mdat 或 mdat 不完整
        break
      }
    } else {
      // 非 moof box（如 sidx、free 等），跳过
      offset = box.end
    }
  }
  return lastCompleteEnd
}
