import { describe, expect, it } from 'vitest';
import {
  accountingCsv, canTransitionDocumentStatus, categoryForFilename, emptyDemoFields, extractDemoFields, sampleFields, validateDemoFields, validateDemoFile,
  type DemoDocument,
} from './demoWorkflow';

describe('demo document workflow', () => {
  it('accepts supported files up to the demo upload limit', () => {
    expect(validateDemoFile({ name: 'scan.pdf', size: 1024, type: 'application/pdf' })).toBeNull();
    expect(validateDemoFile({ name: 'receipt.heic', size: 1024, type: 'image/heic' })).toBeNull();
    expect(validateDemoFile({ name: 'large.pdf', size: 50 * 1024 * 1024 + 1, type: 'application/pdf' })).toContain('50 MB');
    expect(validateDemoFile({ name: 'notes.txt', size: 1024, type: 'text/plain' })).toContain('Choose a PDF');
  });

  it('classifies common English and German document filenames', () => {
    expect(categoryForFilename('kontoauszug_mai.pdf')).toBe('bank_statement');
    expect(categoryForFilename('purchase_invoice_42.pdf')).toBe('purchase_invoice');
    expect(categoryForFilename('finanzamt_brief.pdf')).toBe('correspondence');
    expect(categoryForFilename('photo-001.png')).toBe('other');
    expect(categoryForFilename('scan.pdf', 'Kontoauszug October')).toBe('bank_statement');
    expect(categoryForFilename('fintax-demo-invoice.pdf')).toBe('other');
    expect(categoryForFilename('invoice.pdf', 'Tax amount 19%')).toBe('other');
  });

  it('extracts labeled values from locally parsed invoice text', () => {
    const result = extractDemoFields([
      'Muster GmbH',
      'Invoice date: 18.10.2026',
      'Invoice No: INV-1234',
      'Net amount: 1.234,56 EUR',
      'VAT: 234,56 EUR',
      'Gross amount: 1.469,12 EUR',
    ].join('\n'));
    expect(result.fields.documentDate).toBe('2026-10-18');
    expect(result.fields.counterparty).toBe('Muster GmbH');
    expect(result.fields.reference).toBe('INV-1234');
    expect(result.fields.netAmount).toBe('1234.56');
    expect(result.fields.vatAmount).toBe('234.56');
    expect(result.fields.grossAmount).toBe('1469.12');
    expect(result.fields.debitAccount).toBe('');
    expect(result.confidence).toBeGreaterThan(0);
    const vatRateOnly = extractDemoFields('VAT rate: 19%');
    expect(vatRateOnly.fields.vatRate).toBe('19');
    expect(vatRateOnly.fields.vatAmount).toBe('');
  });

  it('checks required fields and amount arithmetic before approval', () => {
    const fields = sampleFields('purchase_invoice', 'demo-12345');
    expect(validateDemoFields(fields)).toEqual([]);
    expect(validateDemoFields(emptyDemoFields())).toContain('Enter net, tax, and gross amounts.');
    expect(validateDemoFields({ ...fields, grossAmount: '120.00' })).toContain('Net amount plus VAT does not equal the gross amount.');
    expect(validateDemoFields({ ...fields, debitAccount: '12' })).toContain('Enter a 4–6 digit debit account.');
  });

  it('allows only defined document status transitions', () => {
    expect(canTransitionDocumentStatus('processing', 'review')).toBe(true);
    expect(canTransitionDocumentStatus('review', 'needs_information')).toBe(true);
    expect(canTransitionDocumentStatus('needs_information', 'review')).toBe(true);
    expect(canTransitionDocumentStatus('approved', 'review')).toBe(false);
    expect(canTransitionDocumentStatus('processing', 'approved')).toBe(false);
  });

  it('exports only approved accounting records and escapes CSV values', () => {
    const approved: DemoDocument = {
      id: 'demo-12345', name: 'invoice,"sample".pdf', category: 'purchase_invoice', sizeBytes: 100,
      createdAt: '2026-10-22T10:00:00.000Z', status: 'approved', confidence: 0.9,
      fields: { ...sampleFields('purchase_invoice', 'demo-12345'), counterparty: 'Vendor "A"' }, sample: true,
    };
    const pending: DemoDocument = { ...approved, id: 'demo-67890', status: 'review' };
    const payroll: DemoDocument = { ...approved, id: 'demo-payroll', category: 'payroll' };
    const csv = accountingCsv([approved, pending, payroll]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"invoice,""sample"".pdf"');
    expect(csv).toContain('"Vendor ""A"""');
    expect(csv).not.toContain('demo-67890');
  });
});
