import { sampleFields, type DemoCategory, type DemoDocument, type DemoFields } from './demoWorkflow';
import { DEMO_CLIENTS, type DemoClientAccount } from './demoAccounts';

export interface DemoTask {
  id: string;
  title: string;
  dueDate: string;
  owner: string;
  complete: boolean;
}

export interface ClientDemoProfile extends DemoClientAccount {
  registrationNumber: string;
  industry: string;
  period: string;
  payroll: { month: string; employees: number; gross: number; deductions: number; net: number };
  missingDocuments: string[];
  tasks: DemoTask[];
}

const profiles: ClientDemoProfile[] = [
  {
    ...DEMO_CLIENTS[0],
    registrationNumber: 'HRB 104822 · fictional',
    industry: 'Office supplies and consulting',
    period: 'October 2026',
    payroll: { month: 'September 2026', employees: 2, gross: 8500, deductions: 1700, net: 6800 },
    missingDocuments: ['October petty-cash receipts'],
    tasks: [
      { id: 'muster-bank', title: 'Confirm two October bank transactions', dueDate: '2026-10-25', owner: 'Lena M.', complete: false },
      { id: 'muster-payroll', title: 'Confirm September payroll totals', dueDate: '2026-10-27', owner: 'Jonas K.', complete: false },
      { id: 'muster-tax', title: 'Review VAT prepayment notice', dueDate: '2026-10-28', owner: 'Lena M.', complete: false },
    ],
  },
  {
    ...DEMO_CLIENTS[1],
    registrationNumber: 'HRB 220418 · fictional',
    industry: 'Outdoor goods wholesaler',
    period: 'October 2026',
    payroll: { month: 'September 2026', employees: 4, gross: 14200, deductions: 2980, net: 11220 },
    missingDocuments: ['September business bank statement', 'Two supplier receipts for October'],
    tasks: [
      { id: 'nord-inventory', title: 'Confirm inventory adjustment', dueDate: '2026-10-26', owner: 'Lena M.', complete: false },
      { id: 'nord-payroll', title: 'Send September payroll approval', dueDate: '2026-10-27', owner: 'Jonas K.', complete: false },
    ],
  },
  {
    ...DEMO_CLIENTS[2],
    registrationNumber: 'CN-778104 · fictional',
    industry: 'Import and distribution',
    period: 'October 2026',
    payroll: { month: 'September 2026', employees: 3, gross: 36500, deductions: 4200, net: 32300 },
    missingDocuments: ['October customs duty statement'],
    tasks: [
      { id: 'palm-customs', title: 'Upload October customs duty statement', dueDate: '2026-10-26', owner: 'Lena M.', complete: false },
      { id: 'palm-payroll', title: 'Confirm September payroll register', dueDate: '2026-10-29', owner: 'Jonas K.', complete: false },
    ],
  },
];

function documentRecord(
  client: ClientDemoProfile,
  id: string,
  name: string,
  category: DemoCategory,
  status: DemoDocument['status'],
  fields: Partial<DemoFields>,
  details: Record<string, string> = {},
  paymentStatus?: DemoDocument['paymentStatus'],
): DemoDocument {
  return {
    id,
    name,
    category,
    sizeBytes: 190_000,
    createdAt: '2026-10-20T10:00:00.000Z',
    status,
    confidence: status === 'approved' ? 0.94 : 0.7,
    fields: { ...sampleFields(category, id), ...fields },
    sample: true,
    clientId: client.email,
    paymentStatus,
    currency: client.currency,
    extractedDetails: details,
    workflowStage: status === 'approved' ? 'completed' : 'staff_review',
    detectedLanguage: client.country === 'United Arab Emirates' ? 'English (fictional sample)' : 'German (fictional sample)',
    validationWarnings: status === 'approved' ? [] : ['Fictional example requires staff review.'],
    reviewHistory: [{ at: '2026-10-20T10:00:00.000Z', action: 'Demo sample added', details: 'Fictional client walkthrough data.' }],
    note: 'Fictional sample record for the interactive client assistant demo.',
  };
}

export const CLIENT_DEMO_PROFILES: ClientDemoProfile[] = profiles;

export const CLIENT_DEMO_DOCUMENTS: DemoDocument[] = [
  documentRecord(profiles[0], 'MUS-INV-1026', 'October-sales-invoice-1026.pdf', 'sales_invoice', 'approved', {
    documentDate: '2026-10-08', counterparty: 'Rheinland Bürobedarf KG', reference: 'MUS-INV-1026',
    netAmount: '2500.00', vatRate: '19', vatAmount: '475.00', grossAmount: '2975.00',
  }, {}, 'paid'),
  documentRecord(profiles[0], 'MUS-INV-1031', 'Consulting-invoice-1031.pdf', 'sales_invoice', 'review', {
    documentDate: '2026-10-15', counterparty: 'Elbe Projekt GmbH', reference: 'MUS-INV-1031',
    netAmount: '600.00', vatRate: '19', vatAmount: '114.00', grossAmount: '714.00',
  }, {}, 'unpaid'),
  documentRecord(profiles[0], 'MUS-PUR-441', 'Cloud-services-invoice-441.pdf', 'purchase_invoice', 'approved', {
    documentDate: '2026-10-12', counterparty: 'CloudWerk GmbH', reference: 'CW-441',
    netAmount: '450.00', vatRate: '19', vatAmount: '85.50', grossAmount: '535.50',
  }, {}, 'paid'),
  documentRecord(profiles[0], 'MUS-BANK-1026', 'Muster-bank-statement-October.pdf', 'bank_statement', 'review', {
    documentDate: '2026-10-20', counterparty: 'Rheinland Bank AG', reference: 'MUS-BANK-1026',
  }, {
    'Opening balance': '5200.00 EUR',
    'Closing balance': '6440.00 EUR',
    'Transaction 1': '2026-10-08 · Rheinland Bürobedarf KG · Credit: 2975.00 EUR',
    'Transaction 2': '2026-10-12 · CloudWerk GmbH · Debit: 535.50 EUR',
    'Transaction 3': '2026-10-18 · Elbe Projekt GmbH · Credit: 714.00 EUR',
  }),
  documentRecord(profiles[0], 'MUS-PAY-0926', 'September-payroll-summary.pdf', 'payroll', 'approved', {
    documentDate: '2026-09-30', counterparty: '2 employees', reference: 'PAY-0926',
  }, { 'Pay period': 'September 2026', 'Gross payroll': '8500.00 EUR', 'Deductions': '1700.00 EUR', 'Net payroll': '6800.00 EUR' }),
  documentRecord(profiles[0], 'MUS-FA-1026', 'Finanzamt-VAT-notice-October.pdf', 'correspondence', 'action_required', {
    documentDate: '2026-10-16', counterparty: 'Finanzamt Köln', reference: 'FA-K-2026-881',
    description: 'VAT prepayment of EUR 1,420 due 10 November 2026.',
  }, { 'Letter summary': 'VAT prepayment notice for EUR 1,420.00; payment due 2026-11-10.' }),

  documentRecord(profiles[1], 'NOR-SALES-811', 'Nordlicht-order-811.pdf', 'sales_invoice', 'approved', {
    documentDate: '2026-10-10', counterparty: 'Alpen Outdoor GmbH', reference: 'NOR-SALES-811',
    netAmount: '1800.00', vatRate: '19', vatAmount: '342.00', grossAmount: '2142.00',
  }, {}, 'unpaid'),
  documentRecord(profiles[1], 'NOR-PUR-337', 'Nordlicht-supplier-337.pdf', 'purchase_invoice', 'approved', {
    documentDate: '2026-10-13', counterparty: 'Bergsport Import KG', reference: 'NOR-PUR-337',
    netAmount: '920.00', vatRate: '19', vatAmount: '174.80', grossAmount: '1094.80',
  }, {}, 'paid'),
  documentRecord(profiles[1], 'NOR-PAY-0926', 'Nordlicht-payroll-September.pdf', 'payroll', 'approved', {
    documentDate: '2026-09-30', counterparty: '4 employees', reference: 'NOR-PAY-0926',
  }, { 'Pay period': 'September 2026', 'Gross payroll': '14200.00 EUR', 'Deductions': '2980.00 EUR', 'Net payroll': '11220.00 EUR' }),
  documentRecord(profiles[1], 'NOR-FA-110', 'Nordlicht-tax-office-letter.pdf', 'correspondence', 'needs_information', {
    documentDate: '2026-10-14', counterparty: 'Finanzamt Hamburg', reference: 'FA-HH-2026-110',
    description: 'Clarification requested for an input VAT entry.',
  }, { 'Letter summary': 'Finanzamt requests supporting evidence for an input VAT entry by 2026-10-30.' }),

  documentRecord(profiles[2], 'PAL-SALES-221', 'Palm-Grove-export-invoice-221.pdf', 'sales_invoice', 'approved', {
    documentDate: '2026-10-11', counterparty: 'Desert Gate Retail LLC', reference: 'PAL-SALES-221',
    netAmount: '24000.00', vatRate: '5', vatAmount: '1200.00', grossAmount: '25200.00',
  }, {}, 'paid'),
  documentRecord(profiles[2], 'PAL-SALES-230', 'Palm-Grove-distribution-invoice-230.pdf', 'sales_invoice', 'review', {
    documentDate: '2026-10-17', counterparty: 'Oasis Market LLC', reference: 'PAL-SALES-230',
    netAmount: '8000.00', vatRate: '5', vatAmount: '400.00', grossAmount: '8400.00',
  }, {}, 'unpaid'),
  documentRecord(profiles[2], 'PAL-PUR-090', 'Palm-Grove-freight-invoice-090.pdf', 'purchase_invoice', 'approved', {
    documentDate: '2026-10-19', counterparty: 'Gulf Freight Services', reference: 'PAL-PUR-090',
    netAmount: '3600.00', vatRate: '5', vatAmount: '180.00', grossAmount: '3780.00',
  }, {}, 'paid'),
  documentRecord(profiles[2], 'PAL-BANK-1026', 'Palm-Grove-bank-statement-October.pdf', 'bank_statement', 'approved', {
    documentDate: '2026-10-20', counterparty: 'Emirates Demo Bank', reference: 'PAL-BANK-1026',
  }, {
    'Opening balance': '82000.00 AED',
    'Closing balance': '107420.00 AED',
    'Transaction 1': '2026-10-11 · Desert Gate Retail LLC · Credit: 25200.00 AED',
    'Transaction 2': '2026-10-19 · Gulf Freight Services · Debit: 3780.00 AED',
  }),
  documentRecord(profiles[2], 'PAL-PAY-0926', 'Palm-Grove-payroll-September.pdf', 'payroll', 'approved', {
    documentDate: '2026-09-30', counterparty: '3 employees', reference: 'PAL-PAY-0926',
  }, { 'Pay period': 'September 2026', 'Gross payroll': '36500.00 AED', 'Deductions': '4200.00 AED', 'Net payroll': '32300.00 AED' }),
  documentRecord(profiles[2], 'PAL-TAX-440', 'Palm-Grove-tax-authority-letter.pdf', 'correspondence', 'action_required', {
    documentDate: '2026-10-12', counterparty: 'Federal Tax Authority', reference: 'FTA-2026-440',
    description: 'VAT return filing reminder for quarter ending September 2026.',
  }, { 'Letter summary': 'File the VAT return for the quarter ending 2026-09-30 by 2026-10-28.' }),
];

export function clientProfileFor(email: string): ClientDemoProfile {
  return CLIENT_DEMO_PROFILES.find((profile) => profile.email === email) ?? CLIENT_DEMO_PROFILES[0];
}
