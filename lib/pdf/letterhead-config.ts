/**
 * Tunable knobs for the KKR letterhead documents (lab report, discharge
 * summary, charge sheet, patient charges).
 *
 * Edit values here, then run `npm run pdf:demo` to re-render the sample
 * PDFs into `tmp/pdf-demo/` — no code changes needed for spacing/font/color
 * tweaks. All sizes are in millimetres unless noted otherwise (jsPDF's unit).
 */

export const LETTERHEAD_CONFIG = {
  /**
   * The clinic's office printer is black-and-white. When false, every
   * document renders black text on white with ruled borders instead of
   * colour fills (table headers, abnormal lab results, etc). Flip to true
   * only if a colour printer/screen-only use case comes up later.
   */
  useColor: false,

  /** The four-field Name / Age-Sex / Date / Id-No block under the header. */
  patientBlock: {
    fontFamily: 'times' as 'times' | 'helvetica',
    fontSize: 12.5,
    bold: true,
    /** Pt.Name is forced to upper case regardless of how it's stored. */
    uppercaseName: true,
    /** Vertical gap between the two rows. */
    rowGap: 8,
    /**
     * Horizontal split point for the second column, as a fraction of the
     * printable width (0 = left margin, 1 = right margin). 0.5 balances the
     * two columns evenly across the page.
     */
    col2Fraction: 0.5,
    /** Gap between a label ("Pt.Name:-") and its value. */
    labelValueGapMm: 2,
    /** Space after the block, before the horizontal rule beneath it. */
    paddingBeforeRuleMm: 3,
    /** Space after the rule, before the section title / content starts. */
    paddingAfterRuleMm: 8,
  },

  sectionTitle: {
    fontSize: 11,
    bold: true,
    centered: true,
  },

  /** Bordered black-and-white table style (charges, medications). */
  table: {
    borderWeightMm: 0.3,
    headerBold: true,
    rowHeightMm: 7,
    headerHeightMm: 8,
    cellPaddingMm: 3,
  },

  /**
   * Print-mode vertical calibration: independent of where the rule/footer
   * band sit in `demo sheet.jpeg` (see LETTERHEAD_TOP/BOTTOM in
   * kkr-letterhead-bg.ts). Digital mode always uses the image-derived
   * values, since the background image is present to line up against.
   * Print mode has no background image to check against, so these offsets
   * exist to hand-tune against the real pre-printed paper once it's been
   * run through the office printer — start at 0 (matches digital mode) and
   * nudge in millimetres if the text lands high or low of the printed
   * lines. (Left/right margins aren't exposed yet — add them here once a
   * physical test print shows whether horizontal drift is actually a
   * problem; most office printers don't introduce any.)
   */
  print: {
    topOffsetMm: 0,
    bottomOffsetMm: 0,
  },
}
