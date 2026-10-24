import { create } from 'zustand';
import { canTransitionDocumentStatus, type DemoDocument, type DemoFields } from '@/features/fintax/demoWorkflow';
import { CLIENT_DEMO_DOCUMENTS } from '@/features/fintax/clientDemoData';

export interface ClientAssistantQuestion {
  id: string;
  clientId: string;
  question: string;
  answer: string;
  references: string[];
  createdAt: string;
  replies: { text: string; createdAt: string; from: string }[];
}

export interface DemoFollowUpTask {
  id: string;
  title: string;
  clientId?: string;
  documentId?: string;
  dueDate: string;
  owner: string;
  status: 'open' | 'completed';
  createdAt: string;
}

export interface DemoBankLink {
  statementId: string;
  transactionReference: string;
  accountingDocumentId: string;
  createdAt: string;
}

export interface DemoPayrollDraft {
  documentId: string;
  employee: string;
  payPeriod: string;
  grossAmount: string;
  netAmount: string;
  status: 'draft' | 'validated' | 'approved';
  validationIssues: string[];
  updatedAt: string;
}

export interface DemoAuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  details: string;
}

export interface DemoWorkspaceSettings {
  exportsEnabled: boolean;
  payrollApprovalsEnabled: boolean;
}

export interface DemoRoleAssignment {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'client';
}

interface DemoDocumentsState {
  documents: DemoDocument[];
  assistantQuestions: ClientAssistantQuestion[];
  followUpTasks: DemoFollowUpTask[];
  bankLinks: DemoBankLink[];
  payrollDrafts: DemoPayrollDraft[];
  auditEvents: DemoAuditEvent[];
  settings: DemoWorkspaceSettings;
  roleAssignments: DemoRoleAssignment[];
  exports: { id: string; at: string; actor: string; documentIds: string[] }[];
  addDocument(document: DemoDocument, actor?: string): void;
  updateDocument(id: string, update: Partial<DemoDocument>, actor?: string): void;
  updateFields(id: string, key: keyof DemoFields, value: string, actor?: string): void;
  recordReview(id: string, action: string, details: string, update: Partial<DemoDocument>, actor?: string): void;
  respondToRequest(id: string, response: string): void;
  addAssistantQuestion(question: ClientAssistantQuestion): void;
  replyToAssistantQuestion(id: string, text: string, from: string): void;
  addFollowUpTask(task: Omit<DemoFollowUpTask, 'id' | 'status' | 'createdAt'>, actor: string): void;
  toggleFollowUpTask(id: string, actor: string): void;
  linkBankRecord(statementId: string, transactionReference: string, accountingDocumentId: string, actor: string): void;
  unlinkBankRecord(statementId: string, transactionReference: string, accountingDocumentId: string, actor: string): void;
  savePayrollDraft(draft: DemoPayrollDraft, actor: string): void;
  transitionPayrollDraft(documentId: string, status: DemoPayrollDraft['status'], actor: string): boolean;
  setWorkspaceSetting(key: keyof DemoWorkspaceSettings, value: boolean, actor: string): void;
  setRoleAssignment(id: string, role: DemoRoleAssignment['role'], actor: string): void;
  recordExport(documentIds: string[], actor: string): void;
}

const recordAudit = (state: DemoDocumentsState, action: string, target: string, details: string, actor = 'Demo user'): DemoAuditEvent[] => [
  { id: `audit-${crypto.randomUUID()}`, at: new Date().toISOString(), actor, action, target, details },
  ...state.auditEvents,
].slice(0, 200);

export const useDemoDocumentsStore = create<DemoDocumentsState>((set) => ({
  documents: CLIENT_DEMO_DOCUMENTS,
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
  addDocument: (document, actor) => set((state) => ({
    documents: [document, ...state.documents],
    auditEvents: recordAudit(state, document.sample ? 'Sample record added' : 'Document uploaded', document.id, document.name, actor ?? document.clientId ?? 'Demo staff'),
  })),
  updateDocument: (id, update, actor) => set((state) => {
    const current = state.documents.find((document) => document.id === id);
    if (!current || (update.status && !canTransitionDocumentStatus(current.status, update.status))) return state;
    const statusChanged = Boolean(update.status && update.status !== current.status);
    const nextStatus = update.status ?? current.status;
    const action = statusChanged ? `Status changed: ${current.status} → ${nextStatus}` : '';
    return {
      documents: state.documents.map((document) => document.id === id
        ? {
          ...document,
          ...update,
          ...(statusChanged ? { reviewHistory: [...(document.reviewHistory ?? []), { at: new Date().toISOString(), action, details: update.note ?? 'Workflow status updated.' }] } : {}),
        }
        : document),
      ...(statusChanged ? { auditEvents: recordAudit(state, action, id, update.note ?? 'Workflow status updated.', actor ?? current.clientId ?? 'Demo staff') } : {}),
    };
  }),
  updateFields: (id, key, value, actor = 'Demo reviewer') => set((state) => ({
    documents: state.documents.map((document) => document.id === id
      ? {
        ...document,
        fields: { ...document.fields, [key]: value },
        reviewHistory: [...(document.reviewHistory ?? []), {
          at: new Date().toISOString(),
          action: 'Field corrected',
          details: `${key} updated during staff review. Review feedback for future model improvement; no model training occurs in this demo.`,
        }],
      }
      : document),
    auditEvents: recordAudit(state, 'Field corrected', id, `${key} updated during document review.`, actor),
  })),
  recordReview: (id, action, details, update, actor = 'Demo reviewer') => set((state) => {
    const current = state.documents.find((document) => document.id === id);
    if (!current || (update.status && !canTransitionDocumentStatus(current.status, update.status))) return state;
    return {
      documents: state.documents.map((document) => document.id === id
        ? {
          ...document,
          ...update,
          reviewHistory: [...(document.reviewHistory ?? []), { at: new Date().toISOString(), action, details }],
        }
        : document),
      auditEvents: recordAudit(state, action, id, details, actor),
    };
  }),
  respondToRequest: (id, response) => set((state) => {
    const document = state.documents.find((item) => item.id === id);
    if (!document?.clientRequest) return state;
    const completedTasks = state.followUpTasks.filter((task) => task.documentId === id && task.status === 'open');
    const auditState = { ...state, auditEvents: recordAudit(state, 'Client response received', id, response, 'Demo client') };
    const auditEvents = completedTasks.reduce(
      (current, task) => recordAudit({ ...state, auditEvents: current }, 'Follow-up task completed', task.id, task.title, 'Demo client'),
      auditState.auditEvents,
    );
    return {
      documents: state.documents.map((document) => document.id === id && document.clientRequest
      ? {
        ...document,
        clientRequest: { ...document.clientRequest, response, resolvedAt: new Date().toISOString() },
        reviewHistory: [...(document.reviewHistory ?? []), {
          at: new Date().toISOString(),
          action: 'Client response',
          details: response,
        }],
      }
      : document),
    followUpTasks: state.followUpTasks.map((task) => task.documentId === id && task.status === 'open' ? { ...task, status: 'completed' } : task),
    auditEvents,
    };
  }),
  addAssistantQuestion: (question) => set((state) => ({
    assistantQuestions: [question, ...state.assistantQuestions],
    auditEvents: recordAudit(state, 'Client question added', question.id, question.question, question.clientId),
  })),
  replyToAssistantQuestion: (id, text, from) => set((state) => ({
    assistantQuestions: state.assistantQuestions.map((question) => question.id === id
      ? { ...question, replies: [...question.replies, { text, from, createdAt: new Date().toISOString() }] }
      : question),
    auditEvents: recordAudit(state, 'Client question answered', id, text, from),
  })),
  addFollowUpTask: (task, actor) => set((state) => ({
    followUpTasks: [{
      ...task,
      id: `task-${crypto.randomUUID()}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    }, ...state.followUpTasks],
    auditEvents: recordAudit(state, 'Follow-up task created', task.documentId ?? task.title, task.title, actor),
  })),
  toggleFollowUpTask: (id, actor) => set((state) => {
    const task = state.followUpTasks.find((item) => item.id === id);
    if (!task) return state;
    const status = task.status === 'open' ? 'completed' : 'open';
    return {
      followUpTasks: state.followUpTasks.map((item) => item.id === id ? { ...item, status } : item),
      auditEvents: recordAudit(state, status === 'completed' ? 'Follow-up task completed' : 'Follow-up task reopened', id, task.title, actor),
    };
  }),
  linkBankRecord: (statementId, transactionReference, accountingDocumentId, actor) => set((state) => {
    if (statementId === accountingDocumentId || state.bankLinks.some((link) => link.statementId === statementId && link.transactionReference === transactionReference && link.accountingDocumentId === accountingDocumentId)) return state;
    return {
      bankLinks: [...state.bankLinks, { statementId, transactionReference, accountingDocumentId, createdAt: new Date().toISOString() }],
      auditEvents: recordAudit(state, 'Bank transaction linked', `${statementId} · ${transactionReference}`, `Linked to accounting record ${accountingDocumentId}.`, actor),
    };
  }),
  unlinkBankRecord: (statementId, transactionReference, accountingDocumentId, actor) => set((state) => ({
    bankLinks: state.bankLinks.filter((link) => link.statementId !== statementId || link.transactionReference !== transactionReference || link.accountingDocumentId !== accountingDocumentId),
    auditEvents: recordAudit(state, 'Bank transaction unlinked', `${statementId} · ${transactionReference}`, `Unlinked accounting record ${accountingDocumentId}.`, actor),
  })),
  savePayrollDraft: (draft, actor) => set((state) => {
    const previous = state.payrollDrafts.find((item) => item.documentId === draft.documentId);
    if (previous?.status === 'approved') return state;
    const payrollDrafts = previous
      ? state.payrollDrafts.map((item) => item.documentId === draft.documentId ? { ...draft, updatedAt: new Date().toISOString() } : item)
      : [{ ...draft, updatedAt: new Date().toISOString() }, ...state.payrollDrafts];
    return {
      payrollDrafts,
      auditEvents: recordAudit(state, previous ? 'Payroll draft updated' : 'Payroll draft created', draft.documentId, `Payroll draft status: ${draft.status}.`, actor),
    };
  }),
  transitionPayrollDraft: (documentId, status, actor) => {
    let transitioned = false;
    set((state) => {
      const draft = state.payrollDrafts.find((item) => item.documentId === documentId);
      const allowed = draft && (
        (draft.status === 'draft' && status === 'validated' && draft.validationIssues.length === 0)
        || (draft.status === 'validated' && status === 'approved')
      );
      if (!draft || !allowed) return state;
      transitioned = true;
      return {
        payrollDrafts: state.payrollDrafts.map((item) => item.documentId === documentId ? { ...item, status, updatedAt: new Date().toISOString() } : item),
        auditEvents: recordAudit(state, `Payroll draft ${status}`, documentId, `Payroll draft moved from ${draft.status} to ${status}.`, actor),
      };
    });
    return transitioned;
  },
  setWorkspaceSetting: (key, value, actor) => set((state) => ({
    settings: { ...state.settings, [key]: value },
    auditEvents: recordAudit(state, 'Workspace setting changed', key, `${key} set to ${value ? 'enabled' : 'disabled'}.`, actor),
  })),
  setRoleAssignment: (id, role, actor) => set((state) => {
    const assignment = state.roleAssignments.find((item) => item.id === id);
    if (!assignment || assignment.role === role) return state;
    return {
      roleAssignments: state.roleAssignments.map((item) => item.id === id ? { ...item, role } : item),
      auditEvents: recordAudit(state, 'Demo role assignment changed', id, `${assignment.role} changed to ${role}.`, actor),
    };
  }),
  recordExport: (documentIds, actor) => set((state) => ({
    exports: [{ id: `export-${crypto.randomUUID()}`, at: new Date().toISOString(), actor, documentIds }, ...state.exports],
    auditEvents: recordAudit(state, 'CSV export downloaded', 'accounting-export', `${documentIds.length} records included.`, actor),
  })),
}));
