export interface Mp4Box {
  type: string
  size: number
  start: number
  end: number
  dataOffset: number
  children?: Mp4Box[]
}

/**
 * 解析 MP4 文件的 box 结构，返回顶级 box 列表。
 * 仅解析到指定的最大字节数，避免下载整个文件。
 */
export function parseMp4Boxes(
  buffer: ArrayBuffer,
  maxBytes: number = buffer.byteLength
): Mp4Box[] {
  const view = new DataView(buffer, 0, Math.min(buffer.byteLength, maxBytes))
  const boxes: Mp4Box[] = []
  let offset = 0

  while (offset + 8 <= view.byteLength) {
    const size = view.getUint32(offset)
    const type = readBoxType(view, offset + 4)
    let actualSize = size
    let headerSize = 8

    if (size === 1) {
      if (offset + 16 > view.byteLength) break
      actualSize = Number(view.getBigUint64(offset + 8))
      headerSize = 16
    } else if (size === 0) {
      actualSize = view.byteLength - offset
    }

    const start = offset
    const end = offset + actualSize
    const dataOffset = offset + headerSize

    boxes.push({
      type,
      size: actualSize,
      start,
      end,
      dataOffset,
    })

    if (end > view.byteLength) break
    offset = end
  }

  return boxes
}

/**
 * 递归查找指定类型的 box（仅在顶级及其子级中查找，不深于 3 层）。
 */
export function findBox(boxes: Mp4Box[], type: string): Mp4Box | undefined {
  for (const box of boxes) {
    if (box.type === type) return box
  }
  return undefined
}

/**
 * 递归查找指定路径的 box（如 ['moov', 'trak', 'mdia']）。
 */
export function findBoxByPath(
  buffer: ArrayBuffer,
  path: string[]
): Mp4Box | undefined {
  let boxes = parseMp4Boxes(buffer)
  let found: Mp4Box | undefined

  for (let i = 0; i < path.length; i++) {
    found = findBox(boxes, path[i])
    if (!found) return undefined
    if (i < path.length - 1) {
      const childBuffer = buffer.slice(found.dataOffset, found.end)
      boxes = parseMp4Boxes(childBuffer)
    }
  }

  if (found) {
    return found
  }
  return undefined
}

/**
 * 解析 sidx box，返回 segment 索引条目。
 */
export interface SidxReference {
  referenceType: number
  referencedSize: number
  subsegmentDuration: number
  startsWithSap: boolean
  sapType: number
  sapDeltaTime: number
}

export interface SidxInfo {
  version: number
  flags: number
  referenceId: number
  timescale: number
  earliestPresentationTime: number
  firstOffset: number
  references: SidxReference[]
}

export function parseSidx(buffer: ArrayBuffer, box: Mp4Box): SidxInfo | null {
  if (box.type !== 'sidx') return null

  const view = new DataView(
    buffer,
    box.dataOffset,
    box.size - (box.dataOffset - box.start)
  )
  let offset = 0

  const version = view.getUint8(offset)
  const flags =
    (view.getUint8(offset + 1) << 16) |
    (view.getUint8(offset + 2) << 8) |
    view.getUint8(offset + 3)
  offset += 4

  const referenceId = view.getUint32(offset)
  offset += 4

  const timescale = view.getUint32(offset)
  offset += 4

  let earliestPresentationTime: number
  let firstOffset: number

  if (version === 0) {
    earliestPresentationTime = view.getUint32(offset)
    offset += 4
    firstOffset = view.getUint32(offset)
    offset += 4
  } else {
    earliestPresentationTime = Number(view.getBigUint64(offset))
    offset += 8
    firstOffset = Number(view.getBigUint64(offset))
    offset += 8
  }

  // reserved (2 bytes)
  offset += 2

  const referenceCount = view.getUint16(offset)
  offset += 2

  const references: SidxReference[] = []
  for (let i = 0; i < referenceCount; i++) {
    const refSizeAndType = view.getUint32(offset)
    offset += 4
    const referenceType = (refSizeAndType >> 31) & 1
    const referencedSize = refSizeAndType & 0x7fffffff

    const subsegmentDuration = view.getUint32(offset)
    offset += 4

    const sapInfo = view.getUint32(offset)
    offset += 4
    const startsWithSap = ((sapInfo >> 31) & 1) === 1
    const sapType = (sapInfo >> 28) & 0x0f
    const sapDeltaTime = sapInfo & 0x0fffffff

    references.push({
      referenceType,
      referencedSize,
      subsegmentDuration,
      startsWithSap,
      sapType,
      sapDeltaTime,
    })
  }

  return {
    version,
    flags,
    referenceId,
    timescale,
    earliestPresentationTime,
    firstOffset,
    references,
  }
}

/**
 * 在 MP4 buffer 中查找所有顶级 sidx box。
 *
 * B站 m4s 是 fMP4，可能存在多个 sidx box（每个 sidx 索引一段视频）。
 * 单 sidx 的 fMP4 只索引部分 segment，seek 到 sidx 覆盖范围外会失败。
 * 多 sidx 结构：ftyp + moov + sidx1 + moof...moof + sidx2 + moof...moof + ...
 *
 * 实现方式：滑动窗口搜索 "sidx" box type，避免 parseMp4Boxes 遇到大 moof/mdat 时停止。
 * fMP4 的 moof/mdat 可能很大（数 MB），parseMp4Boxes 在 box.end > buffer.byteLength 时 break，
 * 导致后续 sidx 无法被发现。滑动窗口搜索可以跳过大 box，找到所有 sidx。
 *
 * @returns 所有 sidx 的字节范围和解析信息，按文件顺序排列
 */
export function findAllSidxInBuffer(
  buffer: ArrayBuffer
): { range: string; info: SidxInfo | null; box: Mp4Box }[] {
  const result: { range: string; info: SidxInfo | null; box: Mp4Box }[] = []
  const view = new DataView(buffer)
  const len = view.byteLength

  // 滑动窗口搜索 "sidx"（4 字节 ASCII: 0x73 0x69 0x64 0x78）
  // box header: [size(4 bytes)][type(4 bytes)]
  // 搜索 type = "sidx" 的位置
  for (let offset = 0; offset + 8 <= len; offset++) {
    // 检查 type 是否为 "sidx"
    if (
      view.getUint8(offset + 4) !== 0x73 || // 's'
      view.getUint8(offset + 5) !== 0x69 || // 'i'
      view.getUint8(offset + 6) !== 0x64 || // 'd'
      view.getUint8(offset + 7) !== 0x78 // 'x'
    ) {
      continue
    }

    // 读取 box size
    const size = view.getUint32(offset)
    if (size < 8 || size > 10 * 1024 * 1024) {
      // size 不合理（sidx 通常 < 10MB），跳过
      continue
    }

    // 计算 box 范围
    const boxStart = offset
    const boxEnd = offset + size
    if (boxEnd > len) {
      // sidx 超出 buffer 范围，跳过
      continue
    }

    const box: Mp4Box = {
      type: 'sidx',
      size,
      start: boxStart,
      end: boxEnd,
      dataOffset: offset + 8,
    }

    const info = parseSidx(buffer, box)
    result.push({
      range: `${boxStart}-${boxEnd - 1}`,
      info,
      box,
    })

    // 跳过当前 sidx box，继续搜索
    offset = boxEnd - 1
  }

  return result
}

/**
 * 在 MP4 buffer 中查找第一个 sidx box 并返回其字节范围。
 * 保留用于向后兼容，新代码应使用 findAllSidxInBuffer。
 */
export function findSidxInBuffer(
  buffer: ArrayBuffer
): { range: string; info: SidxInfo | null } | null {
  const all = findAllSidxInBuffer(buffer)
  if (all.length === 0) return null
  const first = all[0]
  return { range: first.range, info: first.info }
}

/**
 * 查找 moov box 的字节范围。
 */
export function findMoovRange(buffer: ArrayBuffer): string | null {
  const boxes = parseMp4Boxes(buffer)
  const moov = findBox(boxes, 'moov')
  if (!moov) return null
  return `${moov.start}-${moov.end - 1}`
}

function readBoxType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  )
}
