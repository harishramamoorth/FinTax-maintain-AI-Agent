import { describe, expect, it } from 'vitest';
import { CLIENT_DEMO_DOCUMENTS, CLIENT_DEMO_PROFILES } from './clientDemoData';
import { answerClientQuestion } from './clientAssistant';

const muster = CLIENT_DEMO_PROFILES[0];
const nordlicht = CLIENT_DEMO_PROFILES[1];
const palm = CLIENT_DEMO_PROFILES[2];
const docsFor = (email: string) => CLIENT_DEMO_DOCUMENTS.filter((document) => document.clientId === email);

describe('client demo assistant', () => {
  it('calculates month totals and cites only the selected client records', () => {
    const answer = answerClientQuestion('What is my financial summary this month?', 'en', muster, docsFor(muster.email), muster.tasks);

    expect(answer.answer).toContain('sales €3,689.00 gross');
    expect(answer.answer).toContain('purchases €535.50 gross');
    expect(answer.references).toEqual(expect.arrayContaining(['MUS-INV-1026 · October-sales-invoice-1026.pdf', 'MUS-PUR-441 · Cloud-services-invoice-441.pdf']));
    expect(answer.references.some((reference) => reference.startsWith('NOR-'))).toBe(false);
  });

  it('builds company-specific financial summaries for every fictional client', () => {
    for (const profile of CLIENT_DEMO_PROFILES) {
      const clientDocuments = docsFor(profile.email);
      const answer = answerClientQuestion('What is my company financial summary this month?', 'en', profile, clientDocuments, profile.tasks);

      expect(answer.answer).toContain(profile.company);
      expect(answer.answer).toMatch(profile.currency === 'EUR' ? /€/ : /AED/);
      expect(answer.references.length).toBeGreaterThan(0);
      expect(answer.references.every((reference) => clientDocuments.some((document) => reference.startsWith(document.id)))).toBe(true);
    }
  });

  it('returns known unpaid invoices, VAT totals and client-specific currencies', () => {
    const unpaid = answerClientQuestion('Which invoices are still unpaid?', 'en', nordlicht, docsFor(nordlicht.email), nordlicht.tasks);
    const vat = answerClientQuestion('What is my total VAT from available invoices?', 'en', muster, docsFor(muster.email), muster.tasks);
    const palmVat = answerClientQuestion('What is my total VAT from available invoices?', 'en', palm, docsFor(palm.email), palm.tasks);
    const palmArabicVat = answerClientQuestion('What is my total VAT from available invoices?', 'ar', palm, docsFor(palm.email), palm.tasks);

    expect(unpaid.answer).toContain('€2,142.00');
    expect(unpaid.answer).toContain('NOR-SALES-811');
    expect(vat.answer).toContain('€674.50');
    expect(palmVat.answer).toContain('AED');
    expect(palmArabicVat.answer).toContain('د.إ');
    expect(palmArabicVat.answer).toContain('ضريبة');
  });

  it('summarizes bank statements, payroll, tax letters, missing documents and tasks', () => {
    const bank = answerClientQuestion('Summarize my latest bank statement', 'en', muster, docsFor(muster.email), muster.tasks);
    const payroll = answerClientQuestion('Show payroll summary for September', 'en', muster, docsFor(muster.email), muster.tasks);
    const letter = answerClientQuestion('Explain this tax-office letter in simple English', 'en', muster, docsFor(muster.email), muster.tasks);
    const missing = answerClientQuestion('What documents are missing?', 'en', nordlicht, docsFor(nordlicht.email), nordlicht.tasks);
    const tasks = answerClientQuestion('What tasks do I need to complete?', 'en', muster, docsFor(muster.email), muster.tasks);

    expect(bank.answer).toContain('5200.00 EUR');
    expect(bank.references[0]).toContain('MUS-BANK-1026');
    expect(payroll.answer).toContain('€8,500.00');
    expect(payroll.answer).toContain('2 employees');
    expect(letter.answer).toContain('EUR 1,420.00');
    expect(letter.answer).toContain('2026-11-10');
    expect(missing.answer).toContain('September business bank statement');
    expect(tasks.answer).toContain('Confirm two October bank transactions');
    expect(tasks.actions.some((action) => action.type === 'view_tasks')).toBe(true);
  });

  it('offers accountant follow-up for unclear questions and responds in German', () => {
    const request = answerClientQuestion('Please ask my accountant to clarify this transaction', 'en', muster, docsFor(muster.email), muster.tasks);
    const german = answerClientQuestion('Welche Rechnungen sind unbezahlt?', 'de', muster, docsFor(muster.email), muster.tasks);

    expect(request.actions.some((action) => action.type === 'ask_accountant')).toBe(true);
    expect(german.answer).toContain('714,00');
    expect(german.answer).toContain('unbezahlt');
  });

  it('does not invent totals where the selected client has no matching records', () => {
    const emptyDocs = docsFor(nordlicht.email).filter((document) => document.category !== 'bank_statement');
    const answer = answerClientQuestion('Summarize my bank statement', 'en', nordlicht, emptyDocs, nordlicht.tasks);

    expect(answer.answer).toContain("No bank statement is available");
    expect(answer.references).toEqual([]);
    expect(answer.actions.some((action) => action.type === 'ask_accountant')).toBe(true);
  });
});
