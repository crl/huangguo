import type { JSX } from 'react'
import { Folder, KeyRound, Link2, LoaderCircle } from 'lucide-react'
import type { AppState } from '../../../shared/types'
import { BrandMark, RoseButton, WindowControls } from './widgets'

export function TopBar({ state }: { state: AppState }): JSX.Element {
  return (
    <div className="header-wash drag-region px-4 pb-3 pt-2">
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="h-3 w-[18px]" />
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
        <WindowControls />
      </div>

      <div className="mb-2.5 flex gap-2">
        <label className="no-drag flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-rose/16 bg-field px-2.5 py-2">
          <Link2 className="size-4 shrink-0 text-rose/85" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/80"
            placeholder="粘贴 mypikpak.com/s/… 分享链接"
            value={state.shareURL}
            onChange={(event) => void window.huangguo.setShareURL(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void window.huangguo.openShare()
            }}
          />
        </label>
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
