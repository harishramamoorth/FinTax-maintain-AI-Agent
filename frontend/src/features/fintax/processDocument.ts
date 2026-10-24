import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { emptyDemoFields, extractDemoFields, type DemoFields } from './demoWorkflow';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LocalDocumentExtraction {
  fields: DemoFields;
  confidence: number;
  pageCount: number | null;
  text: string;
  note: string;
}

export class DocumentProcessingError extends Error {
  constructor(message: string, public readonly code: 'password_required' | 'invalid_pdf' | 'too_many_pages') {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}

const PAGE_LIMIT = 200;
const TEXT_LIMIT = 250_000;

export async function processLocalDocument(
  file: File,
  onProgress: (progress: number) => void,
): Promise<LocalDocumentExtraction> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return {
      fields: emptyDemoFields(),
      confidence: 0,
      pageCount: null,
      text: '',
      note: 'Image OCR is not installed. Review the original beside this form and enter the fields manually.',
    };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, useWorkerFetch: false });
  let pdf: pdfjs.PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy();
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new DocumentProcessingError('This PDF is password-protected. It was not opened; no password is collected.', 'password_required');
    }
    throw new DocumentProcessingError('The PDF could not be read. Check that it is a valid, uncorrupted PDF.', 'invalid_pdf');
  }
  if (pdf.numPages > PAGE_LIMIT) {
    await pdf.destroy();
    throw new DocumentProcessingError(`This PDF has ${pdf.numPages} pages; this demo accepts a maximum of ${PAGE_LIMIT}.`, 'too_many_pages');
  }
  if (pdf.numPages < 1) {
    await pdf.destroy();
    throw new DocumentProcessingError('The PDF contains no pages.', 'invalid_pdf');
  }

  const pageText: string[] = [];
  let extractedLength = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('');
      pageText.push(text);
      extractedLength += text.length + 1;
      onProgress(Math.round((pageNumber / pdf.numPages) * 100));
      if (extractedLength >= TEXT_LIMIT) break;
    }
  } finally {
    await pdf.destroy();
  }

  const text = pageText.join('\n').slice(0, TEXT_LIMIT).trim();
  if (!text) {
    return {
      fields: emptyDemoFields(),
      confidence: 0,
      pageCount: pdf.numPages,
      text: '',
      note: 'This PDF has no selectable text (it may be a scan). OCR is not configured; review the original and enter values manually.',
    };
  }

  const extraction = extractDemoFields(text);
  return {
    ...extraction,
    pageCount: pdf.numPages,
    text,
    note: extraction.confidence
      ? 'Text was extracted locally in this browser. Candidate fields use simple label matching; verify every value against the original.'
      : 'PDF text was extracted locally, but no supported field labels were found. Review the text and enter values manually.',
  };
}
