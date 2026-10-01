import { describe, it, expect } from 'vitest'
import { numberInWords, rupeesInWords } from '@/lib/format/rupees-in-words'

/** The receipt's "Rupees: eight thousand only." (client, 1 Oct). */
describe('rupees in words', () => {
  it('spells the amount on the client\'s own receipt', () => {
    expect(rupeesInWords(8000)).toBe('eight thousand only')
  })

  it('uses thousand, lakh and crore', () => {
    expect(rupeesInWords(125000)).toBe('one lakh twenty five thousand only')
    expect(rupeesInWords(112007)).toBe('one lakh twelve thousand seven only')
    expect(rupeesInWords(10000000)).toBe('one crore only')
    expect(rupeesInWords(253417819)).toBe('twenty five crore thirty four lakh seventeen thousand eight hundred nineteen only')
    expect(numberInWords(1230000000)).toBe('one hundred twenty three crore')
  })

  it('handles the small and the awkward', () => {
    expect(rupeesInWords(0)).toBe('zero only')
    expect(rupeesInWords(19)).toBe('nineteen only')
    expect(rupeesInWords(40)).toBe('forty only')
    expect(rupeesInWords(101)).toBe('one hundred one only')
    expect(rupeesInWords(null)).toBe('zero only')
    expect(rupeesInWords('300')).toBe('three hundred only')
  })

  it('adds the paise when there are any', () => {
    expect(rupeesInWords(1500.5)).toBe('one thousand five hundred and fifty paise only')
    expect(rupeesInWords(0.75)).toBe('seventy five paise only')
    // 0.1 + 0.2 must not become "thirty and zero paise"
    expect(rupeesInWords(0.1 + 0.2)).toBe('thirty paise only')
  })
})
