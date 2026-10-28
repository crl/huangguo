import { useEffect, useRef, useState, type JSX } from 'react'
import { Folder, KeyRound, Link2, LoaderCircle } from 'lucide-react'
import type { AppState } from '../../../shared/types'
import { BrandMark, RoseButton, WindowControls } from './widgets'

const sharePresets = [
  'https://mypikpak.com/s/VP4-ev164HCWluoJSA8wdq7Ko2/AAO3_OoLU43uaC17RAQjlIBgo2_VP2/AAA_h5VjTDWZl9SAtwWPQTQto2_VP4',
  'https://mypikpak.com/s/VP3KH3E7ppAzZZ4DNMYrc-ioo2/AAAAEIoPCqtcutnuNj8op4Ylo2_VP3',
  'https://mypikpak.com/s/VP2en7G4U5iUH-iq1c859v4Qo2/AAC_6JVcChzYyDg8-1kz7WIko2_VP0',
  'https://mypikpak.com/s/VP0wib21ePNb_Dh-17ercY_lo2/AAAA2Yu8Oja1sI61Huva4Qfuo2_VP0/AAMRKpfE8-PxCC405bMgzBtYo2_VP4',
  'https://mypikpak.com/s/VP17peg3GYHJVSzZCxilcxQTo2/AABbOWIT4DzxaqBtpKMuU4J7o2_VP0'
]

export function TopBar({ state }: { state: AppState }): JSX.Element {
  const isMac = window.huangguo.platform === 'darwin'
  const [presetsOpen, setPresetsOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!presetsOpen) return
    const closeOutside = (event: PointerEvent): void => {
      if (!presetsRef.current?.contains(event.target as Node)) setPresetsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPresetsOpen(false)
        presetsRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [presetsOpen])
  return (
    <div className="header-wash drag-region px-4 pb-3 pt-2">
      <div className="mb-2.5 flex items-center gap-2.5">
        {isMac && <div className="h-3 w-[68px] shrink-0" aria-hidden="true" />}
        <BrandMark />
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold leading-tight">黄果下载</h1>
          <p className="truncate text-xs text-muted">
            {state.statusText || 'PikPak 分享下载'}
          </p>
        </div>
        {(state.isLoading || state.isScanning) && (
          <LoaderCircle className="no-drag size-4 animate-spin text-rose" />
        )}
        <div className="flex-1" />
        {!isMac && <WindowControls />}
      </div>

      <div className="mb-2.5 flex gap-2">
        <div className="no-drag relative flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-rose/16 bg-field px-2.5 py-2" ref={presetsRef}>
          <button
            type="button"
            aria-label="选择分享地址"
            aria-expanded={presetsOpen}
            aria-controls="share-presets"
            title="选择分享地址"
            className="shrink-0 rounded p-1 text-rose/85 hover:bg-rose/15"
            onClick={() => setPresetsOpen((open) => !open)}
          >
            <Link2 className="size-4" />
          </button>
          {presetsOpen && (
            <div id="share-presets" className="absolute left-0 top-full z-30 mt-1 w-full rounded-xl border border-hairline bg-panel p-1.5 shadow-lg">
              {sharePresets.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  title={url}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-rose/15 ${state.shareURL === url ? 'bg-rose/10 text-rose-deep' : 'text-muted'}`}
                  disabled={state.isLoading}
                  onClick={async () => {
                    setPresetsOpen(false)
                    await window.huangguo.setShareURL(url)
                    await window.huangguo.openShare()
                  }}
                >
                  <span className="mb-1 block font-medium">分享 {index + 1}{state.shareURL === url ? ' · 当前' : ''}</span>
                  <span className="block break-all">{url}</span>
                </button>
              ))}
            </div>
          )}
          <input
            aria-label="分享地址"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/80"
            placeholder="粘贴 mypikpak.com/s/… 分享链接"
            value={state.shareURL}
            onChange={(event) => void window.huangguo.setShareURL(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void window.huangguo.openShare()
            }}
          />
        </div>
        <label className="no-drag flex w-[124px] shrink-0 items-center gap-2 rounded-[10px] border border-rose/16 bg-field px-2.5 py-2">
          <KeyRound className="size-4 shrink-0 text-rose/85" />
          <input
            type="password"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/80"
            placeholder="密码"
            value={state.sharePassword}
            onChange={(event) => void window.huangguo.setSharePassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void window.huangguo.openShare()
            }}
          />
        </label>
        <RoseButton
          disabled={state.isLoading || !state.shareURL.trim()}
          onClick={() => void window.huangguo.openShare()}
        >
          打开
        </RoseButton>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="no-drag flex min-w-0 max-w-[70%] items-center gap-1.5 rounded-full border border-hairline bg-field px-2.5 py-1 text-xs"
          title={state.saveDirectory}
          onClick={() => void window.huangguo.chooseSaveDirectory()}
        >
          <Folder className="size-3.5 shrink-0 fill-folder text-folder" />
          <span className="min-w-0 truncate text-muted">{state.saveDirectory}</span>
          <svg viewBox="0 0 12 12" className="size-2.5 shrink-0 text-muted/70" aria-hidden>
            <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>

        <label className="no-drag flex items-center gap-2 text-xs" title="更稳但清晰度可能更低">
          <span>优先转码</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.preferTranscoding}
            className={`relative h-[18px] w-[32px] rounded-full transition ${
              state.preferTranscoding ? 'bg-rose' : 'bg-file/70'
            }`}
            onClick={() => void window.huangguo.setPreferTranscoding(!state.preferTranscoding)}
          >
            <span
              className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow-sm transition ${
                state.preferTranscoding ? 'left-[16px]' : 'left-[2px]'
              }`}
            />
          </button>
        </label>
      </div>
    </div>
  )
}
