import type { JSX, ReactNode } from 'react'
import { CircleAlert, Play } from 'lucide-react'

export function BrandMark(): JSX.Element {
  return (
    <div className="rose-gradient flex size-[26px] items-center justify-center rounded-lg text-white shadow-[0_1px_5px_rgb(255_120_158_/_0.28)]">
      <Play className="ml-px size-3 fill-current" strokeWidth={0} />
    </div>
  )
}

export function IconWell({
  icon,
  colorClass,
  size = 28
}: {
  icon: ReactNode
  colorClass: string
  size?: number
}): JSX.Element {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${colorClass}`}
      style={{ width: size, height: size, backgroundColor: 'color-mix(in srgb, currentColor 16%, transparent)' }}
    >
      <span className="[&>svg]:size-[42%]">{icon}</span>
    </div>
  )
}

export function RoseButton({
  children,
  disabled,
  onClick,
  type = 'button'
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="no-drag rounded-full bg-rose px-3.5 py-1.5 text-sm font-semibold text-white transition enabled:hover:bg-rose/90 enabled:active:bg-rose/80 disabled:bg-rose/40 disabled:text-white/75"
    >
      {children}
    </button>
  )
}

export function QuietButton({
  children,
  disabled,
  onClick
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="no-drag rounded-full bg-rose/15 px-2.5 py-1.5 text-sm font-medium text-rose-deep transition enabled:hover:bg-rose/22 disabled:bg-rose/8 disabled:text-rose-deep/45"
    >
      {children}
    </button>
  )
}

export function CuteCheckbox({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      className={`flex size-[22px] items-center justify-center text-[18px] ${on ? 'text-rose' : 'text-muted/55'}`}
      aria-hidden
    >
      {on ? (
        <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 7.3-5.2 5.2a1 1 0 0 1-1.4 0L7.7 12.5a1 1 0 1 1 1.4-1.4l1.3 1.3 4.5-4.5a1 1 0 1 1 1.4 1.4Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-[18px] fill-none stroke-current" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8.2" />
        </svg>
      )}
    </span>
  )
}

export function BlossomProgress({ value }: { value: number }): JSX.Element {
  const width = Math.max(6, Math.min(100, Math.max(0, value) * 100))
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-rose/12">
      <div className="rose-gradient h-full rounded-full" style={{ width: `${width}%` }} />
    </div>
  )
}

export function CuteEmptyState({
  title,
  icon,
  message
}: {
  title: string
  icon: ReactNode
  message: string
}): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 p-7">
      <div className="flex size-[72px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,#ffdbe3_0%,rgb(255_120_158_/_0.18)_100%)] text-rose">
        {icon}
      </div>
      <div className="text-center">
        <p className="font-semibold">{title}</p>
        <p className="mt-1.5 text-sm text-muted">{message}</p>
      </div>
    </div>
  )
}

export function CuteAlert({
  title,
  message,
  onDismiss
}: {
  title: string
  message: string
  onDismiss: () => void
}): JSX.Element {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/16" onClick={onDismiss}>
      <div
        className="w-[min(360px,calc(100%-48px))] rounded-[22px] border border-rose/18 bg-panel px-7 py-6 text-center shadow-[0_10px_28px_rgb(255_120_158_/_0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose/12 text-rose">
          <CircleAlert className="size-[30px]" />
        </div>
        <h2 className="mt-3.5 text-lg font-semibold">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-[280px] text-sm text-muted">{message}</p>
        <div className="mt-4">
          <RoseButton onClick={onDismiss}>好</RoseButton>
        </div>
      </div>
    </div>
  )
}

export function WindowControls(): JSX.Element {
  return (
    <div className="no-drag flex h-8 items-start">
      <button
        type="button"
        aria-label="最小化"
        className="flex h-8 w-11 items-center justify-center text-ink/70 hover:bg-black/6"
        onClick={() => void window.huangguo.minimize()}
      >
        <span className="mb-1 block h-px w-2.5 bg-current" />
      </button>
      <button
        type="button"
        aria-label="最大化"
        className="flex h-8 w-11 items-center justify-center text-ink/70 hover:bg-black/6"
        onClick={() => void window.huangguo.maximize()}
      >
        <span className="block size-2.5 rounded-[2px] border border-current" />
      </button>
      <button
        type="button"
        aria-label="关闭"
        className="flex h-8 w-11 items-center justify-center text-ink/70 hover:bg-[#e81123] hover:text-white"
        onClick={() => void window.huangguo.close()}
      >
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}
