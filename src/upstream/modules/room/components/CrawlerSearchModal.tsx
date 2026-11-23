/**
 * 爬虫引擎「全网搜片」弹窗。
 *
 * 入口：添加影片面板 B站 来源输入框旁的「全网搜索」按钮。
 * 站点规则由桌面端爬虫引擎维护，后端只代理 search/sites；前端不做页面解析。
 * 支持一次搜索多个站点（并发 3 个），结果按站点分组，可切换站点只看某一个。
 * 规则返回可播放直链（play_url/m3u8 等）的结果可以直接加入一起看。
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  Film,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  SearchX,
  Plus,
  ListVideo,
  ShieldCheck,
  X,
} from 'lucide-react'
import { logicalConnectionUrl } from '../../../../platform/connectionTransport'
import { FullscreenOverlay } from '@/components/ui/FullscreenOverlay'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Text } from '@/components/ui/Typography'
import { message } from '@/components/ui/message'
import { useRoomStore, type CrawlerSourceMeta } from '@/store/roomStore'
import { detectMediaFormat } from '@/lib/mediaFormat'
import { buildAntileechProxyUrl } from '@/lib/antileech-proxy-url'
import { cn } from '@/lib/utils'
import {
  CrawlerChallengeError,
  fetchCrawlerSites,
  pickPlayableUrl,
  resolveCrawlerPlay,
  searchCrawlerSite,
  verifyCrawlerChallenge,
  type CrawlerChallenge,
  type CrawlerSearchItem,
  type CrawlerSearchResult,
  type CrawlerSite,
} from '@/modules/crawler/api'

interface CrawlerSearchModalProps {
  open: boolean
  onClose: () => void
}

const SEARCH_CONCURRENCY = 3

interface ActiveChallenge {
  siteId: string
  keyword: string
  seq: number
  name: string
  info: CrawlerChallenge
}

function siteLabel(site: CrawlerSite): string {
  return site.name || site.site || site.id
}

function itemKey(siteId: string, item: CrawlerSearchItem): string {
  return `${siteId}:${item.url}`
}

export function CrawlerSearchModal({ open, onClose }: CrawlerSearchModalProps) {
  const roomId = useRoomStore((state) => state.roomId)
  const addMovie = useRoomStore((state) => state.addMovie)

  const [sites, setSites] = useState<CrawlerSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [sitesError, setSitesError] = useState('')
  const [activeSite, setActiveSite] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Record<string, CrawlerSearchResult>>(
    {}
  )
  const [siteErrors, setSiteErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string[]>([])
  // 分组剧集：展开哪一张结果卡、当前选中哪条线路。都是本地 UI 状态。
  const [pickerKey, setPickerKey] = useState('')
  const [groupChoice, setGroupChoice] = useState<Record<string, number>>({})
  const [searched, setSearched] = useState(false)
  const [adding, setAdding] = useState('')
  const [challengeQueue, setChallengeQueue] = useState<ActiveChallenge[]>([])
  const challenge = challengeQueue[0]
  const logicalProxyUrl = challenge ? logicalConnectionUrl(challenge.info.proxyUrl) : ''
  const isBridged = !!challenge && logicalProxyUrl !== challenge.info.proxyUrl
  const [challengeError, setChallengeError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const requestSeqRef = useRef(0)
  const verificationRef = useRef<AbortController | null>(null)
  const challengeId = challenge?.info.id
  const activeChallengeId = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    activeChallengeId.current = challengeId
  }, [challengeId])
  const abortVerification = useCallback(() => {
    verificationRef.current?.abort()
    verificationRef.current = null
  }, [])

  const dismissChallenge = () => {
    abortVerification()
    setVerifying(false)
    setChallengeError('')
    setChallengeQueue((queue) => queue.slice(1))
  }

  const closeSearch = () => {
    requestSeqRef.current += 1
    abortVerification()
    onClose()
  }
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const loadSites = useCallback(async () => {
    if (!roomId) return
    setSitesLoading(true)
    setSitesError('')
    try {
      const list = await fetchCrawlerSites(roomId)
      setSites(list)
    } catch (err) {
      setSitesError(err instanceof Error ? err.message : '获取站点失败')
      setSites([])
    } finally {
      setSitesLoading(false)
    }
  }, [roomId])

  useLayoutEffect(() => {
    setChallengeQueue([])
    setChallengeError('')
    setVerifying(false)
    setPickerKey('')
    if (!open) return
    setActiveSite('all')
    setResults({})
    setSiteErrors({})
    setPending([])
    setSearched(false)
    void loadSites()
    return () => {
      requestSeqRef.current += 1
      abortVerification()
    }
  }, [open, loadSites, abortVerification])

  const siteNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const site of sites) map[site.id] = siteLabel(site)
    return map
  }, [sites])

  const runSearch = useCallback(async () => {
    const query = keyword.trim()
    if (!query || !roomId) return
    if (sites.length === 0) {
      message.info(
        '还没有可用的站点规则，请联系管理员在管理页导入规则包。'
      )
      return
    }
    const targets =
      activeSite === 'all'
        ? sites.map((site) => site.id)
        : sites.filter((site) => site.id === activeSite).map((site) => site.id)
    if (targets.length === 0) return

    const seq = ++requestSeqRef.current
    abortVerification()
    setVerifying(false)
    setChallengeQueue([])
    setChallengeError('')
    setSearched(true)
    setPending(targets)
    setResults((prev) => {
      const next = { ...prev }
      for (const id of targets) delete next[id]
      return next
    })
    setSiteErrors((prev) => {
      const next = { ...prev }
      for (const id of targets) delete next[id]
      return next
    })

    let cursor = 0
    const worker = async () => {
      while (cursor < targets.length) {
        const index = cursor
        cursor += 1
        const siteId = targets[index]
        try {
          const result = await searchCrawlerSite(roomId, siteId, query, 30)
          if (requestSeqRef.current !== seq) return
          setResults((prev) => ({ ...prev, [siteId]: result }))
        } catch (err) {
          if (requestSeqRef.current !== seq) return
          if (err instanceof CrawlerChallengeError) {
            const site = sites.find((item) => item.id === siteId)
            const nextChallenge = {
              siteId,
              keyword: query,
              seq,
              name:
                site?.name ||
                err.challenge.name ||
                err.challenge.site ||
                siteId,
              info: err.challenge,
            }
            setChallengeQueue((queue) => [...queue, nextChallenge])
            setSiteErrors((prev) => ({
              ...prev,
              [siteId]: '需要人工验证后才能搜索',
            }))
            continue
          }
          setSiteErrors((prev) => ({
            ...prev,
            [siteId]: err instanceof Error ? err.message : '搜索失败',
          }))
        } finally {
          if (requestSeqRef.current === seq) {
            setPending((prev) => prev.filter((id) => id !== siteId))
          }
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(SEARCH_CONCURRENCY, targets.length) }, () =>
        worker()
      )
    )
  }, [abortVerification, activeSite, keyword, roomId, sites])

  const applyChallengeResult = useCallback(
    (siteId: string, result: CrawlerSearchResult) => {
      setResults((prev) => ({ ...prev, [siteId]: result }))
      setSiteErrors((prev) => {
        const next = { ...prev }
        delete next[siteId]
        return next
      })
      setChallengeQueue((queue) => queue.slice(1))
      setChallengeError('')
      message.success('验证完成，已获取搜索结果')
    },
    []
  )

  const handleVerify = async () => {
    if (!roomId || !challenge || verifying || verificationRef.current) return
    const { seq, siteId, keyword, info: { id: targetChallengeId } } = challenge
    if (requestSeqRef.current !== seq) return
    const controller = new AbortController()
    verificationRef.current = controller
    // Only the active request for the queue head may update this search.
    const isCurrent = () => requestSeqRef.current === seq &&
      activeChallengeId.current === targetChallengeId && verificationRef.current === controller
    setVerifying(true)
    setChallengeError('')
    try {
      const verification = await verifyCrawlerChallenge(targetChallengeId, controller.signal)
      if (!isCurrent()) return
      const result = verification.result ?? await searchCrawlerSite(roomId, siteId, keyword, 30, controller.signal)
      if (isCurrent()) applyChallengeResult(siteId, result)
    } catch (err) {
      if (!isCurrent()) return
      if (err instanceof CrawlerChallengeError) {
        const replacement = { ...challenge, info: err.challenge }
        setChallengeQueue((queue) => [replacement, ...queue.slice(1)])
      }
      setChallengeError(err instanceof Error ? err.message : '验证还没有完成，请继续')
    } finally {
      if (isCurrent()) {
        verificationRef.current = null
        setVerifying(false)
      }
    }
  }

  const handleAdd = useCallback(
    async (
      siteId: string,
      item: CrawlerSearchItem,
      episode?: { name: string; url: string }
    ) => {
      if (!roomId) return
      // 选集时用「集地址」作为忙碌键，避免同一影片的不同集互相覆盖状态。
      const busyKey = episode
        ? `${itemKey(siteId, item)}#${episode.url}`
        : itemKey(siteId, item)
      setAdding(busyKey)
      try {
        // 规则给了分组剧集时，目标地址就是这一集的地址（可能是直链也可能是播放页）。
        const target = episode ? episode.url : item.url
        let playUrl = episode
          ? detectMediaFormat(target) !== 'unknown'
            ? target
            : ''
          : pickPlayableUrl(item)
        let title = episode?.name
          ? `${item.title} · ${episode.name}`
          : item.title || ''
        let headers: Record<string, string> | undefined
        let sourceMeta: CrawlerSourceMeta | undefined
        if (!playUrl) {
          // 详情页/播放页：交给引擎按规则解析成直链（解析逻辑全部在后端）。
          const resolved = await resolveCrawlerPlay(roomId, target)
          if (resolved.format === 'iframe') {
            message.info(
              resolved.note ||
                '该站点正片需要会员或不允许直接播放，请打开原站查看'
            )
            return
          }
          if (!resolved.url) {
            message.info('没有解析到可播放地址，请打开原站查看')
            return
          }
          playUrl = resolved.url
          headers = resolved.headers
          title = resolved.title || title
          // 站点规则给了多档清晰度时记下档位名，播放器据此出清晰度下拉；
          // 只有一档就不用记。
          const qualities = (resolved.qualities || []).filter(
            (quality) => quality && quality.url && quality.name
          )
          const qualityNames =
            qualities.length > 1 ? qualities.map((quality) => quality.name) : []
          sourceMeta = {
            kind: 'crawler',
            sourceId: target,
            pageUrl: target,
            site: resolved.site,
            ruleId: resolved.ruleId,
            title: resolved.title || item.title,
            headers,
            qualities: qualityNames.length > 0 ? qualityNames : undefined,
            quality:
              qualityNames.length > 0
                ? qualities.find((quality) => quality.url === resolved.url)
                    ?.name || qualityNames[0]
                : undefined,
          }
        }
        const format = detectMediaFormat(playUrl)
        const finalUrl = headers
          ? buildAntileechProxyUrl('cms', playUrl, headers, {
              force: true,
              relative: true,
            })
          : playUrl
        await addMovie(roomId, {
          url: finalUrl,
          title: title || playUrl,
          cover: item.cover || undefined,
          source: 'mp4',
          format: format !== 'unknown' ? format : undefined,
          directLink: true,
          // 落库的直链带时效签名，播放时要用详情页重新解析一遍规则。
          sourceMeta,
        })
        message.success('影片已添加')
      } catch (err) {
        message.error(err instanceof Error ? err.message : '添加影片失败')
      } finally {
        setAdding('')
      }
    },
    [addMovie, roomId]
  )

  const orderedSites = useMemo(() => {
    const withResult: CrawlerSite[] = []
    const rest: CrawlerSite[] = []
    for (const site of sites) {
      if (
        results[site.id] ||
        siteErrors[site.id] ||
        pending.includes(site.id)
      ) {
        withResult.push(site)
      } else {
        rest.push(site)
      }
    }
    return [...withResult, ...rest]
  }, [pending, results, siteErrors, sites])

  const visibleSites = useMemo(() => {
    if (activeSite === 'all') return orderedSites
    const one = sites.find((site) => site.id === activeSite)
    return one ? [one] : []
  }, [activeSite, orderedSites, sites])

  const totalCount = useMemo(
    () =>
      Object.values(results).reduce(
        (sum, result) => sum + (result.items?.length || 0),
        0
      ),
    [results]
  )

  const resultCountFor = (siteId: string) => results[siteId]?.items?.length || 0

  return (
    <FullscreenOverlay
      open={open}
      onClose={closeSearch}
      className="crawler-search-modal max-w-5xl"
      title={
        <span className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          {'全网搜片'}
        </span>
      }
    >
      <div className="relative flex h-full flex-col">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch()
              }}
              placeholder="输入片名，在全部站点中搜索"
              className="min-w-0 flex-1"
            />
            <Button
              className="shrink-0"
              variant="primary"
              onClick={() => void runSearch()}
              disabled={
                pending.length > 0 || !keyword.trim() || sites.length === 0
              }
            >
              {pending.length > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-1.5">搜索</span>
            </Button>
            <Button
              className="shrink-0"
              variant="secondary"
              title="刷新站点规则"
              onClick={() => void loadSites()}
              disabled={sitesLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4', sitesLoading && 'animate-spin')}
              />
            </Button>
          </div>

          {sitesLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs opacity-70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {'正在加载站点规则…'}
            </div>
          ) : sitesError ? (
            <div className="flex items-start gap-2 rounded-[var(--md-sys-shape-corner)] bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1">{sitesError}</div>
              <button
                type="button"
                className="underline"
                onClick={() => void loadSites()}
              >
                {'重试'}
              </button>
            </div>
          ) : sites.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-[var(--zv-r-ctl,12px)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--glass-bg)] px-3 py-3 text-xs">
              <Text type="secondary">
                {'还没有可用的站点规则，请联系管理员在管理页导入规则包。'}
              </Text>
            </div>
          ) : (
            <div className="crawler-site-chips flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveSite('all')}
                className={cn(
                  'crawler-chip flex shrink-0 items-center gap-1.5 rounded-[var(--zv-r-chip,8px)] px-3 py-1.5 text-xs font-medium transition-colors',
                  activeSite === 'all'
                    ? 'text-[var(--md-sys-color-on-primary)]'
                    : 'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'
                )}
                style={{
                  backgroundColor:
                    activeSite === 'all'
                      ? 'var(--md-sys-color-primary)'
                      : 'var(--glass-bg)',
                }}
              >
                <Globe className="h-3.5 w-3.5" />
                {'全部站点'}
                <span className="opacity-70">{sites.length}</span>
                {totalCount > 0 && (
                  <span className="rounded-full bg-black/10 px-1.5 text-[10px]">
                    {totalCount}
                  </span>
                )}
              </button>
              {orderedSites.map((site) => {
                const active = activeSite === site.id
                const count = resultCountFor(site.id)
                const loading = pending.includes(site.id)
                const failed = Boolean(siteErrors[site.id])
                return (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setActiveSite(site.id)}
                    title={site.description || site.site}
                    className={cn(
                      'crawler-chip flex shrink-0 items-center gap-1.5 rounded-[var(--zv-r-chip,8px)] px-3 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'text-[var(--md-sys-color-on-primary)]'
                        : 'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'
                    )}
                    style={{
                      backgroundColor: active
                        ? 'var(--md-sys-color-primary)'
                        : 'var(--glass-bg)',
                    }}
                  >
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : failed ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {siteLabel(site)}
                    {searched && !loading && (
                      <span className="opacity-70">{failed ? '!' : count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {!searched ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Search className="h-10 w-10 opacity-30" />
              <Text type="secondary" className="text-sm">
                {'输入片名后，会同时在全部可用站点搜索'}
              </Text>
              <Text type="secondary" className="text-xs opacity-70">
                {'搜索结果由服务端爬虫引擎解析'}
              </Text>
            </div>
          ) : pending.length > 0 &&
            Object.keys(results).length === 0 &&
            Object.keys(siteErrors).length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin opacity-60" />
              <Text type="secondary" className="text-sm">
                {`正在搜索 ${pending.length} 个站点…`}
              </Text>
            </div>
          ) : totalCount === 0 && pending.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <SearchX className="h-10 w-10 opacity-30" />
              <Text type="secondary" className="text-sm">
                {'没有搜到结果'}
              </Text>
              {Object.entries(siteErrors).map(([siteId, error]) => (
                <Text
                  key={siteId}
                  type="secondary"
                  className="max-w-xl text-xs opacity-70"
                >
                  {siteNameMap[siteId] || siteId}: {error}
                </Text>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {visibleSites.map((site) => {
                const result = results[site.id]
                const error = siteErrors[site.id]
                const loading = pending.includes(site.id)
                return (
                  <section key={site.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4 opacity-60" />
                      <Text className="text-sm font-semibold">
                        {siteLabel(site)}
                      </Text>
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" />
                      ) : error ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--md-sys-color-error)]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {error}
                        </span>
                      ) : (
                        <Text type="secondary" className="text-xs">
                          {`${result?.items?.length || 0} 条`}
                          {result?.tookMs
                            ? ` · ${(result.tookMs / 1000).toFixed(1)}s`
                            : ''}
                          {result?.repaired ? ` · ${'规则已自动修复'}` : ''}
                        </Text>
                      )}
                    </div>
                    {result?.warnings?.length ? (
                      <div className="mb-2 flex flex-col gap-1 rounded-[var(--md-sys-shape-corner)] bg-[var(--md-sys-color-surface-container-high)] px-3 py-2">
                        {result.warnings.map((warning) => (
                          <Text
                            key={warning}
                            type="secondary"
                            className="text-[11px]"
                          >
                            {warning}
                          </Text>
                        ))}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {(result?.items || []).map((item) => {
                        const key = itemKey(site.id, item)
                        const playable = pickPlayableUrl(item)
                        const busy = adding === key
                        const groups = item.groups || []
                        const hasGroups = groups.length > 0
                        const groupIndex = Math.min(
                          groupChoice[key] || 0,
                          Math.max(groups.length - 1, 0)
                        )
                        const activeGroup = groups[groupIndex]
                        return (
                          <div
                            key={key}
                            className="flex gap-2.5 rounded-[var(--md-sys-shape-corner)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--glass-bg)] p-2.5"
                          >
                            <div className="h-[68px] w-[48px] shrink-0 overflow-hidden rounded-md bg-[var(--md-sys-color-surface-container-highest)]">
                              {item.cover ? (
                                <img
                                  src={item.cover}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center opacity-40">
                                  <Film className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <Text className="line-clamp-2 text-xs font-semibold leading-snug">
                                {item.title}
                              </Text>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] opacity-65">
                                {item.author && <span>{item.author}</span>}
                                {item.duration && <span>{item.duration}</span>}
                                {hasGroups ? (
                                  <span>
                                    {`${groups.length} 条线路 · ${groups.reduce((sum, group) => sum + group.episodes.length, 0)} 集`}
                                  </span>
                                ) : playable ? (
                                  <span>可播放直链</span>
                                ) : (
                                  <span>需解析</span>
                                )}
                              </div>
                              {item.description && (
                                <Text
                                  type="secondary"
                                  className="mt-0.5 line-clamp-2 text-[10px] leading-snug"
                                >
                                  {item.description}
                                </Text>
                              )}
                              <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={busy}
                                  title={
                                    hasGroups
                                      ? '选择集数后加入一起看'
                                      : playable
                                        ? '加入一起看'
                                        : '解析播放地址后加入一起看'
                                  }
                                  onClick={() => {
                                    if (hasGroups) {
                                      setPickerKey((prev) =>
                                        prev === key ? '' : key
                                      )
                                      return
                                    }
                                    void handleAdd(site.id, item)
                                  }}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : hasGroups ? (
                                    <ListVideo className="h-3.5 w-3.5" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1">
                                    {hasGroups ? '选集' : '加入'}
                                  </span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  title="打开原站"
                                  onClick={() =>
                                    window.open(item.url, '_blank', 'noopener')
                                  }
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              {hasGroups &&
                                pickerKey === key &&
                                activeGroup && (
                                  <div className="mt-1.5 rounded-md bg-[var(--md-sys-color-surface-container-high)] p-1.5">
                                    {groups.length > 1 && (
                                      <div className="mb-1 flex flex-wrap gap-1">
                                        {groups.map((group, index) => (
                                          <button
                                            key={`${group.name}-${index}`}
                                            type="button"
                                            className={cn(
                                              'rounded-[var(--zv-r-chip,8px)] px-2 py-0.5 text-[10px] font-medium transition-colors',
                                              index === groupIndex
                                                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                                                : 'bg-[var(--glass-bg)] opacity-75'
                                            )}
                                            onClick={() =>
                                              setGroupChoice((prev) => ({
                                                ...prev,
                                                [key]: index,
                                              }))
                                            }
                                          >
                                            {group.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="grid max-h-24 grid-cols-3 gap-1 overflow-auto">
                                      {activeGroup.episodes.map((episode) => {
                                        const episodeBusy =
                                          adding === `${key}#${episode.url}`
                                        return (
                                          <button
                                            key={episode.url}
                                            type="button"
                                            disabled={episodeBusy}
                                            title={episode.name}
                                            className="truncate rounded bg-[var(--glass-bg)] px-1.5 py-1 text-[10px] hover:bg-[var(--md-sys-color-secondary-container)] disabled:opacity-50"
                                            onClick={() =>
                                              void handleAdd(
                                                site.id,
                                                item,
                                                episode
                                              )
                                            }
                                          >
                                            {episodeBusy ? '…' : episode.name}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
        {challenge && (
          <div className="absolute inset-0 z-50 flex flex-col gap-2 rounded-[var(--md-sys-shape-corner)] bg-[var(--md-sys-color-surface)] p-3 shadow-2xl">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--md-sys-color-primary)]" />
              <div className="min-w-0 flex-1">
                <Text className="text-sm font-semibold">
                  {`${challenge.name} 需要完成人机验证`}
                </Text>
                <Text type="secondary" className="mt-0.5 line-clamp-2 text-xs">
                  {challenge.info.note ||
                    '请在下方页面完成验证（如拖动滑块、输入验证码）。'}
                </Text>
                {isBridged && (
                  <Text type="secondary" className="mt-1 text-xs">
                    当前通过安全连接桥访问，若验证页无法加载请点击外部浏览器打开
                  </Text>
                )}
              </div>
              <button
                type="button"
                className="rounded-full p-1 opacity-60 transition-opacity hover:opacity-100"
                title="关闭"
                onClick={dismissChallenge}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe
              ref={iframeRef}
              title="人机验证"
              src={challenge.info.proxyUrl}
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              referrerPolicy="no-referrer"
              className="min-h-0 w-full flex-1 rounded-lg border-0 bg-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              {challengeError ? (
                <Text className="line-clamp-2 min-w-[140px] flex-1 text-xs text-[var(--md-sys-color-error)]">
                  {challengeError}
                </Text>
              ) : (
                <Text type="secondary" className="min-w-[140px] flex-1 text-xs">
                  完成验证后点击「我已完成」继续搜索
                </Text>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-2">
              {isBridged && (
                <Button variant="secondary" size="sm" onClick={() => window.open(logicalProxyUrl, '_blank', 'noopener')}>
                  外部打开
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const frame = iframeRef.current
                  if (!frame) return
                  const joiner = challenge.info.proxyUrl.includes('?')
                    ? '&'
                    : '?'
                  frame.src = `${challenge.info.proxyUrl}${joiner}_r=${Date.now()}`
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="ml-1">刷新验证页</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={verifying}
                onClick={() => void handleVerify()}
              >
                {verifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">
                  {verifying ? '验证中…' : '我已完成'}
                </span>
              </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FullscreenOverlay>
  )
}
