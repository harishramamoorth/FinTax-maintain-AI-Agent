import { Fragment, type ReactNode } from 'react';

/** Minimal, XSS-safe Markdown renderer (no HTML injection): headings, lists, bold, italic, code, http(s) links. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k} className="font-mono text-[12.5px] px-1 py-0.5 rounded bg-ink/10">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3] || m[4]) out.push(<em key={k}>{(m[3] ?? m[4]).slice(1, -1)}</em>);
    else if (m[5]) {
      const label = m[5].slice(1, m[5].indexOf(']('));
      out.push(<a key={k} href={m[6]} target="_blank" rel="noopener noreferrer nofollow" className="text-cyan underline underline-offset-2">{label}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={key++} className="font-mono text-[12.5px] p-3 rounded-lg bg-bg/70 border hairline overflow-x-auto my-2"><code>{code.join('\n')}</code></pre>);
    } else if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const cls = level === 1 ? 'text-lg font-semibold mt-3' : level === 2 ? 'text-base font-semibold mt-3' : 'text-sm font-semibold mt-2';
      blocks.push(<p key={key++} className={cls}>{inline(line.replace(/^#+\s/, ''), `h${key}`)}</p>); i++;
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={key++} className="list-disc pl-5 my-1.5 space-y-0.5">{items.map((t, j) => <li key={j}>{inline(t, `u${key}-${j}`)}</li>)}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={key++} className="list-decimal pl-5 my-1.5 space-y-0.5">{items.map((t, j) => <li key={j}>{inline(t, `o${key}-${j}`)}</li>)}</ol>);
    } else if (!line.trim()) { i++; }
    else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={key++} className="my-1.5 leading-relaxed">{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `p${key}-${j}`)}</Fragment>)}</p>);
    }
  }
  return <div className="text-sm break-words">{blocks}</div>;
}
