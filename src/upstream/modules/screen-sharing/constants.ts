import { ICE_SERVERS } from '@/modules/p2p/constants'

// 重新导出以保持 screen-sharing 模块内向后兼容
export { ICE_SERVERS }

export const FRAME_RATE_OPTIONS = [
  { label: '15 fps', value: 15 },
  { label: '30 fps', value: 30 },
  { label: '45 fps', value: 45 },
  { label: '60 fps', value: 60 },
]
