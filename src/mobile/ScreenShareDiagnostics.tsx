import { Activity, ChevronDown } from 'lucide-react'
import { aggregateEdgeStats, type ShareEdgeStats } from '@/modules/screen-sharing/core/edge-stats'
import type { ScreenShareSettings } from '../platform/contracts'
import './screen-share-diagnostics.css'

const stateLabels = { new: '等待', connecting: '连接中', connected: '已连接', disconnected: '暂时断开', failed: '失败', closed: '已关闭' }
const reasons = { none: '无', cpu: '编码性能', bandwidth: '带宽', other: '其他' }
const number = (value: number | null | undefined, suffix: string, digits = 0) => value == null || !Number.isFinite(value) ? '暂无' : `${value.toFixed(digits)} ${suffix}`

export function ScreenShareDiagnostics({ edges, settings, overlay = false }: { edges: ShareEdgeStats[]; settings?: ScreenShareSettings; overlay?: boolean }) {
  const aggregate = aggregateEdgeStats(edges)
  return <details className="screen-share-diagnostics" data-overlay={overlay || undefined}>
    <summary><Activity size={16} aria-hidden="true" /><span>连接与画质</span><ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="screen-share-diagnostics-content">
      <p>连接 {aggregate.connectedCount} / {aggregate.edgeCount} · {edges.some(edge => edge.direction === 'inbound') ? '接收' : '发送'} {number(aggregate.bitrate == null ? null : aggregate.bitrate / 1e6, 'Mbps', 2)}</p>
      {settings && <>
        <p>目标 {number(settings.targetFrameRate, 'fps')} · 采集配置 {number(settings.configuredFrameRate, 'fps')} · 采集实测 {settings.frameRateMeasured ? number(settings.frameRate, 'fps', 1) : '暂无'}</p>
        {settings.videoReason && <p>{settings.videoReason}</p>}
        {!settings.encoders?.length && <p>等待观众连接后读取编码参数</p>}
        {settings.encoders?.map((encoder, index) => <p key={`${encoder.connectionId}-${index}`}>
          编码 {encoder.connectionId.slice(-8)}：上限 {number(encoder.maxFrameRate, 'fps')} · 缩放 {number(encoder.scaleResolutionDownBy, '倍', 1)} · 码率上限 {encoder.maxBitrate === undefined ? '未设置' : number(encoder.maxBitrate / 1e6, 'Mbps', 2)}
          {encoder.active === false ? ' · 编码已停用' : ''} · 退化策略 {encoder.degradationPreference ?? '系统未返回'}{encoder.reason ? ` · ${encoder.reason}` : ''}
        </p>)}
      </>}
      {edges.length === 0 && <p>尚无媒体连接</p>}
      {edges.map(edge => <div className="screen-share-diagnostics-edge" key={edge.connectionId}>
        <strong>{edge.direction === 'inbound' ? '接收' : '发送'} {edge.connectionId.slice(-8)} · {stateLabels[edge.state]}</strong>
        <dl>
          <dt>画面</dt><dd>{edge.stats.resolution ? `${edge.stats.resolution.width} × ${edge.stats.resolution.height}` : '暂无'} · {edge.stats.codec ?? '暂无'}</dd>
          <dt>实测</dt><dd>{number(edge.stats.frameRate, 'fps', 1)} · {number(edge.stats.bitrate == null ? null : edge.stats.bitrate / 1e6, 'Mbps', 2)}</dd>
          <dt>网络</dt><dd>{number(edge.quality?.rttMs ?? edge.stats.rttMs, 'ms')} · 丢包 {number((edge.quality?.packetLossRate ?? edge.stats.windowPacketLossRate) == null ? null : (edge.quality?.packetLossRate ?? edge.stats.windowPacketLossRate)! * 100, '%', 1)}</dd>
          <dt>编码</dt><dd>{number(edge.stats.encodeMsPerFrame, 'ms/帧', 1)} · 受限 {edge.stats.qualityLimitationReason ? reasons[edge.stats.qualityLimitationReason] : '暂无'}</dd>
        </dl>
      </div>)}
    </div>
  </details>
}
