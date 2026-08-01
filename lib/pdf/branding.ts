/**
 * Hospital branding used by every generated PDF.
 *
 * Before this file existed the hospital name was a string constant copied into
 * `patient-pdf.ts`, `finance-pdf.ts` and the lab report component; address,
 * phone and logo did not exist anywhere at all. Edit the values here and every
 * report picks them up.
 */

export interface HospitalLogo {
  /** Base64 data URI. jsPDF's addImage needs image data, not a URL. */
  dataUri: string
  /** Rendered size in millimetres. */
  widthMm: number
  heightMm: number
  format: 'PNG' | 'JPEG'
}

export interface Branding {
  name: string
  address: string
  phone: string
  email: string
  /** null renders a text-only header. */
  logo: HospitalLogo | null
}

export const BRANDING: Branding = {
  name: 'KKR Hospital & Medical Services',

  // TODO(kkr): replace the three placeholders below with the real details.
  // They print verbatim on every lab report, invoice and finance report.
  address: 'Address line 1, Address line 2, City - PIN',
  phone: '+91 00000 00000',
  email: 'info@example.com',

  // To add the logo: base64-encode the image and paste it here as a data URI,
  // e.g. `data:image/png;base64,iVBORw0KG...`. Keep it under ~100 KB — jsPDF
  // embeds it in full on every page it is drawn on.
  logo: null,
}

/** Single-line contact string for report headers. */
export function contactLine(b: Branding = BRANDING): string {
  return [b.address, b.phone && `Ph: ${b.phone}`, b.email].filter(Boolean).join('  •  ')
}
