/**
 * Hands the browser a file.
 *
 * A Blob and an object URL rather than a `data:` URI: Safari caps data URIs
 * around a couple of megabytes and a year of invoice lines passes that. The
 * URL is revoked on the next tick -- not immediately, because the click has
 * to be dispatched first, and not never, because an un-revoked object URL
 * pins the whole Blob in memory for the life of the document.
 */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
