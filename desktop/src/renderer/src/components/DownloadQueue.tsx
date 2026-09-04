import type { JSX } from 'react'
import {
  AlertTriangle,
  ArrowDownCircle,
  CheckCircle2,
  Clock,
  Link2,
  PlayCircle,
  XCircle
} from 'lucide-react'
import { formatBytes } from '../../../shared/format'
import {
  statusCanPlay,
  statusIsFinished,
  type AppState,
  type DownloadItemDTO,
  type DownloadStatus
} from '../../../shared/types'
import { BlossomProgress, CuteEmptyState, QuietButton } from './widgets'

const statusMeta: Record<
  DownloadStatus,
  { label: string; color: string; icon: JSX.Element }
> = {
  queued: { label: '排队', color: 'text-file', icon: <Clock className="size-3" /> },
  resolving: { label: '解析地址', color: 'text-rose', icon: <Link2 className="size-3" /> },
  downloading: {
    label: '下载中',
    color: 'text-rose',
    icon: <ArrowDownCircle className="size-3 fill-current" />
  },
  completed: {
    label: '完成',
    color: 'text-success',
    icon: <CheckCircle2 className="size-3 fill-current" />
  },
  partial: {
    label: '可播放',
    color: 'text-warning',
    icon: <PlayCircle className="size-3 fill-current" />
  },
  failed: {
    label: '失败',
    color: 'text-danger',
    icon: <AlertTriangle className="size-3 fill-current" />
  },
  cancelled: { label: '已取消', color: 'text-muted', icon: <XCircle className="size-3" /> }
}

function DownloadRow({ item }: { item: DownloadItemDTO }): JSX.Element {
  const meta = statusMeta[item.status]
  const progress = Math.min(1, item.receivedBytes / Math.max(item.totalBytes, 1))
  const busy = item.status === 'downloading' || item.status === 'resolving'
  const canRetry =
    item.status === 'failed' || item.status === 'cancelled' || statusCanPlay(item.status)
  const canCancel = item.status === 'downloading' || item.status === 'queued' || item.status === 'resolving'

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <div
          className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${meta.color}`}
          style={{ backgroundColor: 'color-mix(in srgb, currentColor 16%, transparent)' }}
        >
          {meta.icon}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.fileName}</p>
        <span className={`text-xs ${meta.color}`}>{meta.label}</span>
      </div>
      {item.relativePath ? (
        <p className="mt-0.5 truncate pl-[34px] text-[11px] text-muted/70">{item.relativePath}</p>
      ) : null}
      {busy && (
        <div className="mt-1.5 pl-[34px]">
          <BlossomProgress value={progress} />
          <div className="mt-1 flex text-[11px] text-muted">
            <span>
              {formatBytes(item.receivedBytes)} / {formatBytes(Math.max(item.totalBytes, item.expectedSize))}
            </span>
            <span className="ml-auto">
              {item.bytesPerSecond > 0 ? `${formatBytes(item.bytesPerSecond)}/s` : ''}
            </span>
          </div>
        </div>
      )}
      {item.status === 'partial' && (
        <div className="mt-1.5 pl-[34px]">
          <BlossomProgress value={progress} />
          {item.errorMessage && <p className="mt-1 text-xs text-warning">{item.errorMessage}</p>}
        </div>
      )}
      {item.status === 'failed' && item.errorMessage && (
        <p className="mt-1 pl-[34px] text-xs text-danger">{item.errorMessage}</p>
      )}
      <div className="mt-1 flex gap-3 pl-[34px] text-xs text-rose">
        {canRetry && (
          <button type="button" onClick={() => void window.huangguo.retry(item.id)}>
            {item.status === 'partial' ? '继续下载' : statusCanPlay(item.status) ? '重新下载' : '重试'}
          </button>
        )}
        {canCancel && (
          <button type="button" className="text-danger" onClick={() => void window.huangguo.cancel(item.id)}>
            取消
          </button>
        )}
        {statusCanPlay(item.status) && item.localPath && (
          <>
            <button type="button" onClick={() => void window.huangguo.openPath(item.localPath!)}>
              播放
            </button>
            <button type="button" onClick={() => void window.huangguo.showInFolder(item.localPath!)}>
              打开所在文件夹
            </button>
          </>
        )}
      </div>
    </li>
  )
}

export function DownloadQueue({ state }: { state: AppState }): JSX.Element {
  const noneFinished = state.downloads.every((item) => !statusIsFinished(item.status))
  return (
    <aside className="flex w-[400px] min-w-[320px] shrink-0 flex-col" style={{ background: 'var(--queue)' }}>
      <div className="flex items-center px-3.5 pb-2 pt-3">
        <h2 className="text-[15px] font-semibold">下载队列</h2>
        <span className="ml-auto text-xs text-muted">
          进行中 {state.activeCount} · 排队 {state.queuedCount}
        </span>
      </div>
      <div className="flex gap-2 px-3.5 pb-2.5">
        <QuietButton disabled={noneFinished} onClick={() => void window.huangguo.clearFinished()}>
          清除已完成
        </QuietButton>
        <QuietButton disabled={state.downloads.length === 0} onClick={() => void window.huangguo.cancelAll()}>
          全部取消
        </QuietButton>
        <span className="flex-1" />
        <QuietButton onClick={() => void window.huangguo.openSaveDirectory()}>打开目录</QuietButton>
      </div>
      <div className="h-px bg-hairline/80" />
      {state.downloads.length === 0 ? (
        <CuteEmptyState
          title="暂无任务"
          icon={<ArrowDownCircle className="size-7" />}
          message="勾选左侧文件，就可以开始下载啦"
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {state.downloads.map((item) => (
            <DownloadRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </aside>
  )
}
