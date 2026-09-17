'use client';
import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, Link as LinkIcon, RemoveFormatting } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Modal, Field, Action } from './app-ui';
import type { Question } from '@/lib/domain';
type Span = NonNullable<Question['rich']>[number];
export function RichLabel({ question }: {
    question: Pick<Question, 'label' | 'rich'>;
}) { if (!question.rich?.length)
    return <>{question.label}</>; return <>{question.rich.map((s, i) => { let v: React.ReactNode = s.text; if (s.bold)
    v = <strong>{v}</strong>; if (s.italic)
    v = <em>{v}</em>; if (s.underline)
    v = <u>{v}</u>; if (s.href && /^https?:\/\//.test(s.href))
    v = <a href={s.href} target="_blank" rel="noopener noreferrer">{v}</a>; return <React.Fragment key={i}>{v}</React.Fragment>; })}</>; }
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function html(q: Question) { return (q.rich?.length ? q.rich : [{ text: q.label }]).map(s => { let v = escape(s.text).replaceAll('\n', '<br>'); if (s.bold)
    v = '<b>' + v + '</b>'; if (s.italic)
    v = '<i>' + v + '</i>'; if (s.underline)
    v = '<u>' + v + '</u>'; if (s.href && /^https?:\/\//.test(s.href))
    v = '<a href="' + escape(s.href) + '">' + v + '</a>'; return v; }).join(''); }
function read(node: HTMLElement) { const spans: Span[] = []; function visit(n: Node, marks: Omit<Span, 'text'>) { if (n.nodeType === Node.TEXT_NODE) {
    if (n.textContent)
        spans.push({ text: n.textContent, ...marks });
    return;
} if (!(n instanceof HTMLElement))
    return; const tag = n.tagName; const m = { ...marks }; if (['B', 'STRONG'].includes(tag) || Number(n.style.fontWeight) >= 600)
    m.bold = true; if (['I', 'EM'].includes(tag) || n.style.fontStyle === 'italic')
    m.italic = true; if (tag === 'U' || n.style.textDecoration.includes('underline'))
    m.underline = true; if (tag === 'A' && /^https?:\/\//.test(n.getAttribute('href') ?? ''))
    m.href = n.getAttribute('href')!; if (tag === 'BR') {
    spans.push({ text: '\n' });
    return;
} if (['DIV', 'P'].includes(tag) && spans.length)
    spans.push({ text: '\n' }); n.childNodes.forEach(c => visit(c, m)); } node.childNodes.forEach(n => visit(n, {})); return spans; }
export function RichEditor({ question, onChange, disabled }: {
    question: Question;
    onChange: (q: Partial<Question>) => void;
    disabled: boolean;
}) { const ref = useRef<HTMLDivElement>(null), range = useRef<Range | null>(null); const [active, setActive] = useState<Record<string, boolean>>({}), [link, setLink] = useState(false), [url, setUrl] = useState(''), [display, setDisplay] = useState(''); useEffect(() => { if (ref.current)
    ref.current.innerHTML = html(question); }, [question.id]); useEffect(() => { function selection() { const s = window.getSelection(); if (!s?.anchorNode || !ref.current?.contains(s.anchorNode))
    return; range.current = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; setActive({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'), createLink: !!s.anchorNode.parentElement?.closest('a') }); } document.addEventListener('selectionchange', selection); return () => document.removeEventListener('selectionchange', selection); }, []); function save() { if (!ref.current)
    return; const rich = read(ref.current); onChange({ rich, label: rich.map(s => s.text).join('') }); } function command(c: string) { ref.current?.focus(); if (range.current) {
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range.current);
} document.execCommand(c, false); save(); setActive(a => ({ ...a, [c]: document.queryCommandState(c) })); } function addLink(e: React.FormEvent) { e.preventDefault(); const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol))
    return; ref.current?.focus(); if (range.current && ref.current?.contains(range.current.commonAncestorContainer)) {
    const r = range.current;
    const a = document.createElement('a');
    a.href = parsed.href;
    a.textContent = display;
    r.deleteContents();
    r.insertNode(a);
    r.setStartAfter(a);
    r.collapse(true);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    save();
} setLink(false); } return <div className={'rich-editor ' + (disabled ? 'disabled' : '')}><div className="format-toolbar">{[[Bold, 'bold', 'Tebal'], [Italic, 'italic', 'Miring'], [Underline, 'underline', 'Garis bawah'], [LinkIcon, 'createLink', 'Sisipkan tautan'], [RemoveFormatting, 'removeFormat', 'Hapus format']].map(([Icon, cmd, label]: any) => <button key={cmd} type="button" disabled={disabled} aria-label={label} title={label} aria-pressed={!!active[cmd]} className={active[cmd] ? 'is-active' : ''} onMouseDown={e => e.preventDefault()} onClick={() => { if (cmd === 'createLink') {
    setDisplay(window.getSelection()?.toString() ?? '');
    setUrl('');
    setLink(true);
}
else
    command(cmd); }}><Icon size={16}/></button>)}</div><div ref={ref} role="textbox" aria-label="Teks pertanyaan" aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning className="rich-input" onInput={save} onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); save(); }}/><Modal open={link} onOpenChange={setLink} title="Sisipkan tautan"><form onSubmit={addLink} className="stack"><Field label="Teks yang ditampilkan"><Input required value={display} onChange={e => setDisplay(e.target.value)}/></Field><Field label="Alamat tautan"><Input required type="url" value={url} pattern="https?://.+" onChange={e => setUrl(e.target.value)}/></Field><Action>Sisipkan tautan</Action></form></Modal></div>; }
