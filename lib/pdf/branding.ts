/**
 * Hospital branding used by every generated PDF.
 *
 * Before this file existed the hospital name was a string constant copied into
 * `patient-pdf.ts`, `finance-pdf.ts` and the lab report component; address,
 * phone and logo did not exist anywhere at all. Edit the values here and every
 * report picks them up.
 *
 * The clinical/administrative documents (lab report, discharge summary,
 * charge sheet, patient charges) don't read `logo` at all — they're drawn on
 * the full letterhead artwork instead (see `letterhead.ts`), which already
 * has the logo baked in. `logo` is here for the landscape billing/finance
 * reports (`base.ts`'s navy-banner style) if they ever want one; today they
 * render text-only, hence null.
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
  /** Second contact number — the letterhead lists two. */
  phone2?: string
  email: string
  /** null renders a text-only header. */
  logo: HospitalLogo | null
}

export const BRANDING: Branding = {
  name: 'KKR Diagnostic Centre',
  address: '18-1-34, Panchavati Complex, 2nd Floor, Opp. KGH Emergency (OP) Gate, Maharanipeta, Visakhapatnam - 530 002.',
  phone: '0891-2709777',
  phone2: '0891-4809777',
  email: '',
  logo: null,
}

/** Single-line contact string for report headers. */
export function contactLine(b: Branding = BRANDING): string {
  return [b.address, b.phone && `Ph: ${b.phone}`, b.email].filter(Boolean).join('  •  ')
}
