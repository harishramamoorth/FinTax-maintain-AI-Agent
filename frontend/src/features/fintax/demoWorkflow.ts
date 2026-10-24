export const DEMO_CATEGORIES = [
  ['bank_statement', 'Bank statement'],
  ['purchase_invoice', 'Purchase invoice'],
  ['sales_invoice', 'Sales invoice'],
  ['receipt', 'Receipt'],
  ['cash_book', 'Cash book / cash receipt'],
  ['payroll', 'Payroll / payslip'],
  ['timesheet', 'Timesheet'],
  ['sick_note', 'Sick note'],
  ['employee_record', 'Employee record'],
  ['company_formation', 'Company formation'],
  ['commercial_register', 'Commercial register extract'],
  ['contract', 'Contract'],
  ['correspondence', 'Tax-office correspondence'],
  ['other_correspondence', 'Other correspondence'],
  ['identity_document', 'ID document'],
  ['other', 'Other'],
] as const;

export type DemoCategory = typeof DEMO_CATEGORIES[number][0];

export interface DemoFields {
  documentDate: string;
  counterparty: string;
  reference: string;
  description: string;
  netAmount: string;
  vatRate: string;
  vatAmount: string;
  grossAmount: string;
  debitAccount: string;
  creditAccount: string;
}

export interface DemoDocument {
  id: string;
  name: string;
  category: DemoCategory;
  sizeBytes: number;
  createdAt: string;
  status: 'processing' | 'review' | 'approved' | 'password_required' | 'action_required' | 'needs_information' | 'rejected';
  confidence: number;
  fields: DemoFields;
  sample: boolean;
  clientId?: string;
  paymentStatus?: 'paid' | 'unpaid' | 'unknown';
  currency?: string;
  replacementFor?: string;
  workflowStage?: 'received' | 'validation' | 'classification' | 'extraction' | 'checks' | 'confidence' | 'staff_review' | 'completed';
  detectedLanguage?: string;
  validationWarnings?: string[];
  extractedDetails?: Record<string, string>;
  reviewHistory?: { at: string; action: string; details: string }[];
  clientRequest?: { reason: string; createdAt: string; response?: string; resolvedAt?: string };
  note?: string;
  file?: File;
  extractedText?: string;
  pageCount?: number;
  processingProgress?: number;
}

const DOCUMENT_STATUS_TRANSITIONS: Record<DemoDocument['status'], readonly DemoDocument['status'][]> = {
  processing: ['review', 'password_required', 'action_required'],
  review: ['approved', 'needs_information', 'action_required', 'rejected'],
  approved: [],
  password_required: ['review', 'action_required'],
  action_required: ['review', 'needs_information', 'rejected'],
  needs_information: ['review', 'action_required', 'rejected'],
  rejected: ['review'],
};

export function canTransitionDocumentStatus(from: DemoDocument['status'], to: DemoDocument['status']): boolean {
  return from === to || DOCUMENT_STATUS_TRANSITIONS[from].includes(to);
}

const acceptedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'tif', 'tiff', 'bmp']);
const acceptedTypes = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'image/tiff', 'image/bmp',
]);
export const MAX_DEMO_FILE_BYTES = 50 * 1024 * 1024;

export function validateDemoFile(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_DEMO_FILE_BYTES) return 'Files must be 50 MB or smaller.';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const supportedType = acceptedTypes.has(file.type.toLowerCase());
  if (!acceptedExtensions.has(extension) && !supportedType) {
    return 'Choose a PDF or a common photo/scan format (JPEG, PNG, WebP, HEIC, TIFF, or BMP).';
  }
  return null;
}

export function categoryForFilename(name: string, text = ''): DemoCategory {
  const value = `${name} ${text}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\b(?:bank|statement|kontoauszug)\b/.test(value)) return 'bank_statement';
  if (/\b(?:purchase|eingang|supplier|vendor)\b/.test(value)) return 'purchase_invoice';
  if (/\b(?:sales|ausgang|customer)\b/.test(value)) return 'sales_invoice';
  if (/\b(?:receipt|beleg|quittung)\b/.test(value)) return 'receipt';
  if (/\b(?:cash ?book|kassenbuch)\b/.test(value)) return 'cash_book';
  if (/\b(?:payroll|payslip|salary|lohn|gehalt)\b/.test(value)) return 'payroll';
  if (/\b(?:timesheet|time sheet|arbeitszeit)\b/.test(value)) return 'timesheet';
  if (/\b(?:sick note|sick leave|krankmeldung|arbeitsunfähigkeit)\b/.test(value)) return 'sick_note';
  if (/\b(?:employee|staff|mitarbeiter)\b/.test(value)) return 'employee_record';
  if (/\b(?:commercial register|handelsregister|register extract)\b/.test(value)) return 'commercial_register';
  if (/\b(?:company formation|formation|gründung)\b/.test(value)) return 'company_formation';
  if (/\b(?:contract|vertrag)\b/.test(value)) return 'contract';
  if (/\b(?:tax office|finanzamt)\b/.test(value)) return 'correspondence';
  if (/\b(?:correspondence|letter|brief)\b/.test(value)) return 'other_correspondence';
  if (/\b(?:passport|identity|emirates|ausweis|id card)\b/.test(value)) return 'identity_document';
  return 'other';
}

export function sampleFields(category: DemoCategory, id: string): DemoFields {
  const isBank = category === 'bank_statement';
  const gross = isBank || category === 'payroll' ? '1240.00' : '119.00';
  const net = isBank || category === 'payroll' ? gross : '100.00';
  const vat = isBank || category === 'payroll' ? '0.00' : '19.00';
  return {
    documentDate: '2026-10-18',
    counterparty: isBank ? 'Rheinland Bank AG' : 'Muster GmbH',
    reference: `DEMO-${id.slice(-5).toUpperCase()}`,
    description: isBank ? 'Incoming transfer · sample data' : 'Office supplies · sample data',
    netAmount: net,
    vatRate: isBank || category === 'payroll' ? '0' : '19',
    vatAmount: vat,
    grossAmount: gross,
    debitAccount: isBank ? '1200' : '4930',
    creditAccount: isBank ? '8400' : '1200',
  };
}

export function emptyDemoFields(): DemoFields {
  return {
    documentDate: '',
    counterparty: '',
    reference: '',
    description: '',
    netAmount: '',
    vatRate: '',
    vatAmount: '',
    grossAmount: '',
    debitAccount: '',
    creditAccount: '',
  };
}

function amountFromText(text: string, labels: string): string {
  const match = text.match(new RegExp(`(?:${labels})\\s*[:#]?\\s*(?:(?:EUR|€)\\s*)?(-?\\d[\\d\\s.,]*\\d|-?\\d)\\s*(?:EUR|€)?(?![\\d.,]|\\s*%)`, 'i'));
  if (!match) return '';
  const raw = match[1].replace(/\s/g, '');
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  const decimalSeparator = comma > dot ? ',' : dot > comma ? '.' : '';
  let normalized = raw;
  if (decimalSeparator) {
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = raw.split(groupingSeparator).join('').replace(decimalSeparator, '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

export function extractDemoFields(text: string): { fields: DemoFields; confidence: number } {
  const dateMatch = text.match(/(?:invoice\s*date|document\s*date|rechnungsdatum|belegdatum|datum|date)\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
  let documentDate = '';
  if (dateMatch) {
    const value = dateMatch[1];
    if (/^\d{4}-/.test(value)) documentDate = value;
    else {
      const [day, month, year] = value.split(/[./]/);
      const fullYear = year.length === 2 ? `20${year}` : year;
      documentDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  const referenceMatch = text.match(/(?:invoice\s*(?:no\.?|number)|rechnungsnummer|rechnung(?:s-?nr\.?)|beleg(?:nummer|nr\.?)|reference|referenz)\s*[:#]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i);
  const counterpartyLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) =>
    line.length >= 3 && line.length <= 100 && !/^(invoice|rechnung|date|datum|total|summe|brutto|netto|vat|mwst|ust)\b/i.test(line),
  ) ?? '';
  const netAmount = amountFromText(text, 'net(?: amount)?|netto(?:betrag)?');
  const vatAmount = amountFromText(text, 'vat(?: amount)?|mwst(?:\\.?betrag)?|ust(?:\\.?betrag)?|tax amount');
  const grossAmount = amountFromText(text, 'gross(?: amount)?|brutto(?:betrag)?|total(?: amount)?|invoice total|amount due|summe');
  const rateMatch = text.match(/(?:vat|mwst|ust|tax)\s*(?:rate|satz)?\s*[:#]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  const valueCount = [documentDate, referenceMatch?.[1], counterpartyLine, netAmount, vatAmount, grossAmount].filter(Boolean).length;
  return {
    fields: {
      documentDate,
      counterparty: counterpartyLine,
      reference: referenceMatch?.[1] ?? '',
      description: '',
      netAmount,
      vatRate: rateMatch?.[1].replace(',', '.') ?? '',
      vatAmount,
      grossAmount,
      debitAccount: '',
      creditAccount: '',
    },
    confidence: valueCount === 0 ? 0 : Math.min(0.85, 0.25 + valueCount * 0.1),
  };
}

export function detectDocumentLanguage(text: string): string {
  if (!text.trim()) return 'Not detected · manual review needed';
  if (/[\u0600-\u06ff]/.test(text)) return 'Arabic script detected · manual review needed';
  if (/\b(?:rechnung|rechnungsdatum|kontoauszug|finanzamt|umsatzsteuer|bruttobetrag)\b|[äöüß]/i.test(text)) return 'German (heuristic)';
  if (/[a-z]/i.test(text)) return 'English/Latin text (heuristic)';
  return 'Unknown · manual review needed';
}

export function extractDocumentDetails(category: DemoCategory, text: string): Record<string, string> {
  if (!text.trim()) return {};
  const labeledValue = (labels: string) => text.match(new RegExp(`(?:${labels})\\s*[:#]?\\s*([^\\r\\n]{1,100})`, 'i'))?.[1]?.trim() ?? '';
  if (category === 'bank_statement') {
    const transactions = text.split(/\r?\n/).map((line) => {
      const date = line.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/)?.[0];
      const amountMatches = [...line.matchAll(/-?\d[\d.,]*/g)];
      if (!date || !amountMatches.length) return null;
      const finalAmount = amountMatches[amountMatches.length - 1][0];
      const amountIndex = amountMatches[amountMatches.length - 1].index ?? line.length;
      const description = line.slice(line.indexOf(date) + date.length, amountIndex).replace(/[|;]/g, ' ').trim();
      const amount = Number(finalAmount.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
      return {
        date,
        description: description || 'Description not detected',
        debit: Number.isFinite(amount) && amount < 0 ? Math.abs(amount).toFixed(2) : '',
        credit: Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '',
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 5);
    return {
      'Opening balance': labeledValue('opening balance|anfangssaldo|anfangsbestand'),
      'Closing balance': labeledValue('closing balance|end balance|schlusssaldo|endsaldo'),
      ...Object.fromEntries(transactions.map((transaction, index) => [
        `Transaction ${index + 1}`,
        `${transaction.date} · ${transaction.description} · Debit: ${transaction.debit || '—'} · Credit: ${transaction.credit || '—'}`,
      ])),
      'Transaction rows': transactions.length ? `${transactions.length} candidate rows parsed using text patterns; verify sign and columns against statement.` : 'No transaction rows reliably recognized; review the statement manually.',
    };
  }
  if (category === 'payroll' || category === 'timesheet' || category === 'sick_note' || category === 'employee_record') {
    return {
      Employee: labeledValue('employee|employee name|mitarbeiter|name'),
      'Pay period': labeledValue('pay period|payroll period|abrechnungszeitraum|zeitraum'),
      'Net amount (candidate)': labeledValue('net pay|net salary|nettoverdienst|auszahlungsbetrag'),
      'Gross amount (candidate)': labeledValue('gross pay|gross salary|bruttoverdienst|bruttogehalt'),
    };
  }
  if (category === 'company_formation' || category === 'commercial_register' || category === 'contract') {
    return {
      'Organization / counterparty (candidate)': labeledValue('company|company name|firma|gesellschaft|party|vertragspartei'),
      'Reference (candidate)': labeledValue('register number|registration number|handelsregisternummer|reference|aktenzeichen'),
      'Effective date (candidate)': labeledValue('effective date|formation date|vertragsbeginn|gründungsdatum'),
    };
  }
  if (category === 'correspondence' || category === 'other_correspondence') {
    return {
      Sender: labeledValue('from|sender|absender|von'),
      Subject: labeledValue('subject|betreff'),
      'Reference / case number': labeledValue('reference|case number|aktenzeichen|steuernummer'),
      Deadline: labeledValue('deadline|due date|frist|antwort bis'),
    };
  }
  if (category === 'identity_document') {
    return { 'Identity document review': 'Sensitive identity fields are not extracted in this demo. Staff must inspect the original manually.' };
  }
  return {};
}

export function validateDemoFields(fields: DemoFields): string[] {
  const issues: string[] = [];
  if (!fields.documentDate || Number.isNaN(Date.parse(fields.documentDate))) issues.push('Enter a valid document date.');
  if (!fields.counterparty.trim()) issues.push('Enter a supplier, customer, or bank.');
  if (!fields.reference.trim()) issues.push('Enter a document or transaction reference.');
  if (!fields.netAmount.trim() || !fields.vatAmount.trim() || !fields.grossAmount.trim()) {
    issues.push('Enter net, tax, and gross amounts.');
  }
  const net = Number(fields.netAmount);
  const vat = Number(fields.vatAmount);
  const gross = Number(fields.grossAmount);
  if (![net, vat, gross].every(Number.isFinite)) {
    issues.push('Net, tax, and gross amounts must be valid numbers.');
  } else if (Math.abs(net + vat - gross) > 0.01) {
    issues.push('Net amount plus VAT does not equal the gross amount.');
  }
  if (!/^\d{4,6}$/.test(fields.debitAccount)) issues.push('Enter a 4–6 digit debit account.');
  if (!/^\d{4,6}$/.test(fields.creditAccount)) issues.push('Enter a 4–6 digit credit account.');
  return issues;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function accountingCsv(documents: DemoDocument[]): string {
  const header = [
    'Date', 'Document', 'Counterparty', 'Description', 'DebitAccount',
    'CreditAccount', 'NetAmount', 'VATRate', 'VATAmount', 'GrossAmount', 'Currency',
  ];
  const rows = documents
    .filter((document) => document.status === 'approved')
    .filter((document) => ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'].includes(document.category))
    .map(({ name, fields }) => [
      fields.documentDate, name, fields.counterparty, fields.description, fields.debitAccount,
      fields.creditAccount, fields.netAmount, fields.vatRate, fields.vatAmount, fields.grossAmount, 'EUR',
    ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
