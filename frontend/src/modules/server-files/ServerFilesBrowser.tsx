import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, File, Folder, HardDrive, Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Text } from '@/components/ui/Typography'
import {
  browseServerFiles,
  listServerRoots,
  extractRootKey,
} from './serverFilesApi'
import type { ServerFileEntry, ServerFileRoot } from './types'

interface ServerFilesBrowserProps {
  open: boolean
  onClose: () => void
  onSelectFile?: (path: string) => void
  selectable?: boolean
}

function formatSize(size?: number): string {
  if (size === undefined || size === null) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function ServerFilesBrowser({
  open,
  onClose,
  onSelectFile,
  selectable = false,
}: ServerFilesBrowserProps) {
  const [entries, setEntries] = useState<ServerFileEntry[]>([])
  const [currentPath, setCurrentPath] = useState<string>('uploads:/')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 根目录列表
  const [roots, setRoots] = useState<ServerFileRoot[]>([])
  const [rootsMenuOpen, setRootsMenuOpen] = useState(false)

  const currentRootKey = extractRootKey(currentPath)
  const currentRoot = roots.find((r) => r.key === currentRootKey)

  const loadRoots = useCallback(async () => {
    try {
      const list = await listServerRoots()
      setRoots(list)
    } catch {
      // 静默失败，根目录加载错误不影响浏览
    }
  }, [])

  const load = useCallback(async (path?: string) => {
    setLoading(true)
    setError('')
    try {
      const data = await browseServerFiles(path)
      setEntries(data.entries)
      setCurrentPath(data.currentPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开时重置路径并加载
      setCurrentPath('uploads:/')
      setEntries([])
      void loadRoots()
      void load('uploads:/')
    }
  }, [open, load, loadRoots])

  // 关闭根目录下拉
  useEffect(() => {
    if (!rootsMenuOpen) return
    const onClick = () => setRootsMenuOpen(false)
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [rootsMenuOpen])

  const handleEntryClick = (entry: ServerFileEntry) => {
    if (entry.type === 'directory') {
      void load(entry.path)
    } else if (selectable && onSelectFile) {
      onSelectFile(entry.path)
      onClose()
    }
  }

  const handleBack = () => {
    const match = currentPath.match(/^(uploads|custom:\d+):(.*)$/)
    if (!match) return
    const rootKey = match[1]
    const rel = match[2].replace(/^\/+/, '')
    if (!rel) return
    const parent = rel.split('/').slice(0, -1).join('/')
    void load(`${rootKey}:/${parent}`)
  }

  const handleSwitchRoot = (root: ServerFileRoot) => {
    setRootsMenuOpen(false)
    if (root.key === currentRootKey) return
    if (!root.exists) return
    void load(`${root.key}:/`)
  }

  // 截断显示：去掉 'rootKey:' 前缀只显示相对路径部分
  const displayPath = (() => {
    const match = currentPath.match(/^(uploads|custom:\d+):(.*)$/)
    if (!match) return currentPath || '/'
    return match[2] || '/'
  })()

  return (
    <Modal open={open} onClose={onClose} title="浏览服务器文件">
      <div className="relative min-h-[200px]">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Text className="text-sm text-[var(--md-sys-color-error)]">
              {error}
            </Text>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load(currentPath)}
            >
              重试
            </Button>
          </div>
        ) : loading && entries.length === 0 ? (
          <Spinner tip="加载中..." />
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              {/* 根目录切换器 */}
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<HardDrive className="h-3.5 w-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRootsMenuOpen((v) => !v)
                  }}
                >
                  {currentRoot?.name ?? '根目录'}
                </Button>
                {rootsMenuOpen && (
                  <div
                    className="glass absolute left-0 top-full z-30 mt-1 min-w-[220px] rounded-[var(--md-sys-shape-corner)] p-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {roots.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => handleSwitchRoot(r)}
                        disabled={!r.exists}
                        className="flex w-full items-center gap-2 rounded-[var(--md-sys-shape-corner)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--md-sys-color-surface-container-highest)] disabled:opacity-50"
                      >
                        <HardDrive
                          className="h-3.5 w-3.5 shrink-0"
                          style={{
                            color:
                              r.key === currentRootKey
                                ? 'var(--md-sys-color-primary)'
                                : 'var(--md-sys-color-on-surface-variant)',
                          }}
                        />
                        <span
                          className={
                            'truncate text-xs ' +
                            (r.key === currentRootKey
                              ? 'font-medium text-[var(--md-sys-color-primary)]'
                              : '')
                          }
                        >
                          {r.name}
                        </span>
                        {r.readonly && (
                          <Lock className="ml-auto h-3 w-3 shrink-0 text-[var(--md-sys-color-on-surface-variant)]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft className="h-3.5 w-3.5" />}
                onClick={handleBack}
                disabled={displayPath === '/' || !displayPath}
              >
                返回
              </Button>
              <Text
                className="min-w-0 flex-1 truncate text-xs text-[var(--md-sys-color-on-surface-variant)]"
                title={currentPath}
              >
                {displayPath || '/'}
              </Text>
            </div>
            <div className="relative max-h-[400px] overflow-y-auto">
              {entries.map((entry) => (
                <div
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--md-sys-shape-corner)] p-2 transition-colors hover:bg-[var(--md-sys-color-surface-container-high)]"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor:
                        entry.type === 'directory'
                          ? 'var(--md-sys-color-primary-container)'
                          : 'var(--md-sys-color-surface-container-high)',
                      color:
                        entry.type === 'directory'
                          ? 'var(--md-sys-color-on-primary-container)'
                          : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    {entry.type === 'directory' ? (
                      <Folder className="h-4 w-4" />
                    ) : (
                      <File className="h-4 w-4" />
                    )}
                  </div>
                  <span className="truncate text-sm">{entry.name}</span>
                  {entry.size !== undefined && entry.type === 'file' && (
                    <span className="ml-auto shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </div>
              ))}
              {entries.length === 0 && !loading && !error && (
                <Text className="py-6 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  当前目录为空
                </Text>
              )}
              {loading && entries.length > 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center rounded bg-[var(--md-sys-color-surface)]/50"
                  style={{
                    backdropFilter: 'blur(var(--glass-blur-loading))',
                    WebkitBackdropFilter: 'blur(var(--glass-blur-loading))',
                  }}
                >
                  <Spinner tip="加载中..." size={20} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
