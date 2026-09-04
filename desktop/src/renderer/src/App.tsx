import { useEffect, useRef, useState, type JSX } from 'react'
import type { AppState } from '../../shared/types'
import { CuteAlert } from './components/widgets'
import { DownloadQueue } from './components/DownloadQueue'
import { ShareBrowser } from './components/ShareBrowser'
import { TopBar } from './components/TopBar'

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const opened = useRef(false)

  useEffect(() => {
    let unsub: (() => void) | undefined
    void window.huangguo.getState().then((next) => {
      if (next) setState(next)
    })
    unsub = window.huangguo.onState(setState)
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!state || opened.current) return
    if (state.items.length > 0 || state.isLoading) {
      opened.current = true
      return
    }
    opened.current = true
    void window.huangguo.openShare()
  }, [state])

  if (!state) {
    return <div className="h-full bg-canvas" />
  }

  return (
    <div className="relative flex h-full flex-col bg-canvas text-ink">
      <TopBar state={state} />
      <div className="h-px bg-hairline/80" />
      <div className="flex min-h-0 flex-1">
        <ShareBrowser state={state} />
        <DownloadQueue state={state} />
      </div>
      {state.errorMessage && (
        <CuteAlert
          title="出错了"
          message={state.errorMessage}
          onDismiss={() => void window.huangguo.dismissError()}
        />
      )}
    </div>
  )
}
