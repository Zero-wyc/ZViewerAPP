import { useLocation } from 'react-router-dom'
import { useThemeStore } from '@/store/themeStore'
import { Header } from './Header'
import { InsecureContextBanner } from './InsecureContextBanner'

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const {
    backgroundImage,
    backgroundBlur,
    backgroundOpacity,
    backgroundPositionX,
    backgroundPositionY,
    backgroundScale,
    backgroundRotate,
    reducedMotion,
  } = useThemeStore()

  return (
    <div
      className="relative flex min-h-screen flex-col"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={{
        // 始终透明：由 body 的 surface 色作为最终底色，背景图 div 绘制在 body 之上。
        // 若此容器不透明，背景图 div 会被同色背景压住，glass-card 的 backdrop-filter
        // 只能模糊到 surface 纯色，视觉上"只有透明度没有模糊"。
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {/* 背景图片层：自定义背景或默认背景图，浅色/深色模式均显示 */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          backgroundImage: `url(${backgroundImage || '/Nacho3.jpg'})`,
          backgroundSize: 'cover',
          // 位置固定居中，偏移由 transform: translate 控制
          // （background-position 百分比在 cover 下当某方向无溢出时完全无效）
          backgroundPosition: 'center',
          filter: `blur(${backgroundBlur}px)`,
          opacity: backgroundImage
            ? backgroundOpacity
            : Math.min(backgroundOpacity, 0.85),
          // translate 在 scale/rotate 之前，避免缩放中心扩张吃掉偏移
          // 百分比除以 2 限制最大偏移为 ±50%，防止图片完全移出视口
          transform: `translate(${backgroundPositionX / 2}%, ${backgroundPositionY / 2}%) scale(${backgroundScale}) rotate(${backgroundRotate}deg)`,
        }}
      />

      {/* 内容层：z-auto 不创建层叠上下文，允许后代 glass-card 的
          backdrop-filter 跨层采样到背景图（z-index: 0）。
          文档顺序保证内容仍在背景图之上，无需显式 z-index。 */}
      <div className="relative z-auto flex flex-1 flex-col">
        <Header />
        <main key={location.pathname} className="flex flex-1 flex-col">
          {children}
        </main>
      </div>

      {/* HTTP 非安全上下文提示横幅：仅在生产环境 HTTP 访问时显示 */}
      <InsecureContextBanner />
    </div>
  )
}
