/**
 * An amount in words, the Indian way: thousand, lakh, crore.
 *
 *   8000        "eight thousand only"
 *   125000      "one lakh twenty five thousand only"
 *   1500.50     "one thousand five hundred and fifty paise only"
 *
 * Written for the payment receipt ("Rupees: eight thousand only."), which is
 * the first place the app has had to spell a number out.
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]
  const ones = n % 10
  return ones ? `${TENS[Math.floor(n / 10)]} ${ONES[ones]}` : TENS[Math.floor(n / 10)]
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`)
  if (rest) parts.push(belowHundred(rest))
  return parts.join(' ')
}

/** A whole number in words. Crores above 99 are spelled recursively. */
export function numberInWords(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return ONES[0]

  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000

  const parts: string[] = []
  if (crore) parts.push(`${numberInWords(crore)} crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

/** "eight thousand only" — the rupees, then the paise when there are any. */
export function rupeesInWords(amount: number | string | null | undefined): string {
  const paiseTotal = Math.round((Number(amount) || 0) * 100)
  const rupees = Math.floor(Math.abs(paiseTotal) / 100)
  const paise = Math.abs(paiseTotal) % 100

  if (!paise) return `${numberInWords(rupees)} only`
  if (!rupees) return `${belowHundred(paise)} paise only`
  return `${numberInWords(rupees)} and ${belowHundred(paise)} paise only`
}
