import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';

const encoder = new util.TextEncoder();
const decoder = new util.TextDecoder('utf-8');
interface AssetError extends Error { code?: number; }

export class BilibiliCredentialStore {
  private alias: Uint8Array;

  constructor(name: string = 'zviewer.bilibili.cookie.v1') {
    this.alias = encoder.encode(name);
  }

  async load(): Promise<string> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias);
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const results = await asset.query(query);
      const secret = results[0]?.get(asset.Tag.SECRET);
      return secret instanceof Uint8Array ? decoder.decode(secret) : '';
    } catch (error) {
      if ((error as AssetError).code === 24000002) return '';
      throw new Error('B 站凭据读取失败');
    }
  }

  async save(cookie: string): Promise<void> {
    if (cookie === '') { await this.clear(); return; }
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias);
    const update: asset.AssetMap = new Map();
    update.set(asset.Tag.SECRET, encoder.encode(cookie));
    try {
      await asset.update(query, update);
      return;
    } catch (error) {
      if ((error as AssetError).code !== 24000002) throw new Error('B 站凭据更新失败');
    }
    const attributes: asset.AssetMap = new Map();
    attributes.set(asset.Tag.ALIAS, this.alias);
    attributes.set(asset.Tag.SECRET, encoder.encode(cookie));
    attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
    await asset.add(attributes);
  }

  async clear(): Promise<void> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias);
    try {
      await asset.remove(query);
    } catch (error) {
      if ((error as AssetError).code !== 24000002) throw new Error('B 站凭据删除失败');
    }
  }
}
