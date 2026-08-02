/**
 * Combining several PDFs into one download.
 *
 * jsPDF, which generates every report in this app, can only *write* PDFs — it
 * has no reader. Appending a scanned case sheet or a previously generated lab
 * report is therefore impossible with jsPDF alone, which is why `pdf-lib` is
 * here: it loads existing documents and copies their pages.
 *
 * Used by the discharge summary download, where the user ticks which lab
 * reports and which scans to include.
 */

import { PDFDocument } from 'pdf-lib'

export interface MergePart {
  /** Shown in the warning if this part cannot be read. */
  label: string
  bytes: Uint8Array
}

export interface MergeResult {
  bytes: Uint8Array
  /** Parts that could not be read, by label. Never a hard failure. */
  skipped: string[]
}

/**
 * Concatenates the parts in order.
 *
 * A part that cannot be parsed — a corrupt scan, or one that is
 * password-protected, both of which turn up in a hospital's uploads — is
 * skipped and named in `skipped`. Failing the whole download because one of
 * five attachments is bad would be the wrong trade: the user wants the summary.
 */
export async function mergePdfs(parts: MergePart[]): Promise<MergeResult> {
  const usable = parts.filter(p => p.bytes && p.bytes.byteLength > 0)
  const skipped: string[] = parts.filter(p => !p.bytes || p.bytes.byteLength === 0).map(p => p.label)

  if (usable.length === 0) {
    throw new Error('There was nothing to download')
  }

  const merged = await PDFDocument.create()

  for (const part of usable) {
    try {
      // ignoreEncryption lets a "protected" but readable scan through rather
      // than throwing; genuinely unreadable files still land in the catch.
      const source = await PDFDocument.load(part.bytes, { ignoreEncryption: true })
      const pages = await merged.copyPages(source, source.getPageIndices())
      for (const page of pages) merged.addPage(page)
    } catch (error) {
      console.error(`[pdf] could not merge "${part.label}":`, error)
      skipped.push(part.label)
    }
  }

  if (merged.getPageCount() === 0) {
    throw new Error('None of the selected files could be read')
  }

  return { bytes: await merged.save(), skipped }
}

/**
 * Triggers a browser download for raw bytes.
 *
 * jsPDF's own `doc.save()` handles this for a single document; merged output
 * has no jsPDF instance behind it, so it needs doing by hand.
 */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Revoked on the next tick — Safari cancels the download if the object URL
  // disappears in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Bytes of a jsPDF document, for feeding into `mergePdfs`. */
export function docBytes(doc: { output: (type: 'arraybuffer') => ArrayBuffer }): Uint8Array {
  return new Uint8Array(doc.output('arraybuffer'))
}
