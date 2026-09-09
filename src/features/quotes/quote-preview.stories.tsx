import { QuotePreview } from './quote-preview'
import type { PrintableLine, PrintableQuote } from './quote-preview'
import type { Meta, StoryObj } from '@storybook/react-vite'

const quote: PrintableQuote = {
  number: 1043,
  status: 'sent',
  currency: 'USD',
  subtotal_cents: 25363,
  tax_cents: 5073,
  total_cents: 30436,
  notes: 'Includes a return visit to re-pressurise the system if needed.',
  terms: 'Payment due 30 days from invoice. Parts guaranteed 12 months.',
  valid_until: '2026-04-15',
  sent_at: '2026-03-05T09:14:00Z',
}

const lines: Array<PrintableLine> = [
  {
    id: '1',
    position: 1,
    kind: 'material',
    description: 'Boiler seal kit',
    unit: 'each',
    quantity: '3.333',
    unit_price_cents: 1999,
    line_total_cents: 6663,
  },
  {
    id: '2',
    position: 2,
    kind: 'labor',
    description: 'Engineer time',
    unit: 'hour',
    quantity: '2.5',
    unit_price_cents: 8500,
    line_total_cents: 21250,
  },
  {
    id: '3',
    position: 3,
    kind: 'discount',
    description: 'Goodwill discount',
    unit: 'each',
    quantity: '1',
    unit_price_cents: -2550,
    line_total_cents: -2550,
  },
]

const meta = {
  title: 'Domain/QuotePreview',
  component: QuotePreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The quote as a DOCUMENT, rendered identically for staff and for ' +
          'the client. If the two surfaces looked different, "what did they ' +
          'actually agree to" would become a guess.\n\n' +
          'Print rules are functional, not decorative: clients print these to ' +
          'PDF and forward them to whoever signs off. The `print:` utilities ' +
          'drop the app chrome, force ink to black on white (a token-coloured ' +
          'total is unreadable on a greyscale office printer), and keep each ' +
          'line on one page with `break-inside-avoid`.\n\n' +
          'Totals are read from the row, never recomputed in the renderer. ' +
          'For a document that has been sent, the database is the authority; ' +
          'recomputing here is how a printed quote comes to disagree with the ' +
          'invoice that follows it.',
      },
    },
  },
  args: {
    quote,
    lines,
    jobTitle: 'Annual boiler service',
    jobNumber: 1043,
    clientName: 'Northgate Properties',
    orgName: 'Riglink Plumbing',
  },
} satisfies Meta<typeof QuotePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** A discount is an ordinary line with a negative unit price -- not a special
 *  column -- so it flows through the same rounding, tax and export path.
 *  Note the negative tax on that row. */
export const WithDiscount: Story = {}

/** No notes, no terms, no expiry. The sections disappear rather than printing
 *  empty headings. */
export const Minimal: Story = {
  args: {
    quote: { ...quote, notes: null, terms: null, valid_until: null },
    lines: lines.slice(0, 1),
  },
}

/** A long quote, to check the table stays legible and each row can break
 *  across pages without splitting. */
export const ManyLines: Story = {
  args: {
    lines: Array.from({ length: 18 }, (_, index) => ({
      id: String(index),
      position: index + 1,
      kind: index % 3 === 0 ? 'labor' : 'material',
      description:
        index % 3 === 0
          ? 'Engineer time'
          : `Replacement part ${index + 1} — long description that has to wrap on a narrow page`,
      unit: index % 3 === 0 ? 'hour' : 'each',
      quantity: '2',
      unit_price_cents: 4550 + index * 137,
      line_total_cents: (4550 + index * 137) * 2,
    })),
  },
}
