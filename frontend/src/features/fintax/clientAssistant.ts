import type { DemoDocument } from './demoWorkflow';
import type { ClientDemoProfile, DemoTask } from './clientDemoData';

export type AssistantLanguage = 'en' | 'de' | 'ar';
export type AssistantAction = { type: 'view_document'; documentId: string; label: string }
  | { type: 'upload'; label: string }
  | { type: 'view_tasks'; label: string }
  | { type: 'ask_accountant'; label: string };

export interface AssistantAnswer {
  answer: string;
  references: string[];
  actions: AssistantAction[];
}

const text = (language: AssistantLanguage, en: string, de: string, ar: string) =>
  language === 'de' ? de : language === 'ar' ? ar : en;

const money = (value: number, currency: string, language: AssistantLanguage) =>
  new Intl.NumberFormat(language === 'de' ? 'de-DE' : language === 'ar' ? 'ar-AE' : 'en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const parseAmount = (value: string) => {
  const number = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const inCurrentPeriod = (document: DemoDocument, profile: ClientDemoProfile) => {
  const [monthName, year] = profile.period.split(' ');
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(monthName) + 1;
  const documentDate = document.fields.documentDate || document.createdAt;
  return month > 0 && documentDate.startsWith(`${year}-${String(month).padStart(2, '0')}`);
};

export function answerClientQuestion(
  question: string,
  language: AssistantLanguage,
  profile: ClientDemoProfile,
  documents: DemoDocument[],
  tasks: DemoTask[],
): AssistantAnswer {
  const normalized = question.toLowerCase();
  const sources: string[] = [];
  const actions: AssistantAction[] = [];
  const reference = (document: DemoDocument) => `${document.id} · ${document.name}`;
  const action = (type: AssistantAction['type'], label: string, documentId?: string): AssistantAction => (
    type === 'view_document' ? { type, label, documentId: documentId ?? '' } : { type, label }
  );
  const invoiceDocs = documents.filter((document) => ['sales_invoice', 'purchase_invoice'].includes(document.category));
  const periodInvoices = invoiceDocs.filter((document) => inCurrentPeriod(document, profile));
  const bankDocs = documents.filter((document) => document.category === 'bank_statement')
    .sort((left, right) => right.fields.documentDate.localeCompare(left.fields.documentDate) || right.createdAt.localeCompare(left.createdAt));
  const payrollDocs = documents.filter((document) => document.category === 'payroll');
  const letters = documents.filter((document) => document.category === 'correspondence' || document.category === 'other_correspondence');
  let answer: string;
  let needsAccountant = false;

  const wantsUnpaid = /unpaid|outstanding invoice|open invoice|unbezahlt|offen(e|e rechnung)?|غير مدفوع/.test(normalized);
  const wantsBank = /bank|statement|transaction|kontoauszug|transaktion|auszug|بنك|كشف/.test(normalized);
  const wantsPayroll = /payroll|payslip|salary|lohn|gehalt|personal|gehaltsabrechnung|رواتب/.test(normalized);
  const wantsMissing = /missing|missing document|what documents|fehlen|fehlend|unterlagen|مستندات/.test(normalized);
  const wantsLetter = /tax.office|finanzamt|letter|authority|bescheid|brief|steuer|steuerbehörde|خطاب|ضريبة/.test(normalized);
  const wantsTasks = /task|to.do|complete|todo|aufgabe|erledigen|مهمة/.test(normalized);
  const wantsApproval = /approv|status|review|freigabe|genehmig|prüf|موافقة|حالة/.test(normalized);
  const wantsVat = /vat|mwst|ust|value.added|tax total|mehrwertsteuer|umsatzsteuer|ضريبة القيمة/.test(normalized);
  const asksAccountant = /ask my accountant|ask accountant|clarify|please ask|frage.*steuerberater|accountant.*frage|buchhalter.*fragen|clarify.*transaction|اسأل.*محاسب/.test(normalized);
  const wantsFinance = /financial|summary|finance|revenue|expense|finanziell|übersicht|umsatz|ausgabe|ملخص مالي/.test(normalized);

  if (asksAccountant) {
    const selectedBank = bankDocs[0];
    if (selectedBank) sources.push(reference(selectedBank));
    answer = text(language,
      `I can send this question to your accountant for clarification. This will create a demo correspondence item for ${profile.company}.`,
      `Ich kann diese Frage zur Klärung an Ihre Buchhaltung senden. Dadurch wird ein Demo-Korrespondenzeintrag für ${profile.company} erstellt.`,
      `يمكنني إرسال هذا السؤال إلى محاسبك للتوضيح. سيُنشئ ذلك مراسلة تجريبية لشركة ${profile.company}.`);
    needsAccountant = true;
    actions.push(action('ask_accountant', text(language, 'Send question to accountant', 'Frage an Buchhaltung senden', 'إرسال السؤال للمحاسب')));
  } else if (wantsMissing) {
    const attention = documents.filter((document) => ['needs_information', 'action_required', 'password_required', 'rejected'].includes(document.status));
    const missing = [...profile.missingDocuments, ...attention.map((document) => `${document.name}: ${document.note ?? document.status}`)];
    answer = missing.length
      ? text(language,
        `For ${profile.company}, the demo checklist shows: ${missing.join('; ')}. These are fictional checklist items, not an authoritative accounting assessment.`,
        `Für ${profile.company} zeigt die Demo-Checkliste: ${missing.join('; ')}. Dies sind fiktive Checklistenpunkte, keine verbindliche Buchhaltungsprüfung.`,
        `لشركة ${profile.company}، تعرض قائمة التحقق التجريبية: ${missing.join('؛ ')}. هذه بيانات خيالية وليست مراجعة محاسبية معتمدة.`)
      : text(language, `I don't see a missing-document item in the available demo records for ${profile.company}.`, `In den verfügbaren Demodaten für ${profile.company} ist kein fehlendes Dokument vermerkt.`, `لا يظهر مستند مفقود في سجلات العرض المتاحة لـ ${profile.company}.`);
    needsAccountant = true;
    actions.push(action('upload', text(language, 'Upload missing document', 'Fehlendes Dokument hochladen', 'رفع المستند الناقص')));
  } else if (wantsPayroll) {
    const payrollDoc = payrollDocs.find((document) => (document.extractedDetails?.['Pay period'] ?? profile.payroll.month).toLowerCase().includes('september'));
    const period = payrollDoc?.extractedDetails?.['Pay period'] ?? profile.payroll.month;
    const gross = parseAmount(payrollDoc?.extractedDetails?.['Gross payroll'] ?? '') ?? profile.payroll.gross;
    const net = parseAmount(payrollDoc?.extractedDetails?.['Net payroll'] ?? '') ?? profile.payroll.net;
    const deductions = parseAmount(payrollDoc?.extractedDetails?.['Deductions'] ?? '') ?? profile.payroll.deductions;
    if (payrollDoc) sources.push(reference(payrollDoc));
    answer = text(language,
      `${period} demo payroll for ${profile.company}: ${profile.payroll.employees} employees; gross ${money(gross, profile.currency, language)}, deductions ${money(deductions, profile.currency, language)}, net ${money(net, profile.currency, language)}. These figures come from the fictional payroll summary.`,
      `Demo-Gehaltsabrechnung ${period} für ${profile.company}: ${profile.payroll.employees} Mitarbeitende; brutto ${money(gross, profile.currency, language)}, Abzüge ${money(deductions, profile.currency, language)}, netto ${money(net, profile.currency, language)}. Die Werte stammen aus der fiktiven Gehaltsübersicht.`,
      `ملخص رواتب العرض لشهر ${period} لشركة ${profile.company}: ${profile.payroll.employees} موظفين؛ الإجمالي ${money(gross, profile.currency, language)}، الاستقطاعات ${money(deductions, profile.currency, language)}، الصافي ${money(net, profile.currency, language)}. الأرقام من ملخص رواتب خيالي.`);
    if (payrollDoc) actions.push(action('view_document', text(language, 'View payroll document', 'Gehaltsdokument ansehen', 'عرض مستند الرواتب'), payrollDoc.id));
  } else if (wantsLetter) {
    const letter = [...letters].sort((left, right) => right.fields.documentDate.localeCompare(left.fields.documentDate) || right.createdAt.localeCompare(left.createdAt))[0];
    if (letter) {
      sources.push(reference(letter));
      answer = text(language,
        `${letter.fields.counterparty ?? 'Tax authority'} letter ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}dated ${letter.fields.documentDate || 'date not detected'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'The letter details are not available.'} This is a plain-language summary of fictional demo metadata, not tax advice.`,
        `Schreiben von ${letter.fields.counterparty ?? 'der Steuerbehörde'} ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}vom ${letter.fields.documentDate || 'Datum nicht erkannt'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'Schreibendetails sind nicht verfügbar.'} Dies ist eine vereinfachte Zusammenfassung fiktiver Demodaten, keine Steuerberatung.`,
        `خطاب ${letter.fields.counterparty ?? 'السلطة الضريبية'} ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}بتاريخ ${letter.fields.documentDate || 'تاريخ غير محدد'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'تفاصيل الخطاب غير متاحة.'} هذا ملخص مبسط لبيانات تجريبية خيالية وليس استشارة ضريبية.`);
      actions.push(action('view_document', text(language, 'View letter', 'Schreiben ansehen', 'عرض الخطاب'), letter.id));
    } else {
      answer = text(language, `No tax-office letter is available in ${profile.company}'s demo records.`, `In den Demodaten von ${profile.company} ist kein Schreiben der Steuerbehörde vorhanden.`, `لا يوجد خطاب من السلطة الضريبية في سجلات العرض الخاصة بـ ${profile.company}.`);
      needsAccountant = true;
    }
  } else if (wantsTasks) {
    const openTasks = tasks.filter((task) => !task.complete);
    answer = openTasks.length
      ? text(language, `Open tasks for ${profile.company}: ${openTasks.map((task) => `${task.title} (due ${task.dueDate}, ${task.owner})`).join('; ')}.`, `Offene Aufgaben für ${profile.company}: ${openTasks.map((task) => `${task.title} (fällig ${task.dueDate}, ${task.owner})`).join('; ')}.`, `المهام المفتوحة لشركة ${profile.company}: ${openTasks.map((task) => `${task.title} (الموعد ${task.dueDate}، المسؤول ${task.owner})`).join('؛ ')}.`)
      : text(language, `There are no open tasks in the current demo checklist for ${profile.company}.`, `In der aktuellen Demo-Checkliste von ${profile.company} gibt es keine offenen Aufgaben.`, `لا توجد مهام مفتوحة في قائمة العرض الحالية لشركة ${profile.company}.`);
    actions.push(action('view_tasks', text(language, 'View tasks', 'Aufgaben ansehen', 'عرض المهام')));
  } else if (wantsUnpaid) {
    const unpaid = invoiceDocs.filter((document) => document.category === 'sales_invoice' && document.paymentStatus === 'unpaid');
    if (unpaid.length) {
      const total = unpaid.reduce((sum, document) => sum + (parseAmount(document.fields.grossAmount) ?? 0), 0);
      answer = text(language,
        `${unpaid.length} fictional sales invoice${unpaid.length === 1 ? '' : 's'} is marked unpaid in the available records, totaling ${money(total, profile.currency, language)}: ${unpaid.map((document) => `${document.fields.reference} (${money(parseAmount(document.fields.grossAmount) ?? 0, profile.currency, language)})`).join('; ')}. Payment status has not been independently verified against a live bank feed.`,
        `${unpaid.length} fiktive Ausgangsrechnung${unpaid.length === 1 ? '' : 'en'} ist in den verfügbaren Daten als unbezahlt markiert; Summe ${money(total, profile.currency, language)}: ${unpaid.map((document) => `${document.fields.reference} (${money(parseAmount(document.fields.grossAmount) ?? 0, profile.currency, language)})`).join('; ')}. Der Zahlungsstatus wurde nicht mit einem Live-Bankfeed abgeglichen.`,
        `تُظهر السجلات المتاحة ${unpaid.length} فاتورة مبيعات خيالية غير مدفوعة بإجمالي ${money(total, profile.currency, language)}: ${unpaid.map((document) => `${document.fields.reference} (${money(parseAmount(document.fields.grossAmount) ?? 0, profile.currency, language)})`).join('؛ ')}. لم يتم التحقق من الدفع عبر اتصال مصرفي مباشر.`);
      unpaid.forEach((document) => actions.push(action('view_document', `${text(language, 'View', 'Ansehen', 'عرض')} ${document.fields.reference}`, document.id)));
    } else {
      answer = text(language, `No sales invoice is explicitly marked unpaid in the available records for ${profile.company}. Other invoices with unknown payment status cannot be classified.`, `In den verfügbaren Daten von ${profile.company} ist keine Ausgangsrechnung ausdrücklich als unbezahlt markiert. Rechnungen mit unbekanntem Zahlungsstatus lassen sich nicht zuordnen.`, `لا توجد فاتورة مبيعات محددة كغير مدفوعة في سجلات ${profile.company}. لا يمكن تصنيف الفواتير ذات حالة الدفع غير المعروفة.`);
      needsAccountant = true;
    }
  } else if (wantsBank) {
    const bank = bankDocs[0];
    if (bank) {
      sources.push(reference(bank));
      const details = bank.extractedDetails ?? {};
      const transactions = Object.entries(details).filter(([key]) => key.startsWith('Transaction ')).map(([, value]) => value);
      answer = text(language,
        `Latest available bank statement for ${profile.company}: opening balance ${details['Opening balance'] ?? 'not provided'}, closing balance ${details['Closing balance'] ?? 'not provided'}. ${transactions.length ? `Listed transactions: ${transactions.join('; ')}.` : 'No transaction lines are available.'} The demo does not reconcile balances or match payments automatically.`,
        `Neuester verfügbarer Kontoauszug für ${profile.company}: Anfangssaldo ${details['Opening balance'] ?? 'nicht angegeben'}, Endsaldo ${details['Closing balance'] ?? 'nicht angegeben'}. ${transactions.length ? `Aufgeführte Umsätze: ${transactions.join('; ')}.` : 'Keine Umsatzzeilen verfügbar.'} Die Demo gleicht Salden nicht ab und ordnet Zahlungen nicht automatisch zu.`,
        `أحدث كشف حساب متاح لشركة ${profile.company}: الرصيد الافتتاحي ${details['Opening balance'] ?? 'غير متوفر'}، والختامي ${details['Closing balance'] ?? 'غير متوفر'}. ${transactions.length ? `المعاملات المسجلة: ${transactions.join('؛ ')}.` : 'لا توجد تفاصيل معاملات.'} لا تقوم النسخة التجريبية بمطابقة الأرصدة تلقائياً.`);
      actions.push(action('view_document', text(language, 'View statement', 'Kontoauszug ansehen', 'عرض كشف الحساب'), bank.id));
    } else {
      answer = text(language, `No bank statement is available in ${profile.company}'s current demo records, so I can't summarize its transactions.`, `In den aktuellen Demodaten von ${profile.company} ist kein Kontoauszug vorhanden; ich kann die Umsätze daher nicht zusammenfassen.`, `لا يوجد كشف حساب في سجلات العرض الحالية لشركة ${profile.company}، لذلك لا يمكنني تلخيص المعاملات.`);
      needsAccountant = true;
    }
  } else if (wantsVat) {
    const invoiceRecords = invoiceDocs.filter((document) => parseAmount(document.fields.vatAmount) !== null);
    const vatTotal = invoiceRecords.reduce((sum, document) => sum + (parseAmount(document.fields.vatAmount) ?? 0), 0);
    sources.push(...invoiceRecords.map(reference));
    answer = invoiceRecords.length
      ? text(language, `The VAT amounts on ${invoiceRecords.length} available October invoice record${invoiceRecords.length === 1 ? '' : 's'} total ${money(vatTotal, profile.currency, language)} for ${profile.company}. This adds recorded invoice VAT amounts regardless of approval status; it is not a filed tax return or a verified liability.`, `Die ausgewiesenen Umsatzsteuerbeträge aus ${invoiceRecords.length} verfügbaren Oktober-Rechnungsbelegen ergeben ${money(vatTotal, profile.currency, language)} für ${profile.company}. Berücksichtigt werden erfasste Rechnungsbeträge unabhängig vom Freigabestatus; dies ist weder eine Steuererklärung noch eine bestätigte Steuerschuld.`, `تبلغ مبالغ ضريبة القيمة المضافة المسجلة في ${invoiceRecords.length} فاتورة متاحة لشهر أكتوبر ${money(vatTotal, profile.currency, language)} لشركة ${profile.company}. هذا مجموع المبالغ المدونة بغض النظر عن حالة الموافقة، وليس إقراراً ضريبياً أو التزاماً مؤكداً.`)
      : text(language, `No invoice VAT amounts are available for ${profile.company}, so I can't calculate a total.`, `Für ${profile.company} sind keine Umsatzsteuerbeträge aus Rechnungen verfügbar; eine Summe kann ich nicht berechnen.`, `لا تتوفر مبالغ ضريبة فواتير لشركة ${profile.company}، لذلك لا يمكن حساب الإجمالي.`);
  } else if (wantsApproval) {
    const approved = documents.filter((document) => document.status === 'approved');
    const pending = documents.filter((document) => ['review', 'processing', 'needs_information', 'action_required', 'password_required'].includes(document.status));
    answer = text(language,
      `${profile.company} has ${approved.length} approved document${approved.length === 1 ? '' : 's'} and ${pending.length} still pending review or action. ${approved.length ? `Approved: ${approved.map((document) => document.id).join(', ')}.` : 'No documents have been approved yet.'}`,
      `Bei ${profile.company} sind ${approved.length} Dokument${approved.length === 1 ? '' : 'e'} freigegeben und ${pending.length} warten noch auf Prüfung oder Bearbeitung. ${approved.length ? `Freigegeben: ${approved.map((document) => document.id).join(', ')}.` : 'Bisher wurde kein Dokument freigegeben.'}`,
      `لدى ${profile.company} عدد ${approved.length} مستندات معتمدة و${pending.length} قيد المراجعة أو الإجراء. ${approved.length ? `المعتمد: ${approved.map((document) => document.id).join('، ')}.` : 'لم تتم الموافقة على أي مستند بعد.'}`);
    sources.push(...approved.map(reference), ...pending.map(reference));
    if (pending[0]) actions.push(action('view_document', text(language, 'View pending document', 'Offenes Dokument ansehen', 'عرض المستند المعلق'), pending[0].id));
  } else if (wantsFinance) {
    const sales = periodInvoices.filter((document) => document.category === 'sales_invoice');
    const purchases = periodInvoices.filter((document) => document.category === 'purchase_invoice');
    const totals = (records: DemoDocument[], key: 'netAmount' | 'vatAmount' | 'grossAmount') => records.reduce((sum, document) => sum + (parseAmount(document.fields[key]) ?? 0), 0);
    const known = [...sales, ...purchases];
    sources.push(...known.map(reference));
    answer = known.length
      ? text(language,
        `${profile.company} · ${profile.period}, based on ${known.length} available invoice records: sales ${money(totals(sales, 'grossAmount'), profile.currency, language)} gross and purchases ${money(totals(purchases, 'grossAmount'), profile.currency, language)} gross. Recorded sales VAT: ${money(totals(sales, 'vatAmount'), profile.currency, language)}; purchase VAT: ${money(totals(purchases, 'vatAmount'), profile.currency, language)}. This is a document-based demo summary, not a complete P&L or reconciled balance.`,
        `${profile.company} · ${profile.period}, basierend auf ${known.length} verfügbaren Rechnungen: Umsätze ${money(totals(sales, 'grossAmount'), profile.currency, language)} brutto und Ausgaben ${money(totals(purchases, 'grossAmount'), profile.currency, language)} brutto. Erfasste Umsatzsteuer: ${money(totals(sales, 'vatAmount'), profile.currency, language)}; Vorsteuer: ${money(totals(purchases, 'vatAmount'), profile.currency, language)}. Dies ist eine Dokumentübersicht, keine vollständige GuV oder abgestimmte Bilanz.`,
        `${profile.company} · ${profile.period}، استناداً إلى ${known.length} سجلات فواتير متاحة: المبيعات الإجمالية ${money(totals(sales, 'grossAmount'), profile.currency, language)} والمشتريات الإجمالية ${money(totals(purchases, 'grossAmount'), profile.currency, language)}. ضريبة المبيعات المسجلة ${money(totals(sales, 'vatAmount'), profile.currency, language)}؛ وضريبة المشتريات ${money(totals(purchases, 'vatAmount'), profile.currency, language)}. هذا ملخص تجريبي للمستندات وليس قائمة دخل كاملة أو رصيداً مطابقاً.`)
      : text(language, `There are no invoice records for ${profile.company} in the current demo period, so I can't calculate a financial summary.`, `Für ${profile.company} liegen im aktuellen Demozeitraum keine Rechnungen vor; eine Finanzübersicht kann ich nicht berechnen.`, `لا توجد فواتير لشركة ${profile.company} في الفترة التجريبية الحالية، لذلك لا يمكن حساب ملخص مالي.`);
  } else {
    answer = text(language,
      `I couldn't find enough context in ${profile.company}'s demo records to answer that reliably. I can use the available invoices, bank statement, payroll, tax letter, missing-document checklist, and tasks. You can ask me to send a question to your accountant.`,
      `In den Demodaten von ${profile.company} finde ich nicht genügend Informationen für eine verlässliche Antwort. Verfügbar sind Rechnungen, Kontoauszug, Gehaltsübersicht, Steuerbrief, Checkliste fehlender Unterlagen und Aufgaben. Ich kann auch eine Frage an Ihre Buchhaltung senden.`,
      `لم أجد معلومات كافية في سجلات ${profile.company} التجريبية للإجابة بدقة. يمكنني استخدام الفواتير وكشف الحساب والرواتب والخطاب الضريبي وقائمة المستندات والمهام. يمكنك طلب إرسال سؤال إلى محاسبك.`);
    needsAccountant = true;
  }

  if (needsAccountant && !actions.some((item) => item.type === 'ask_accountant')) {
    actions.push(action('ask_accountant', text(language, 'Send question to accountant', 'Frage an Buchhaltung senden', 'إرسال السؤال للمحاسب')));
  }
  return { answer, references: [...new Set(sources)], actions };
}
