/**
 * The hospital logo as a data URI, for PDFs that draw their own header.
 *
 * jsPDF's addImage needs image data, not a URL, and the logo lives in
 * `public/` for the sidebar. It is fetched once per page load. A failure
 * resolves to null: the caller prints a text-only header rather than no PDF.
 */

let cached: Promise<string | null> | null = null

export function loadLogoDataUri(): Promise<string | null> {
  if (!cached) {
    cached = fetch('/kkr-logo.png')
      .then(response => (response.ok ? response.blob() : Promise.reject(new Error('logo not found'))))
      .then(
        blob =>
          new Promise<string | null>(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          }),
      )
      .catch(() => null)
  }
  return cached
}
