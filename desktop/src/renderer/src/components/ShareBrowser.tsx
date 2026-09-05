import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { ChevronRight, File, Folder, LoaderCircle, Play, Search } from 'lucide-react'
import { formatBytes } from '../../../shared/format'
import { isFolder, isVideo, type AppState, type ShareItem } from '../../../shared/types'
import { CuteCheckbox, CuteEmptyState, QuietButton, RoseButton } from './widgets'

function iconFor(item: ShareItem): { color: string; node: JSX.Element } {
  if (isFolder(item)) return { color: 'text-folder', node: <Folder className="fill-current" /> }
  if (isVideo(item)) return { color: 'text-rose', node: <Play className="fill-current" /> }
  return { color: 'text-file', node: <File className="fill-current" /> }
}

function matchesSearch(name: string, keyword: string): boolean {
  const needle = keyword.trim().toLocaleLowerCase()
  if (!needle) return true
  return name.toLocaleLowerCase().includes(needle)
}

export function ShareBrowser({ state }: { state: AppState }): JSX.Element {
  const currentId = state.breadcrumbs.at(-1)?.id ?? ''
  const [query, setQuery] = useState(state.searchText)
  const listRef = useRef<HTMLUListElement>(null)
  const scrollByFolder = useRef(new Map<string, number>())
  const ignoreScroll = useRef(false)

  useEffect(() => {
    setQuery('')
  }, [currentId])

  useLayoutEffect(() => {
    if (state.isLoading) return
    const el = listRef.current
    if (!el) return
    ignoreScroll.current = true
    el.scrollTop = scrollByFolder.current.get(currentId) ?? 0
    const id = requestAnimationFrame(() => {
      ignoreScroll.current = false
    })
    return () => cancelAnimationFrame(id)
  }, [currentId, state.items, state.isLoading])

  const filtered = query.trim() ? state.items.filter((item) => matchesSearch(item.name, query)) : state.items
  const selected = new Set(state.selectedIDs)

  const setSearch = (value: string): void => {
    setQuery(value)
    void window.huangguo.setSearchText(value)
  }

  return (
    <section className="relative flex min-h-0 min-w-[420px] flex-1 flex-col bg-panel">
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex min-h-[22px] items-center gap-1 overflow-x-auto text-sm">
          {state.breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.id}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3 shrink-0 text-muted/50" />}
              <button
                type="button"
                className={
                  index === state.breadcrumbs.length - 1
                    ? 'shrink-0 font-semibold'
                    : 'shrink-0 text-rose hover:underline'
                }
                onClick={() => {
                  const el = listRef.current
                  if (el && !query.trim()) scrollByFolder.current.set(currentId, el.scrollTop)
                  void window.huangguo.goToBreadcrumb(crumb.id)
                }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2 py-1.5">
            <Search className="size-3.5 text-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/80"
              placeholder="搜索当前目录"
              value={query}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <QuietButton onClick={() => void window.huangguo.selectAllCurrent()}>全选当前</QuietButton>
          <QuietButton onClick={() => void window.huangguo.selectAllVideos()}>勾选视频</QuietButton>
          <span className="ml-auto shrink-0 text-xs text-muted">已选 {state.selectedIDs.length} 项</span>
          <RoseButton
            disabled={state.selectedIDs.length === 0 || state.isScanning || state.isLoading}
            onClick={() => void window.huangguo.downloadSelected()}
          >
            下载所选
          </RoseButton>
        </div>
      </div>

      <div className="h-px bg-hairline/80" />

      {filtered.length === 0 && !state.isLoading ? (
        <CuteEmptyState
          title={state.items.length === 0 ? '还没有内容' : '没有匹配项'}
          icon={
            state.items.length === 0 ? (
              <Folder className="size-7 fill-current" />
            ) : (
              <Search className="size-7" />
            )
          }
          message={state.items.length === 0 ? '粘贴分享链接，点一下打开就好' : '换个关键词再试试看'}
        />
      ) : (
        <ul
          key={currentId}
          ref={listRef}
          className="min-h-0 flex-1 overflow-auto px-1.5 py-1"
          onScroll={(event) => {
            if (ignoreScroll.current || query.trim()) return
            scrollByFolder.current.set(currentId, event.currentTarget.scrollTop)
          }}
        >
          {filtered.map((item) => {
            const checked = selected.has(item.id)
            const icon = iconFor(item)
            return (
              <li key={item.id}>
                <div
                  className={`flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${
                    checked ? 'bg-rose/10' : 'hover:bg-rose/6'
                  }`}
                  onDoubleClick={() => {
                    if (isFolder(item)) {
                      const el = listRef.current
                      if (el && !query.trim()) scrollByFolder.current.set(currentId, el.scrollTop)
                      void window.huangguo.enterFolder(item.id)
                    }
                  }}
                >
                  <button
                    type="button"
                    className="shrink-0"
                    aria-label={checked ? '取消勾选' : '勾选'}
                    onClick={() => void window.huangguo.toggleSelection(item.id)}
                  >
                    <CuteCheckbox on={checked} />
                  </button>
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${icon.color}`}
                    style={{ backgroundColor: 'color-mix(in srgb, currentColor 16%, transparent)' }}
                  >
                    <span className="[&>svg]:size-3">{icon.node}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.name}</p>
                    <p className="text-xs text-muted">{isFolder(item) ? '文件夹' : formatBytes(item.size)}</p>
                  </div>
                  {isFolder(item) && <ChevronRight className="size-3.5 text-muted/50" />}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {state.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-rose/16 bg-panel px-5 py-4 shadow-[0_6px_16px_rgb(255_120_158_/_0.16)]">
            <LoaderCircle className="mx-auto size-5 animate-spin text-rose" />
            <p className="mt-2.5 text-sm font-medium text-rose-deep">加载中…</p>
          </div>
        </div>
      )}
    </section>
  )
}
