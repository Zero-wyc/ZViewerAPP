import MountBrowserBase from '@/modules/mounts/MountBrowserBase'
import { browseFTPMount } from './ftpApi'
import type { FTPDirectoryEntry } from './types'

interface FTPBrowserProps {
  mountId: number | null
  open: boolean
  onClose: () => void
  onSelectFiles?: (paths: string[]) => void
  selectable?: boolean
}

export default function FTPBrowser({
  mountId,
  open,
  onClose,
  onSelectFiles,
}: FTPBrowserProps) {
  return (
    <MountBrowserBase<FTPDirectoryEntry>
      title="浏览 FTP 目录"
      mountId={mountId}
      open={open}
      onClose={onClose}
      onConfirm={(paths) => onSelectFiles?.(paths)}
      browse={browseFTPMount}
    />
  )
}
