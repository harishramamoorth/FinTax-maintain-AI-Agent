import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFields, type DemoDocument } from '../features/fintax/demoWorkflow';
import { useDemoDocumentsStore } from './demoDocumentsStore';

const makeDocument = (): DemoDocument => ({
  id: 'CLIENT-TEST01',
  name: 'invoice-demo.pdf',
  category: 'purchase_invoice',
  sizeBytes: 100,
  createdAt: '2026-10-23T00:00:00.000Z',
  status: 'review',
  confidence: 0.6,
  fields: sampleFields('purchase_invoice', 'CLIENT-TEST01'),
  sample: false,
  clientId: 'client-a@example.demo',
  workflowStage: 'staff_review',
  reviewHistory: [],
});

describe('shared demo document store', () => {
  beforeEach(() => useDemoDocumentsStore.setState({
    documents: [],
    assistantQuestions: [],
    followUpTasks: [],
    bankLinks: [],
    payrollDrafts: [],
    auditEvents: [],
    settings: { exportsEnabled: true, payrollApprovalsEnabled: true },
    roleAssignments: [
      { id: 'admin-demo', name: 'Admin Demo User', email: 'admin@fintax.demo', role: 'admin' },
      { id: 'staff-demo', name: 'Staff Demo User', email: 'staff@fintax.demo', role: 'staff' },
      { id: 'client-demo', name: 'Client Demo User', email: 'client@fintax.demo', role: 'client' },
    ],
    exports: [],
  }));

  it('shares uploaded documents and propagates staff approval', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Approved', 'Reviewed in demo.', {
      status: 'approved',
      workflowStage: 'completed',
    });

    const [document] = useDemoDocumentsStore.getState().documents;
    expect(document.status).toBe('approved');
    expect(document.workflowStage).toBe('completed');
    expect(document.reviewHistory?.at(-1)?.action).toBe('Approved');
  });

  it('stores client information requests and responses in review history', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().addFollowUpTask({
      title: 'Follow up on invoice',
      clientId: 'client-a@example.demo',
      documentId: 'CLIENT-TEST01',
      dueDate: '2026-10-30',
      owner: 'Demo reviewer',
    }, 'Demo reviewer');
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Information requested', 'Please send a clearer invoice.', {
      status: 'needs_information',
      clientRequest: { reason: 'Please send a clearer invoice.', createdAt: '2026-10-23T01:00:00.000Z' },
    });
    useDemoDocumentsStore.getState().respondToRequest('CLIENT-TEST01', 'Replacement uploaded.');

    const [document] = useDemoDocumentsStore.getState().documents;
    expect(document.clientRequest?.response).toBe('Replacement uploaded.');
    expect(document.clientRequest?.resolvedAt).toBeTruthy();
    expect(document.reviewHistory?.map((event) => event.action)).toEqual(['Information requested', 'Client response']);
    expect(useDemoDocumentsStore.getState().followUpTasks[0].status).toBe('completed');
  });

  it('keeps client ownership attached to each record for per-client filtering', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().addDocument({
      ...makeDocument(),
      id: 'CLIENT-TEST02',
      clientId: 'client-b@example.demo',
    });

    const clientA = useDemoDocumentsStore.getState().documents.filter((document) => document.clientId === 'client-a@example.demo');
    expect(clientA.map((document) => document.id)).toEqual(['CLIENT-TEST01']);
  });

  it('shares client questions with staff replies while keeping the owning client attached', () => {
    const question = {
      id: 'question-1',
      clientId: 'client-a@example.demo',
      question: 'Please clarify this bank transaction.',
      answer: 'I can send this to your accountant.',
      references: ['CLIENT-TEST01 · invoice-demo.pdf'],
      createdAt: '2026-10-23T02:00:00.000Z',
      replies: [],
    };
    useDemoDocumentsStore.getState().addAssistantQuestion(question);
    useDemoDocumentsStore.getState().replyToAssistantQuestion(question.id, 'Please check the transfer reference.', 'Demo accountant');

    const [stored] = useDemoDocumentsStore.getState().assistantQuestions;
    expect(stored.clientId).toBe('client-a@example.demo');
    expect(stored.replies[0].text).toBe('Please check the transfer reference.');
    expect(useDemoDocumentsStore.getState().assistantQuestions.filter((entry) => entry.clientId === 'client-b@example.demo')).toEqual([]);
  });

  it('records linked bank documents and allows links to be removed', () => {
    const store = useDemoDocumentsStore.getState();
    store.linkBankRecord('BANK-1', 'Transaction 1', 'INVOICE-1', 'Demo staff');
    store.linkBankRecord('BANK-1', 'Transaction 1', 'INVOICE-1', 'Demo staff');
    expect(useDemoDocumentsStore.getState().bankLinks).toHaveLength(1);

    useDemoDocumentsStore.getState().unlinkBankRecord('BANK-1', 'Transaction 1', 'INVOICE-1', 'Demo staff');
    expect(useDemoDocumentsStore.getState().bankLinks).toHaveLength(0);
  });

  it('requires payroll drafts to move from draft through validation before approval', () => {
    useDemoDocumentsStore.getState().savePayrollDraft({
      documentId: 'PAY-1',
      employee: 'Sample employee',
      payPeriod: '2026-10-01',
      grossAmount: '2000.00',
      netAmount: '1500.00',
      status: 'draft',
      validationIssues: [],
      updatedAt: '2026-10-23T00:00:00.000Z',
    }, 'Demo reviewer');

    expect(useDemoDocumentsStore.getState().transitionPayrollDraft('PAY-1', 'approved', 'Demo reviewer')).toBe(false);
    expect(useDemoDocumentsStore.getState().transitionPayrollDraft('PAY-1', 'validated', 'Demo reviewer')).toBe(true);
    expect(useDemoDocumentsStore.getState().transitionPayrollDraft('PAY-1', 'approved', 'Demo reviewer')).toBe(true);
    expect(useDemoDocumentsStore.getState().payrollDrafts[0].status).toBe('approved');
  });

  it('rejects invalid document status transitions and retains audit events', () => {
    useDemoDocumentsStore.getState().addDocument({ ...makeDocument(), status: 'approved' });
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Reopened', 'Not allowed.', { status: 'review' });

    expect(useDemoDocumentsStore.getState().documents[0].status).toBe('approved');
    expect(useDemoDocumentsStore.getState().auditEvents.some((event) => event.action === 'Reopened')).toBe(false);
  });

  it('records administration changes and successful exports in the session audit', () => {
    const store = useDemoDocumentsStore.getState();
    store.setWorkspaceSetting('exportsEnabled', false, 'Admin Demo User');
    store.setRoleAssignment('staff-demo', 'admin', 'Admin Demo User');
    store.recordExport(['INVOICE-1', 'RECEIPT-1'], 'Staff Demo User');

    const state = useDemoDocumentsStore.getState();
    expect(state.settings.exportsEnabled).toBe(false);
    expect(state.roleAssignments.find((assignment) => assignment.id === 'staff-demo')?.role).toBe('admin');
    expect(state.exports[0].documentIds).toEqual(['INVOICE-1', 'RECEIPT-1']);
    expect(state.auditEvents.map((event) => event.action)).toEqual([
      'CSV export downloaded',
      'Demo role assignment changed',
      'Workspace setting changed',
    ]);
  });

});
