import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUp, BarChart3, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, FileSearch, FileText,
  FileUp, FolderOpen, Languages, ListChecks, LockKeyhole, LogOut, Menu, MessageSquareText, Mic, MoreHorizontal, Paperclip, Plus, Receipt,
  Upload, Wallet, X,
} from 'lucide-react';
import { Badge, Button, ProgressBar } from '@/components/ui/primitives';
import {
  categoryForFilename, DEMO_CATEGORIES, detectDocumentLanguage, emptyDemoFields,
  extractDocumentDetails, MAX_DEMO_FILE_BYTES, validateDemoFile,
  type DemoCategory, type DemoDocument,
} from './demoWorkflow';
import { useDemoDocumentsStore } from '@/stores/demoDocumentsStore';
import { DEMO_CLIENTS } from './demoAccounts';
import { clientProfileFor } from './clientDemoData';
import fintaxLogo from './image.png';
import { answerClientQuestion, type AssistantAction, type AssistantLanguage } from './clientAssistant';
import StatFlow from './StatFlow';

const MAX_PDF_PAGES = 200;
const PIPELINE = [
  ['received', 'Received'], ['validation', 'File validation'], ['classification', 'Classification'], ['extraction', 'Data extraction'],
  ['checks', 'Validation checks'], ['confidence', 'Confidence'], ['staff_review', 'Staff review'],
] as const;

const CATEGORY_GROUPS: { label: string; categories: DemoCategory[] }[] = [
  { label: 'Accounting', categories: ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'] },
  { label: 'Payroll', categories: ['payroll', 'timesheet', 'sick_note', 'employee_record'] },
  { label: 'Company records', categories: ['company_formation', 'commercial_register', 'contract'] },
  { label: 'Correspondence', categories: ['correspondence', 'other_correspondence'] },
  { label: 'Identity', categories: ['identity_document'] },
  { label: 'Other', categories: ['other'] },
];

const categoryLabel = (category: DemoCategory) => DEMO_CATEGORIES.find(([key]) => key === category)?.[1] ?? category;
const t3 = (language: AssistantLanguage, en: string, de: string, ar: string) => language === 'de' ? de : language === 'ar' ? ar : en;
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const SPEECH_LANG: Record<AssistantLanguage, string> = { en: 'en-GB', de: 'de-DE', ar: 'ar-AE' };

interface ChatMessage {
  id: string; role: 'assistant' | 'client'; content: string; references?: string[]; actions?: AssistantAction[]; questionId?: string; questionText?: string;
}

function validationWarnings(document: DemoDocument): string[] {
  const warnings = [...(document.validationWarnings ?? [])];
  if (['purchase_invoice', 'sales_invoice', 'receipt'].includes(document.category)) {
    const fields = document.fields;
    if (!fields.documentDate) warnings.push('Document date needs manual confirmation.');
    if (!fields.counterparty) warnings.push('Supplier or customer needs manual confirmation.');
    if (!fields.reference) warnings.push('Invoice or receipt reference was not detected.');
    const amounts = [fields.netAmount, fields.vatAmount, fields.grossAmount].map(Number);
    if (!fields.netAmount || !fields.vatAmount || !fields.grossAmount || !amounts.every(Number.isFinite)) warnings.push('Net, VAT, and gross values need review.');
    else if (Math.abs(amounts[0] + amounts[1] - amounts[2]) > 0.01) warnings.push('Net plus VAT does not equal gross total.');
  }
  if (document.category === 'bank_statement') {
    const details = document.extractedDetails ?? {};
    if (!details['Opening balance']) warnings.push('Opening balance needs manual confirmation.');
    if (!details['Closing balance']) warnings.push('Closing balance needs manual confirmation.');
    warnings.push('Transaction matching and balance reconciliation are not performed in this demo.');
  }
  if ((document.pageCount ?? 0) > 1) warnings.push('Multi-page PDF: confirm pages are in order and the file does not combine unrelated documents.');
  if (['payroll', 'timesheet', 'sick_note', 'employee_record', 'identity_document'].includes(document.category)) warnings.push('Sensitive payroll or identity details require manual staff review.');
  if (!document.detectedLanguage?.startsWith('German') && !document.detectedLanguage?.startsWith('English')) warnings.push('Language or OCR support is limited; manual review is required.');
  return [...new Set(warnings)];
}

/** Number that counts up when it changes (static when the user prefers reduced motion). */
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{shown}</>;
}

function TypingDots() {
  return <span className="inline-flex items-center gap-1" aria-hidden>{[0, 1, 2].map((i) => (
    <motion.span key={i} className="size-1.5 rounded-full bg-violet" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
  ))}</span>;
}

export default function ClientUploadPage({ clientEmail, onSignOut }: { clientEmail: string; onSignOut: () => void }) {
  const reduce = useReducedMotion();
  const allDocuments = useDemoDocumentsStore((state) => state.documents);
  const addDocument = useDemoDocumentsStore((state) => state.addDocument);
  const updateDocument = useDemoDocumentsStore((state) => state.updateDocument);
  const respondToRequest = useDemoDocumentsStore((state) => state.respondToRequest);
  const addAssistantQuestion = useDemoDocumentsStore((state) => state.addAssistantQuestion);
  const assistantQuestions = useDemoDocumentsStore((state) => state.assistantQuestions);
  const [activeClientEmail, setActiveClientEmail] = useState(clientEmail);
  const activeClient = clientProfileFor(activeClientEmail);
  const documents = allDocuments.filter((item) => item.clientId === activeClientEmail);
  const clientQuestions = assistantQuestions.filter((question) => question.clientId === activeClientEmail);
  const [lang, setLang] = useState<AssistantLanguage>('en');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeBottomSection, setActiveBottomSection] = useState('client-overview');
  const [category, setCategory] = useState<DemoCategory>('other');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'processing' | 'attention' | 'approved'>('all');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const recognition = useRef<any>(null);
  const replacementFor = useRef<string | undefined>();

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !categoryMenuRef.current?.contains(event.target)) {
        setCategoryMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoryMenuOpen(false);
        categoryTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [navigationOpen]);

  const ATTENTION = ['needs_information', 'rejected', 'action_required', 'password_required'];
  const processing = documents.filter((d) => d.status === 'processing' || d.status === 'review');
  const attention = documents.filter((d) => ATTENTION.includes(d.status));
  const approved = documents.filter((d) => d.status === 'approved');
  const activity = documents.filter((d) => ['approved', ...ATTENTION].includes(d.status));
  const visibleDocs = documents.filter((document) => {
    if (filter === 'all') return true;
    if (filter === 'processing') return document.status === 'processing' || document.status === 'review';
    if (filter === 'attention') return ATTENTION.includes(document.status);
    return document.status === 'approved';
  });
  const started = messages.some((m) => m.role === 'client');
  const hour = new Date().getHours();
  const greeting = t3(lang, hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening', hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend', hour < 12 ? 'صباح الخير' : 'مساء الخير');
  const pageSections = [
    { id: 'client-assistant', label: 'AI assistant', icon: MessageSquareText },
    { id: 'client-overview', label: 'Overview', icon: BarChart3 },
    { id: 'client-demo-tasks', label: 'Tasks', icon: ListChecks },
    ...(activity.length ? [{ id: 'client-advisor-updates', label: 'Advisor updates', icon: CalendarClock }] : []),
    { id: 'client-upload', label: 'Upload documents', icon: Upload },
    { id: 'client-documents', label: 'Document history', icon: FolderOpen },
  ];

  const goToPageSection = (sectionId: string) => {
    setActiveBottomSection(sectionId);
    const container = pageScrollRef.current;
    const target = document.getElementById(sectionId);
    if (container && target) {
      const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
      container.scrollTo({ top, behavior: 'auto' });
    }
    setNavigationOpen(false);
  };

  const suggestions = useMemo(() => [
    { icon: BarChart3, text: t3(lang, 'Financial summary this month', 'Finanzübersicht diesen Monat', 'الملخص المالي لهذا الشهر') },
    { icon: Receipt, text: t3(lang, 'Which invoices are unpaid?', 'Welche Rechnungen sind unbezahlt?', 'ما الفواتير غير المدفوعة؟') },
    { icon: FileSearch, text: t3(lang, 'What documents are missing?', 'Welche Unterlagen fehlen?', 'ما المستندات الناقصة؟') },
    { icon: Wallet, text: t3(lang, 'Show September payroll', 'Gehaltsübersicht September', 'اعرض رواتب سبتمبر') },
  ], [lang]);

  useEffect(() => {
    const history: ChatMessage[] = [];
    for (const q of [...clientQuestions].reverse()) {
      history.push({ id: `cq-${q.id}`, role: 'client', content: q.question }, { id: `aa-${q.id}`, role: 'assistant', content: q.answer, references: q.references, questionId: q.id, questionText: q.question });
    }
    setMessages(history);
    setDraft('');
  }, [activeClientEmail]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); }, [messages, isTyping, clientQuestions, reduce]);

  const sendQuestion = (raw = draft) => {
    const question = raw.trim();
    if (!question || isTyping) return;
    setMessages((c) => [...c, { id: crypto.randomUUID(), role: 'client', content: question }]);
    setDraft('');
    setIsTyping(true);
    const response = answerClientQuestion(question, lang, activeClient, documents, activeClient.tasks);
    window.setTimeout(() => {
      setMessages((c) => [...c, { id: crypto.randomUUID(), role: 'assistant', content: response.answer, questionText: question, references: response.references, actions: response.actions }]);
      setIsTyping(false);
    }, 700);
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setNotice(t3(lang, 'Voice input is not supported in this browser.', 'Spracheingabe wird in diesem Browser nicht unterstützt.', 'الإدخال الصوتي غير مدعوم في هذا المتصفح.')); return; }
    if (listening) { recognition.current?.stop(); return; }
    const r = new SR();
    r.lang = SPEECH_LANG[lang]; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => setDraft(Array.from(e.results as ArrayLike<any>).map((x) => x[0].transcript).join(' '));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r; setListening(true); r.start();
  };

  const handleAssistantAction = (message: ChatMessage, a: AssistantAction) => {
    if (a.type === 'view_document') {
      setExpandedId(a.documentId); setFilter('all');
      window.setTimeout(() => document.getElementById(`client-demo-document-${a.documentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    } else if (a.type === 'upload') fileInput.current?.click();
    else if (a.type === 'view_tasks') {
      setTasksExpanded(true);
      window.setTimeout(() => document.getElementById('client-demo-tasks')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    } else if (a.type === 'ask_accountant' && !message.questionId) {
      const id = crypto.randomUUID();
      addAssistantQuestion({ id, clientId: activeClientEmail, question: message.questionText ?? 'Please clarify my account records.', answer: message.content, references: message.references ?? [], createdAt: new Date().toISOString(), replies: [] });
      setMessages((c) => c.map((m) => m.id === message.id ? { ...m, questionId: id } : m));
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    setUploadError(''); setNotice('');
    const accepted: DemoDocument[] = [];
    const rejected: string[] = [];
    const targetReplacement = replacementFor.current;
    for (const file of Array.from(files)) {
      const issue = validateDemoFile(file);
      if (issue) { rejected.push(`${file.name}: ${issue}`); continue; }
      const id = `CLIENT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const selectedCategory = category === 'other' ? categoryForFilename(file.name) : category;
      const doc: DemoDocument = {
        id, name: file.name, category: selectedCategory, sizeBytes: file.size, createdAt: new Date().toISOString(), status: 'processing', confidence: 0,
        fields: emptyDemoFields(), sample: false, clientId: activeClientEmail, currency: activeClient.currency, workflowStage: 'received', detectedLanguage: 'Detecting locally',
        validationWarnings: [], reviewHistory: [{ at: new Date().toISOString(), action: 'Received', details: 'Added in the browser-only demo session.' }],
        file, processingProgress: 0, note: 'Demo metadata and file are held in browser memory only.', replacementFor: targetReplacement,
      };
      if (targetReplacement) {
        const previous = useDemoDocumentsStore.getState().documents.find((e) => e.id === targetReplacement);
        if (previous?.clientRequest) {
          useDemoDocumentsStore.getState().recordReview(targetReplacement, 'Replacement uploaded', `Client uploaded ${file.name} as a replacement.`,
            { clientRequest: { ...previous.clientRequest, response: `Replacement uploaded: ${file.name}`, resolvedAt: new Date().toISOString() } });
        }
      }
      addDocument(doc); accepted.push(doc);
    }
    replacementFor.current = undefined;
    for (const doc of accepted) {
      const stage = (workflowStage: NonNullable<DemoDocument['workflowStage']>, note: string, processingProgress: number) => updateDocument(doc.id, { workflowStage, note, processingProgress });
      try {
        stage('validation', 'Checking file type, size and readability.', 12);
        await new Promise((r) => window.setTimeout(r, 320));
        stage('classification', 'Suggesting a document category from the filename and local PDF text.', 26);
        await new Promise((r) => window.setTimeout(r, 320));
        stage('extraction', 'Reading selectable PDF text locally; image OCR is not configured.', 38);
        const { processLocalDocument } = await import('./processDocument');
        const extraction = await processLocalDocument(doc.file!, (p) => updateDocument(doc.id, { processingProgress: Math.min(82, 38 + Math.round(p * 0.44)) }));
        const detectedCategory = doc.category === 'other' ? categoryForFilename(doc.name, extraction.text) : doc.category;
        const detectedLanguage = detectDocumentLanguage(extraction.text);
        const extracted: DemoDocument = { ...doc, category: detectedCategory, fields: extraction.fields, extractedDetails: extractDocumentDetails(detectedCategory, extraction.text), extractedText: extraction.text, confidence: extraction.confidence, pageCount: extraction.pageCount ?? undefined, detectedLanguage, note: extraction.note };
        stage('checks', 'Running simple field-presence and amount checks. These are not accounting controls.', 88);
        const warnings = validationWarnings(extracted);
        await new Promise((r) => window.setTimeout(r, 320));
        stage('confidence', 'Confidence is a rule-based text-match estimate, not an AI score.', 95);
        updateDocument(doc.id, { category: detectedCategory, fields: extraction.fields, extractedDetails: extracted.extractedDetails, extractedText: extraction.text, confidence: extraction.confidence, pageCount: extraction.pageCount ?? undefined, detectedLanguage, validationWarnings: warnings, workflowStage: 'staff_review', status: 'review', processingProgress: 100, note: extraction.note });
      } catch (error) {
        const passwordRequired = error instanceof Error && 'code' in error && (error as any).code === 'password_required';
        const message = error instanceof Error ? error.message : 'The file could not be read.';
        const reason = passwordRequired ? 'This PDF is password-protected. Please upload an unlocked copy; password entry is not supported in this demo.' : 'The file could not be read in this demo. Please upload a clearer copy or provide more information.';
        updateDocument(doc.id, { status: passwordRequired ? 'password_required' : 'action_required', workflowStage: 'staff_review', validationWarnings: [reason], clientRequest: { reason, createdAt: new Date().toISOString() }, note: message });
      }
    }
    if (accepted.length) { setExpandedId(accepted[0].id); setFilter('all'); setNotice(`${accepted.length} file${accepted.length === 1 ? '' : 's'} added to the shared browser demo review queue.`); }
    if (rejected.length) setUploadError(rejected.join(' '));
  };

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) void processFiles(e.target.files); e.target.value = ''; };
  const handleDrop = (e: DragEvent<HTMLElement>) => { e.preventDefault(); setDragOver(false); void processFiles(e.dataTransfer.files); };
  const selectReplacement = (d: DemoDocument) => { replacementFor.current = d.id; setCategory(d.category); fileInput.current?.click(); };

  const rise = (i = 0) => reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] as const } };
  const statCards = [
    {
      key: 'all',
      label: t3(lang, 'Documents', 'Dokumente', 'المستندات'),
      compactLabel: t3(lang, 'Files', 'Belege', 'ملفات'),
      hint: t3(lang, 'Fictional records for this company', 'Fiktive Belege für dieses Unternehmen', 'سجلات خيالية لهذه الشركة'),
      value: documents.length,
      icon: FolderOpen,
      from: '#7c3aed',
      to: '#3b82f6',
    },
    {
      key: 'processing',
      label: t3(lang, 'In review', 'In Prüfung', 'قيد المراجعة'),
      compactLabel: t3(lang, 'Review', 'Prüfung', 'مراجعة'),
      hint: t3(lang, 'Processing or waiting for staff review', 'In Bearbeitung oder Teamprüfung', 'قيد المعالجة أو انتظار مراجعة الفريق'),
      value: processing.length,
      icon: FileSearch,
      from: '#3b82f6',
      to: '#06b6d4',
    },
    {
      key: 'attention',
      label: t3(lang, 'Needs you', 'Ihre Aktion', 'يحتاج إجراءك'),
      compactLabel: t3(lang, 'Action', 'Aktion', 'إجراء'),
      hint: t3(lang, 'Requests or issues need a response', 'Anfragen oder Probleme benötigen eine Antwort', 'تحتاج الطلبات أو المشكلات إلى رد'),
      value: attention.length,
      icon: CircleAlert,
      from: '#d97706',
      to: '#db2777',
    },
    {
      key: 'approved',
      label: t3(lang, 'Approved', 'Freigegeben', 'معتمد'),
      compactLabel: t3(lang, 'Done', 'Fertig', 'معتمد'),
      hint: t3(lang, 'Reviewed and approved demo records', 'Geprüfte und freigegebene Demobelege', 'سجلات تجريبية تمت مراجعتها واعتمادها'),
      value: approved.length,
      icon: CheckCircle2,
      from: '#059669',
      to: '#06b6d4',
    },
  ] as const;

  return (
    <div ref={pageScrollRef} data-theme="light" className="relative h-screen overflow-x-hidden overflow-y-auto bg-[#f6f5ff] text-ink" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* animated pastel backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,#ece8ff_0%,#f6f5ff_55%,#f3f8ff_100%)]" />
        {[{ c: 'bg-violet/25', s: 'size-[34rem] -left-40 top-10', x: 40, y: 30 }, { c: 'bg-blue/20', s: 'size-[30rem] -right-32 top-48', x: -50, y: 40 }, { c: 'bg-magenta/15', s: 'size-[26rem] left-1/3 bottom-0', x: 30, y: -40 }].map((b, i) => (
          <motion.div key={i} className={`absolute rounded-full blur-3xl ${b.c} ${b.s}`} animate={reduce ? undefined : { x: [0, b.x, 0], y: [0, b.y, 0], scale: [1, 1.08, 1] }} transition={{ duration: 16 + i * 4, repeat: Infinity, ease: 'easeInOut' }} />
        ))}
      </div>

      <header className="client-topbar sticky top-0 z-30 border-0 bg-transparent px-2 pt-2 sm:px-4">
        <div className="client-topbar-card mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 rounded-[1.35rem] border border-white/90 bg-white/90 px-3 py-2.5 shadow-[0_18px_45px_-34px_rgba(30,41,59,.4)] backdrop-blur-xl sm:gap-3 sm:px-5 sm:py-3">
          <button type="button" aria-label="Open page navigation" aria-controls="client-page-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white bg-white/80 text-muted shadow-sm transition-colors hover:text-violet focus-visible:outline-violet">
            <Menu className="size-4" />
          </button>
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white bg-white shadow-sm"><img src={fintaxLogo} alt="FinTax logo" className="size-full object-contain p-0.5" /></span>
          <div className="client-topbar-brand min-w-0 flex-1"><p className="truncate font-semibold leading-tight">FinTax <span className="font-normal text-muted">Consulting</span></p><p className="max-w-36 truncate text-xs text-muted">{activeClient.name}</p></div>
          <Badge tone="warn" className="hidden lg:inline-flex">WEBSITE DEMO</Badge>
          <nav aria-label="Quick client navigation" className="hidden items-center gap-0.5 rounded-full bg-slate-100/80 p-1 xl:flex">
            {pageSections.filter(({ id }) => ['client-overview', 'client-upload', 'client-documents', 'client-demo-tasks'].includes(id)).map(({ id, label }) => (
              <button key={id} type="button" onClick={() => goToPageSection(id)} className="rounded-full px-2.5 py-1.5 text-[10px] font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900">{id === 'client-upload' ? 'Upload' : id === 'client-documents' ? 'Documents' : label}</button>
            ))}
          </nav>
          <div className="flex w-full min-w-0 items-center gap-1.5 sm:ms-auto sm:w-auto sm:gap-2">
            <label className="flex min-w-0 flex-1 items-center text-[10px] text-muted sm:flex-none sm:gap-1.5 sm:text-xs"><span className="hidden sm:inline">Demo client</span>
              <select value={activeClientEmail} onChange={(e) => setActiveClientEmail(e.target.value)} aria-label="Select fictional client data" className="h-9 w-full min-w-0 rounded-full border border-white bg-white/80 px-2.5 text-[11px] text-ink shadow-sm sm:w-auto sm:max-w-40 sm:px-3 sm:text-xs lg:max-w-52">
                {DEMO_CLIENTS.map((c) => <option key={c.email} value={c.email}>{c.company}</option>)}
              </select>
            </label>
            <label className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-white bg-white/80 px-2 shadow-sm sm:gap-1.5 sm:px-2.5"><Languages className="size-4 text-violet" /><span className="sr-only">Language</span>
              <select value={lang} onChange={(e) => setLang(e.target.value as AssistantLanguage)} aria-label="Assistant language" className="h-9 max-w-[5.25rem] bg-transparent text-xs text-ink sm:max-w-[4.75rem] lg:max-w-none"><option value="en">English</option><option value="de">Deutsch</option><option value="ar">العربية</option></select></label>
            <Button size="sm" aria-label="Log out" title="Log out" className="size-9 shrink-0 rounded-xl bg-white/80 p-0 sm:size-auto sm:rounded-full sm:px-3" onClick={onSignOut} icon={<LogOut className="size-3.5" />}><span className="sr-only sm:not-sr-only">Logout</span></Button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {navigationOpen && <>
          <motion.button type="button" aria-label="Close page navigation" onClick={() => setNavigationOpen(false)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 cursor-default bg-slate-950/25 backdrop-blur-[2px]" />
          <motion.aside id="client-page-navigation" aria-label="Client page navigation"
            initial={reduce ? false : { x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="fixed inset-y-0 start-0 z-50 flex w-[min(21rem,88vw)] flex-col border-e border-ink/10 bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-ink/5 pb-5">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white bg-white shadow-sm"><img src={fintaxLogo} alt="FinTax logo" className="size-full object-contain p-0.5" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Client workspace</p><p className="truncate text-xs text-muted">{activeClient.company}</p></div>
              <button type="button" aria-label="Close page navigation" onClick={() => setNavigationOpen(false)}
                className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"><X className="size-4" /></button>
            </div>
            <div className="my-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-violet/5 p-3"><p className="text-lg font-semibold">{documents.length}</p><p className="text-[10px] text-muted">Documents</p></div>
              <div className="rounded-xl bg-warn/5 p-3"><p className="text-lg font-semibold">{attention.length}</p><p className="text-[10px] text-muted">Need attention</p></div>
            </div>
            <nav aria-label="Client workspace sections" className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">This page</p>
              {pageSections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => goToPageSection(id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm text-ink transition-colors hover:bg-violet/8 hover:text-violet focus-visible:outline-violet">
                <Icon className="size-4 shrink-0 text-violet" /><span>{label}</span>
                {id === 'client-documents' && <span className="ms-auto text-xs text-muted">{documents.length}</span>}
                {id === 'client-demo-tasks' && <span className="ms-auto text-xs text-muted">{activeClient.tasks.filter((task) => !task.complete).length}</span>}
              </button>)}
            </nav>
            <div className="mt-auto rounded-xl border border-violet/10 bg-gradient-to-br from-violet/5 to-blue/5 p-3.5">
              <p className="text-xs font-semibold">About this workspace</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">A browser-only FinTax demo using fictional client records. Uploaded files stay in this active session and are not sent to a server.</p>
            </div>
          </motion.aside>
        </>}
      </AnimatePresence>

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-3 pb-12 pt-4 sm:space-y-8 sm:px-6 sm:pb-16 sm:pt-6">
        {/* HERO + ASSISTANT */}
        <motion.section id="client-assistant" layout {...rise(0)} className="relative scroll-mt-24 overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-white/80 via-[#f1eeff]/80 to-[#eaf2ff]/80 p-4 shadow-[0_30px_80px_-40px_rgba(110,80,220,.45)] backdrop-blur-xl sm:rounded-[2rem] sm:p-9">
          <AnimatePresence initial={false}>
            {!started && (
              <motion.div key="hero" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
                <motion.div className="mb-5 hidden items-center gap-3 sm:flex" {...rise(1)}>
                  <motion.span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet to-blue text-white shadow-lg shadow-violet/30" animate={reduce ? undefined : { rotate: [0, 6, -6, 0] }} transition={{ duration: 6, repeat: Infinity }}><MessageSquareText className="size-6" /></motion.span>
                  <div><p className="text-sm font-semibold">FinTax Assistant</p><p className="text-xs text-muted">{t3(lang, 'Your accounting copilot', 'Ihr Buchhaltungs-Copilot', 'مساعدك المحاسبي')}</p></div>
                  <Badge tone="violet" className="ms-auto"><MessageSquareText className="size-3" />{activeClient.company}</Badge>
                </motion.div>
                <motion.p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted sm:text-[11px] sm:tracking-[.2em]" {...rise(2)}>{t3(lang, 'Turn paperwork into progress', 'Aus Papierkram wird Fortschritt', 'حوّل الأوراق إلى تقدّم')}</motion.p>
                <motion.h1 className="mt-2 text-[clamp(1.85rem,8.5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight sm:text-6xl" {...rise(3)}>
                  <span className="block text-ink">{greeting}.</span>
                  {t3(lang, 'How can I help you ', 'Wie kann ich Ihnen ', 'كيف يمكنني مساعدتك ')}<span className="bg-gradient-to-r from-violet via-blue to-magenta bg-clip-text text-transparent">{t3(lang, 'today?', 'heute helfen?', 'اليوم؟')}</span>
                </motion.h1>
                <div className="mt-5 grid gap-2.5 sm:mt-7 sm:grid-cols-2 sm:gap-3">
                  {suggestions.map((s, i) => (
                    <motion.button key={s.text} type="button" disabled={isTyping} onClick={() => sendQuestion(s.text)} {...rise(4 + i)} whileHover={reduce ? undefined : { y: -4, scale: 1.015 }} whileTap={{ scale: 0.98 }}
                      className="group flex min-h-[68px] min-w-0 items-center gap-3 rounded-2xl border border-white/90 bg-white/75 px-3.5 py-3 text-start shadow-[0_4px_14px_-10px_rgba(55,45,100,.35)] backdrop-blur transition-[box-shadow,transform,background-color] hover:bg-white hover:shadow-lg hover:shadow-violet/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet active:bg-violet/5 sm:min-h-[76px] sm:gap-3 sm:px-4 sm:py-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet transition-colors group-hover:bg-violet group-hover:text-white sm:size-10"><s.icon className="size-[18px]" /></span>
                      <span className="min-w-0 text-[13px] font-medium leading-5 text-ink sm:text-sm">{s.text}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {started && (
            <div className="mb-3 flex min-w-0 items-center gap-2.5 sm:mb-4 sm:gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-blue text-white"><MessageSquareText className="size-4" /></span>
              <div className="min-w-0"><p className="text-sm font-semibold">FinTax Assistant</p><p className="truncate text-[11px] text-muted">{t3(lang, `Answering from ${activeClient.company}'s demo records`, `Antworten aus den Demodaten von ${activeClient.company}`, `الإجابة من سجلات ${activeClient.company} التجريبية`)}</p></div></div>
          )}

          {started && (
            <div className="max-h-[min(55vh,440px)] space-y-3 overflow-y-auto overscroll-contain pe-1 sm:space-y-4" aria-live="polite" aria-label="Assistant conversation">
              <AnimatePresence initial={false}>
                {messages.map((m) => {
                  const linked = m.questionId ? clientQuestions.find((q) => q.id === m.questionId) : undefined;
                  return (
                    <motion.div key={m.id} initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35 }} className={`flex ${m.role === 'client' ? 'justify-end' : 'justify-start'}`}>
                      <div dir="auto" className={`max-w-[92%] min-w-0 rounded-3xl px-3.5 py-3 text-sm leading-6 [overflow-wrap:anywhere] sm:max-w-[80%] sm:px-5 sm:py-3.5 ${m.role === 'client' ? 'bg-gradient-to-br from-violet to-blue text-white shadow-lg shadow-violet/25' : 'border border-white bg-white/90 shadow-sm'}`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {m.references?.length ? <div className="mt-3 border-t border-ink/10 pt-2"><p className="text-[10px] font-medium text-muted">{t3(lang, 'Based on these records', 'Verwendete Belege', 'استناداً إلى هذه السجلات')}</p><ul className="mt-1 space-y-1">{m.references.map((src) => {
                          const d = documents.find((x) => x.id === src.split(' · ')[0]);
                          return <li key={src}><button type="button" disabled={!d} onClick={() => d && handleAssistantAction(m, { type: 'view_document', documentId: d.id, label: 'View document' })} className="text-start text-[11px] text-violet hover:underline disabled:cursor-default">{d ? `${d.id} · ${d.name}` : src}</button></li>;
                        })}</ul></div> : null}
                        {m.actions?.length ? <div className="mt-3 flex flex-wrap gap-2">{m.actions.map((a) => <Button key={`${m.id}-${a.type}-${a.label}`} size="sm" className="rounded-full" onClick={() => handleAssistantAction(m, a)} disabled={a.type === 'ask_accountant' && Boolean(m.questionId)}>{a.type === 'ask_accountant' && m.questionId ? t3(lang, 'Sent to accountant', 'An Buchhaltung gesendet', 'أُرسل إلى المحاسب') : a.label}</Button>)}</div> : null}
                        {linked && <div className="mt-3 space-y-2 border-t border-ink/10 pt-2 text-xs"><p className="font-medium text-violet">{t3(lang, 'Shared with your accountant · demo correspondence', 'Mit Ihrer Buchhaltung geteilt · Demo-Korrespondenz', 'تمت مشاركته مع محاسبك · مراسلة تجريبية')}</p>
                          {linked.replies.map((r, i) => <p key={`${r.createdAt}-${i}`} className="rounded-xl bg-ok/10 p-2"><span className="font-medium text-ok">{r.from} replied:</span> {r.text}</p>)}
                          {!linked.replies.length && <p className="text-muted">{t3(lang, 'Waiting for a staff reply.', 'Warten auf eine Antwort des Teams.', 'بانتظار رد الموظف.')}</p>}</div>}
                      </div>
                    </motion.div>
                  );
                })}
                {isTyping && <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex"><div role="status" className="flex items-center gap-2 rounded-3xl border border-white bg-white/90 px-5 py-3 text-sm text-muted shadow-sm"><TypingDots />{t3(lang, 'Checking your records', 'Unterlagen werden geprüft', 'جارٍ فحص السجلات')}</div></motion.div>}
              </AnimatePresence>
              <div ref={chatEnd} />
            </div>
          )}

          {/* composer */}
          <form onSubmit={(e) => { e.preventDefault(); sendQuestion(); }} className={`${started ? 'mt-3 sm:mt-4' : 'mt-6 sm:mt-7'} flex min-w-0 items-end gap-1 rounded-[1.5rem] border bg-white/95 p-1.5 shadow-[0_12px_32px_-18px_rgba(110,80,220,.42)] transition-shadow focus-within:shadow-[0_16px_50px_-14px_rgba(110,80,220,.55)] sm:gap-2 sm:rounded-[1.75rem] sm:p-2 ${listening ? 'border-magenta ring-4 ring-magenta/15' : 'border-white'}`}>
            <button type="button" onClick={() => fileInput.current?.click()} aria-label={t3(lang, 'Attach a document', 'Dokument anhängen', 'إرفاق مستند')} title={t3(lang, 'Attach a document', 'Dokument anhängen', 'إرفاق مستند')} className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-violet/10 hover:text-violet"><Plus className="size-5" /></button>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); } }} rows={1}
              placeholder={listening ? t3(lang, 'Listening…', 'Ich höre zu…', 'أستمع…') : t3(lang, 'Ask FinTax…', 'FinTax fragen …', 'اسأل FinTax…')} aria-label="Ask the FinTax demo assistant" className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-3 text-sm outline-none placeholder:text-faint" />
            <motion.button type="button" onClick={toggleMic} whileTap={{ scale: 0.9 }} aria-pressed={listening} aria-label={t3(lang, 'Voice input', 'Spracheingabe', 'إدخال صوتي')} className={`relative grid size-11 shrink-0 place-items-center rounded-full transition-colors ${listening ? 'bg-magenta text-white' : 'text-muted hover:bg-violet/10 hover:text-violet'}`}>
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-magenta/40" aria-hidden />}<Mic className="relative size-5" />
            </motion.button>
            <motion.button type="submit" disabled={!draft.trim() || isTyping} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }} aria-label={t3(lang, 'Ask', 'Fragen', 'إرسال')} className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet to-blue text-white shadow-lg shadow-violet/30 disabled:opacity-40 disabled:shadow-none"><ArrowUp className="size-5" /></motion.button>
          </form>
          <p className="mx-auto mt-2.5 max-w-prose text-center text-[10px] leading-4 text-muted">{t3(lang, 'Deterministic demo answers from fictional records. No AI model is connected.', 'Regelbasierte Demo-Antworten aus fiktiven Daten. Kein KI-Modell verbunden.', 'إجابات تجريبية محددة القواعد من بيانات خيالية. لا يوجد نموذج ذكاء اصطناعي متصل.')}</p>
          {notice && <p role="status" className="mt-2 text-center text-xs text-violet">{notice}</p>}
          <input ref={fileInput} id="client-document-upload" type="file" multiple className="sr-only" aria-label="Choose files to upload" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff,.bmp,application/pdf,image/*" onChange={handleFiles} />
        </motion.section>

        {/* STATS */}
        <section id="client-overview" aria-label="Overview" className="scroll-mt-24">
          <StatFlow
            items={statCards.map((item) => ({
              ...item,
              value: <CountUp value={item.value} />,
            }))}
            activeKey={filter}
            onSelect={(key) => {
              if (key === 'all' || key === 'processing' || key === 'attention' || key === 'approved') setFilter(key);
              const container = pageScrollRef.current;
              const target = document.getElementById('client-documents');
              if (container && target) {
                const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
                container.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
              }
            }}
          />
        </section>

        {/* NEXT STEPS */}
        <section className="grid scroll-mt-24 gap-4 lg:grid-cols-3" aria-label="Next steps">
          <motion.div {...rise(1)} className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
            <p className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="size-4 text-warn" />{t3(lang, 'Missing documents', 'Fehlende Unterlagen', 'مستندات ناقصة')}</p>
            <ul className="mt-3 space-y-2">{activeClient.missingDocuments.length ? activeClient.missingDocuments.map((m) => <li key={m} className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs"><span className="size-1.5 rounded-full bg-warn" />{m}</li>) : <li className="text-xs text-muted">{t3(lang, 'Nothing missing — great!', 'Nichts fehlt — super!', 'لا شيء ناقص — ممتاز!')}</li>}</ul>
            <Button size="sm" variant="primary" className="mt-4 rounded-full" icon={<Upload className="size-3.5" />} onClick={() => fileInput.current?.click()}>{t3(lang, 'Upload now', 'Jetzt hochladen', 'ارفع الآن')}</Button>
          </motion.div>
          <motion.div {...rise(2)} className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5 lg:col-span-2" id="client-demo-tasks">
            <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="size-4 text-violet" />{t3(lang, 'Your tasks', 'Ihre Aufgaben', 'مهامك')}</p>
              <button type="button" onClick={() => setTasksExpanded((v) => !v)} aria-expanded={tasksExpanded} className="flex items-center gap-1 text-xs text-violet">{tasksExpanded ? t3(lang, 'Less', 'Weniger', 'أقل') : t3(lang, 'All', 'Alle', 'الكل')}<ChevronDown className={`size-3.5 transition-transform ${tasksExpanded ? 'rotate-180' : ''}`} /></button></div>
            <ul className="mt-3 space-y-2">{activeClient.tasks.slice(0, tasksExpanded ? undefined : 2).map((task, i) => (
              <motion.li key={task.id} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex flex-wrap items-center gap-3 rounded-xl bg-bg/60 px-3 py-2.5 text-xs">
                <CalendarClock className="size-4 text-violet" /><span className="min-w-40 flex-1 font-medium">{task.title}</span><span className="text-muted">{task.dueDate} · {task.owner}</span><Badge tone={task.complete ? 'ok' : 'warn'}>{task.complete ? 'Complete' : 'Open'}</Badge></motion.li>
            ))}</ul>
          </motion.div>
        </section>

        {/* ADVISOR UPDATES */}
        <AnimatePresence>
          {activity.length > 0 && (
            <motion.section id="client-advisor-updates" key="updates" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="scroll-mt-24 overflow-hidden rounded-3xl border border-white bg-white/80 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 border-b border-ink/5 px-3 py-4 sm:px-5"><MessageSquareText className="size-4 shrink-0 text-violet" /><div className="min-w-0"><h2 className="font-semibold">{t3(lang, 'Advisor updates', 'Neuigkeiten Ihrer Beratung', 'تحديثات المستشار')}</h2><p className="text-xs text-muted">Demo notifications for this client account only</p></div></div>
              <ul className="divide-y divide-ink/5">{activity.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start gap-3 px-3 py-4 sm:px-5">
                  <span className={`mt-1 grid size-8 place-items-center rounded-lg ${item.status === 'approved' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{item.status === 'approved' ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span>
                  <div className="min-w-48 flex-1"><p className="text-sm font-medium">{item.status === 'approved' ? 'Document approved' : item.status === 'rejected' || item.status === 'password_required' ? 'Replacement requested' : item.status === 'needs_information' ? 'More information requested' : 'Action required'} · {item.name}</p>
                    <p className="mt-1 text-xs text-muted">{item.clientRequest?.reason ?? item.reviewHistory?.at(-1)?.details ?? item.note} · {new Date(item.clientRequest?.createdAt ?? item.reviewHistory?.at(-1)?.at ?? item.createdAt).toLocaleString()}</p>
                    {item.clientRequest && !item.clientRequest.resolvedAt && <div className="mt-3 flex flex-wrap gap-2">
                      <input value={responses[item.id] ?? ''} onChange={(e) => setResponses((c) => ({ ...c, [item.id]: e.target.value }))} placeholder="Write a response for your advisor" aria-label={`Response for ${item.name}`} className="h-9 min-w-52 flex-1 rounded-full border border-ink/10 bg-white px-4 text-xs" />
                      <Button size="sm" className="rounded-full" disabled={!responses[item.id]?.trim()} onClick={() => { respondToRequest(item.id, responses[item.id].trim()); setResponses((c) => ({ ...c, [item.id]: '' })); }}>Send response</Button>
                      <Button size="sm" className="rounded-full" onClick={() => selectReplacement(item)}>Upload replacement</Button></div>}
                    {item.clientRequest?.response && <p className="mt-2 text-xs text-violet">Your response: {item.clientRequest.response}</p>}
                  </div>
                  <Badge tone={item.status === 'approved' ? 'ok' : 'warn'}>{item.status === 'approved' ? 'Approved' : item.status.replace(/_/g, ' ')}</Badge>
                </li>))}</ul>
            </motion.section>
          )}
        </AnimatePresence>

        {/* UPLOAD */}
        <section id="client-upload" className="grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]" aria-label="Upload">
          <motion.div {...rise(1)} onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            className={`relative overflow-hidden rounded-3xl border-2 border-dashed p-4 text-center backdrop-blur transition-colors sm:p-9 ${dragOver ? 'border-violet bg-violet/10' : 'border-violet/30 bg-white/70'}`}>
            <motion.span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet to-blue text-white shadow-lg shadow-violet/30" animate={reduce ? undefined : { y: dragOver ? -8 : [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}><FileUp className="size-7" /></motion.span>
            <h2 className="mt-4 text-lg font-semibold">{t3(lang, 'Drop your documents here', 'Dokumente hier ablegen', 'أسقط مستنداتك هنا')}</h2>
            <p className="mt-1 text-sm text-muted">{t3(lang, 'or choose multiple files from your device', 'oder mehrere Dateien auswählen', 'أو اختر عدة ملفات من جهازك')}</p>
            <div className="mx-auto mt-4 max-w-sm text-start">
              <label id="client-document-category-label" className="text-xs font-medium">Document type (optional)</label>
              <div ref={categoryMenuRef} className="relative mt-1">
                <button ref={categoryTriggerRef} id="client-document-category" type="button" aria-labelledby="client-document-category-label"
                  aria-haspopup="listbox" aria-expanded={categoryMenuOpen} onClick={() => setCategoryMenuOpen((open) => !open)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setCategoryMenuOpen(true);
                    }
                  }}
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-ink/10 bg-white px-4 text-start text-sm shadow-sm transition-colors hover:border-violet/35 focus-visible:outline-violet">
                  <span>{categoryLabel(category)}</span>
                  <ChevronDown className={`size-4 text-muted transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {categoryMenuOpen && <motion.div role="listbox" aria-labelledby="client-document-category-label"
                    initial={reduce ? false : { opacity: 0, y: -4, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.99 }}
                    transition={{ duration: 0.14 }} className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-ink/10 bg-white p-2 text-start shadow-[0_18px_48px_-18px_rgba(31,28,55,.35)]">
                    {CATEGORY_GROUPS.map((group) => <div key={group.label} className="py-1">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted">{group.label}</p>
                      {group.categories.map((item) => <button key={item} type="button" role="option" aria-selected={category === item}
                        onClick={() => { setCategory(item); setCategoryMenuOpen(false); categoryTriggerRef.current?.focus(); }}
                        className={`flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-sm transition-colors ${category === item ? 'bg-violet/10 font-medium text-violet' : 'text-ink hover:bg-violet/5'}`}>
                        <span>{categoryLabel(item)}</span>{category === item && <CheckCircle2 className="size-4" />}
                      </button>)}
                    </div>)}
                  </motion.div>}
                </AnimatePresence>
              </div>
              <p className="mt-1.5 text-[10px] text-muted">{category === 'other' ? 'We will suggest a type from the file name.' : `New files will be labeled ${categoryLabel(category)}.`}</p>
            </div>
            <Button className="mt-5 rounded-full px-6" variant="primary" icon={<Paperclip className="size-4" />} onClick={() => fileInput.current?.click()}>Choose files</Button>
            <p className="mt-4 text-[11px] leading-5 text-muted">PDF, phone photos, scans and screenshots · up to {MAX_DEMO_FILE_BYTES / 1024 / 1024} MB each · PDFs up to {MAX_PDF_PAGES} pages</p>
            {uploadError && <p role="alert" className="mt-3 text-xs text-bad">{uploadError}</p>}
          </motion.div>
          <motion.div {...rise(2)} className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
            <p className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-violet" />Processing in this demo</p>
            <ol className="mt-4 space-y-2.5 text-xs text-muted">{PIPELINE.map(([, label], i) => <motion.li key={label} initial={reduce ? false : { opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-violet/10 text-[10px] text-violet">{i + 1}</span>{label}</motion.li>)}</ol>
            <div className="mt-4 rounded-xl border border-warn/20 bg-warn/5 p-3 text-[11px] leading-5 text-muted">PDF selectable text is extracted locally with simple label matching. Image/Arabic OCR, advanced AI, password decryption, and server upload are not configured. Use fictional samples only.</div>
          </motion.div>
        </section>

        {/* DOCUMENTS */}
        <section id="client-documents" className="scroll-mt-24 overflow-hidden rounded-3xl border border-white bg-white/80 shadow-sm backdrop-blur" aria-label="Your documents">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 px-3 py-4 sm:px-5">
            <div><h2 className="font-semibold">{t3(lang, 'Your documents', 'Ihre Dokumente', 'مستنداتك')}</h2><p className="mt-1 text-xs text-muted">Files and metadata are held in memory for this browser demo only.</p></div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter documents">{(['all', 'processing', 'attention', 'approved'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${filter === f ? 'bg-violet text-white shadow-md shadow-violet/30' : 'bg-ink/5 text-muted hover:text-ink'}`}>{{ all: 'All', processing: 'In review', attention: 'Needs you', approved: 'Approved' }[f]}</button>))}</div>
          </div>
          {visibleDocs.length === 0
            ? <div className="px-5 py-14 text-center"><FileText className="mx-auto size-8 text-muted" /><p className="mt-3 text-sm font-medium">{documents.length ? 'No documents in this view' : 'No documents added yet'}</p><p className="mt-1 text-xs text-muted">Choose fictional sample files to preview the processing workflow.</p></div>
            : <ul key={filter} className="divide-y divide-ink/5"><AnimatePresence initial={false}>{visibleDocs.map((item) => {
              const active = expandedId === item.id;
              const stageIndex = Math.max(0, PIPELINE.findIndex(([s]) => s === item.workflowStage));
              return (
                <motion.li key={item.id} layout initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} id={`client-demo-document-${item.id}`} className="px-5 py-4">
                  <button type="button" aria-expanded={active} onClick={() => setExpandedId(active ? null : item.id)} className="flex w-full flex-wrap items-center gap-3 text-start">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet"><FileText className="size-4" /></span>
                    <span className="min-w-40 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="mt-0.5 block text-[11px] text-muted">{categoryLabel(item.category)} · {formatBytes(item.sizeBytes)}{item.pageCount ? ` · ${item.pageCount} pages` : ''}</span></span>
                    {item.status === 'processing' && <span className="w-28"><ProgressBar value={item.processingProgress ?? 0} active /></span>}
                    <Badge tone={item.status === 'approved' ? 'ok' : item.status === 'review' ? 'warn' : item.status === 'processing' ? 'cyan' : 'bad'}>{item.status === 'review' ? 'Staff review' : item.status === 'needs_information' ? 'Needs information' : item.status.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted num">{Math.round(item.confidence * 100)}%</span>
                    <ChevronDown className={`size-4 text-muted transition-transform ${active ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>{active && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                      <div className="mt-4 space-y-4 rounded-2xl border border-ink/5 bg-bg/50 p-4">
                        <div><div className="mb-2 flex items-center justify-between text-[11px]"><span className="font-medium">Workflow pipeline</span><span className="text-muted">{item.workflowStage?.replace(/_/g, ' ') ?? 'received'}</span></div><ProgressBar value={item.processingProgress ?? (item.status === 'approved' ? 100 : 95)} active={item.status === 'processing'} />
                          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{PIPELINE.map(([stage, label], index) => <li key={stage} className={`rounded-lg border px-2.5 py-2 text-[10px] ${index <= stageIndex ? 'border-violet/20 bg-violet/5 text-ink' : 'border-ink/5 text-muted'}`}><span className="me-1 text-violet">{index < stageIndex || item.status === 'approved' ? '✓' : index === stageIndex ? '•' : '○'}</span>{label}</li>)}</ol></div>
                        <div className="grid gap-3 text-xs sm:grid-cols-3"><p><span className="text-muted">Language:</span> {item.detectedLanguage ?? 'Not detected'}</p><p><span className="text-muted">Pages:</span> {item.pageCount ?? (item.name.toLowerCase().endsWith('.pdf') ? 'Checking / unknown' : 'Not applicable')}</p><p><span className="text-muted">Analysis:</span> local text rules only; no AI model used</p></div>
                        {Object.entries(item.fields).some(([, v]) => Boolean(v)) && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(item.fields).filter(([, v]) => Boolean(v)).map(([k, v]) => <p key={k} className="rounded-lg bg-white p-2 text-[11px] shadow-sm"><span className="block text-muted">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{v}</span></p>)}</div>}
                        {item.extractedDetails && Object.entries(item.extractedDetails).map(([k, v]) => <p key={k} className="whitespace-pre-line rounded-lg bg-white p-2 text-[11px] shadow-sm"><span className="font-medium text-muted">{k}: </span>{v}</p>)}
                        {item.validationWarnings?.length ? <div className="rounded-xl border border-warn/20 bg-warn/5 p-3 text-[11px]"><p className="font-semibold text-warn">Manual review / validation warnings</p><ul className="mt-1 list-inside list-disc text-muted">{item.validationWarnings.map((w) => <li key={w}>{w}</li>)}</ul></div> : null}
                        {item.note && <p className="text-[11px] text-muted">{item.note}</p>}
                        {item.reviewHistory?.length ? <details><summary className="cursor-pointer text-[11px] text-violet">Review history</summary><ul className="mt-2 space-y-1 text-[10px] text-muted">{item.reviewHistory.map((e, i) => <li key={`${e.at}-${i}`}>{new Date(e.at).toLocaleString()} · {e.action}: {e.details}</li>)}</ul></details> : null}
                      </div>
                    </motion.div>)}</AnimatePresence>
                </motion.li>);
            })}</AnimatePresence></ul>}
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-muted"><span><LockKeyhole className="me-1 inline size-3" />Demo files are not saved to a server</span><span>Use fictional sample documents only.</span></footer>
        <nav aria-label="Client page navigation" className="client-bottom-nav mx-auto w-full max-w-md md:hidden">
          <ul className="workspace-bottom-dock grid grid-cols-5">
            {[
              { id: 'client-overview', label: 'Overview', icon: BarChart3 },
              { id: 'client-documents', label: 'Documents', icon: FolderOpen },
              { id: 'more', label: 'More', icon: Plus },
              { id: 'client-upload', label: 'Upload', icon: Upload },
              { id: 'client-demo-tasks', label: 'Tasks', icon: ListChecks },
            ].map(({ id, label, icon: Icon }) => {
              const isMore = id === 'more';
              const active = activeBottomSection === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-label={isMore ? 'More client options' : `Go to ${label}`}
                    aria-current={!isMore && active ? 'location' : undefined}
                    onClick={() => isMore ? setNavigationOpen(true) : goToPageSection(id)}
                    className={`workspace-bottom-tab ${isMore ? 'workspace-bottom-tab--featured' : ''} ${active ? 'is-active' : ''}`}
                  >
                    <span className="workspace-bottom-icon"><Icon className={isMore ? 'size-6' : 'size-[19px]'} strokeWidth={isMore ? 2 : 1.9} /></span>
                    <span className="workspace-bottom-label">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </main>
    </div>
  );
}