import { connectionUrl } from '../../../../platform/connectionTransport'
import { getLogicalApiUrl } from '../../../lib/api'
import { live2dAssetUrl } from './asset-url'
import {
  resolveLive2DModelUrl,
  resolveLive2DServerUrl,
} from './resource-url'

export { live2dAssetUrl }

export function live2dServerUrl(path: string): string {
  return resolveLive2DServerUrl(path, getLogicalApiUrl(), connectionUrl)
}

export function live2dModelUrl(path: string): string {
  return resolveLive2DModelUrl(path, getLogicalApiUrl(), connectionUrl)
}
