export function formatBytes(bytes: number): string {
  const value = Math.max(0, bytes)
  if (value < 1024) return `${Math.round(value)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  const digits = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(digits)} ${units[unit]}`
}

export function sanitizeFileName(name: string): string {
  const trimmed = name.replace(/[/\\:?%*|"<>]/g, '_').trim()
  return trimmed.length === 0 ? 'untitled' : trimmed
}
