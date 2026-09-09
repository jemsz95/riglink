/** Org-scoped from the first meaningful segment, like every other domain. */
export const invoiceKeys = {
  all: (orgId: string) => ['invoices', orgId] as const,
  list: (orgId: string, status: string) =>
    ['invoices', orgId, 'list', status] as const,
  detail: (orgId: string, invoiceId: string) =>
    ['invoices', orgId, 'detail', invoiceId] as const,
  lines: (orgId: string, invoiceId: string) =>
    ['invoices', orgId, 'lines', invoiceId] as const,
  forJob: (orgId: string, jobId: string) =>
    ['invoices', orgId, 'job', jobId] as const,
  export: (orgId: string, from: string, to: string) =>
    ['invoices', orgId, 'export', from, to] as const,
}

export const portalInvoiceKeys = {
  forJob: (clientId: string, jobId: string) =>
    ['portal', clientId, 'invoices', jobId] as const,
  lines: (clientId: string, invoiceId: string) =>
    ['portal', clientId, 'invoice-lines', invoiceId] as const,
}
