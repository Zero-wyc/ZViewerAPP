// Real search UI with local deterministic responses; no account or audio access.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MusicTopNav } from '../../src/upstream/modules/music/components/MusicTopNav'
import { MusicSearchPage } from '../../src/upstream/modules/music/pages/MusicSearchPage'
import { MusicBilibiliPage } from '../../src/upstream/modules/music/pages/MusicBilibiliPage'
import { MusicPlayerContext } from '../../src/upstream/modules/music/hooks/useMusicPlayer'
import { useMusicStore } from '../../src/upstream/modules/music/store'
import { useMusicSettingsStore } from '../../src/upstream/modules/music/store-settings'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'

const testWindow = window as any
const requests: string[] = []
testWindow.__musicSearchResponse = async (input: string) => {
  requests.push(input)
  let data: unknown = { success: true, items: [], total: 0, result: {} }
  if (/\/ncm\/(cloudsearch|search)\?/.test(input)) data = { result: { songs: [
    { id: 123, name: '隔离验收歌曲', ar: [{ name: '测试歌手' }], al: { name: '测试专辑', picUrl: '' }, dt: 120000, fee: 0 },
  ] } }
  else if (input.includes('/bilibili/search?')) data = { success: true, items: [
    { bvid: 'BV1test123456', title: '隔离验收视频', pic: '', duration: 120, upName: '测试UP' },
  ], total: 1 }
  else if (input.includes('/search/hot/detail')) data = { data: [{ searchWord: '隔离热搜' }] }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
const originalRoot = document.getElementById('root')
const originalDisplay = originalRoot?.style.display
if (originalRoot) originalRoot.style.display = 'none'
const container = document.createElement('div')
container.id = 'music-search-fixture'
container.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden;padding-top:var(--native-safe-top,0px);background:linear-gradient(120deg,#8ba6c4,#e4bbdb)'
document.body.append(container)
const settingsBefore = useMusicSettingsStore.getState().musicNavCollapsed
useMusicSettingsStore.getState().set({ musicNavCollapsed: true })
useMusicStore.setState({ page: 'home', searchKeywords: '', biliSearchKeyword: null })
function Fixture() {
  const page = useMusicStore(s => s.page)
  return <MusicPlayerContext.Provider value={{ canControl: true } as any}>
    <MusicTopNav isHost />
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {page === 'search' && <MusicSearchPage socket={null} canManage={false} />}
      {page === 'bilibili' && <MusicBilibiliPage socket={null} canManage={false} />}
    </div>
  </MusicPlayerContext.Provider>
}
const root = createRoot(container)
root.render(<Fixture />)
testWindow.__searchFixture = { store: useMusicStore, requests, unmount() {
  root.unmount(); useMusicStore.getState().reset()
  useMusicSettingsStore.getState().set({ musicNavCollapsed: settingsBefore })
  delete testWindow.__musicSearchResponse; container.remove()
  if (originalRoot) originalRoot.style.display = originalDisplay || ''
} }
