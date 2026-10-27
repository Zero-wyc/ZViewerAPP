export function PlayerGestureNotice({ text }: { text: string }) {
  if (!text) return null
  return <div role="status" className="pointer-events-none absolute inset-x-0 top-5 z-[90] flex justify-center">
    <span className="rounded-xl bg-black/75 px-4 py-2 text-sm font-medium text-white shadow-lg">{text}</span>
  </div>
}
