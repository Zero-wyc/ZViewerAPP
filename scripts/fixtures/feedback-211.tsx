// Actual mobile room/actions, add form and music toolbar; isolated room data only.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import MobileRoom from '../../src/mobile/MobileRoom'
import { MobileAppearance } from '../../src/mobile/MobileAppearance'
import { PlayerMobileToolbarRow } from '../../src/upstream/modules/music/components/PlayerMobileToolbarRow'
import { useRoomStore } from '../../src/upstream/store/roomStore'
import { useAuthStore } from '../../src/upstream/store/authStore'
import { useThemeStore } from '../../src/upstream/store/themeStore'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'

const w=window as any
const noop=()=>{}
useAuthStore.setState({user:{id:'1',username:'isolated-test',role:'user'}})
useRoomStore.setState({roomId:'feedback-fixture',roomName:'界面验收',mode:'watch-together',movies:[],currentMovieId:null})
w.__feedbackFixture={store:useRoomStore,theme(dark:boolean){useThemeStore.setState({mode:dark?'dark':'light',isDark:dark})}}

function Toolbar() {
  const [tone,setTone]=React.useState<'light'|'dark'>('light')
  w.__feedbackFixture.tone=setTone
  return <section id="comment-toolbar" style={{padding:'20px 12px',background: tone==='light'?'#474752':'#e7e7ee'}}>
    <PlayerMobileToolbarRow {...{
      toolbarTone:tone,mobileLyricViewActive:false,onToggleMobileLyricView:noop,
      hasRomaLyric:false,lyricRoma:false,onToggleLyricRoma:noop,hasTransLyric:false,lyricTrans:false,onToggleLyricTrans:noop,
      bgVideoReady:false,onEnterImmersive:noop,canLike:true,liked:true,onLike:noop,
      isHost:false,playMode:'order' as const,onTogglePlayMode:noop,canComment:true,rightPanelMode:0 as const,commentBadge:'4.2w+',onToggleCommentPanel:noop,
      songId:1,onAddMusicVideo:noop,getBiliSourceUrl:()=>null,queuePopupOpen:false,onToggleQueuePopup:noop,
      socket:null,roomId:'feedback-fixture',canManage:false,onOpenSettings:noop,uiTone:'light' as const,onToggleUiTone:noop,
      isFullscreen:false,showFullscreen:false,onToggleFullscreen:noop,
    }}/>
  </section>
}
createRoot(document.getElementById('root')!).render(<HashRouter><MobileAppearance global room>
  <MobileRoom roomId="feedback-fixture" onLeave={noop}/><Toolbar/>
</MobileAppearance></HashRouter>)
