'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LockKeyhole, ImageOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Action, Field, api, message } from './app-ui';
import { RichLabel } from './rich-editor';
import { validateAnswers, splitPages, type Question, type Answer } from '@/lib/domain';
export function MediaView({ formId, mediaId, token }: {
    formId: string;
    mediaId: string;
    token?: string;
}) { const [src, setSrc] = useState(''), [mime, setMime] = useState(''), [error, setError] = useState(false); useEffect(() => { let objectUrl = '', cancel = false; async function load() { try {
    const r = await fetch('/api/' + (token ? 'public/' : 'forms/') + formId + '/media/' + mediaId, { credentials: 'same-origin', headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!r.ok)
        throw new Error();
    const blob = await r.blob();
    objectUrl = URL.createObjectURL(blob);
    if (!cancel) {
        setSrc(objectUrl);
        setMime(blob.type);
    }
}
catch {
    if (!cancel)
        setError(true);
} } load(); return () => { cancel = true; if (objectUrl)
    URL.revokeObjectURL(objectUrl); }; }, [formId, mediaId, token]); if (error)
    return <p className="media-error"><ImageOff size={18}/> Media tidak dapat dimuat. Coba muat ulang halaman.</p>; if (!src)
    return null; return mime.startsWith('video/') ? <video controls preload="metadata" src={src} className="question-media"/> : <img src={src} alt="Media pendukung pertanyaan" className="question-media"/>; }
export function PublicBanner({ formId, token }: {
    formId: string;
    token?: string;
}) { const [src, setSrc] = useState(''), [error, setError] = useState(false); useEffect(() => { let objectUrl = '', cancel = false; async function load() { try {
    const r = await fetch('/api/public/' + formId + '/banner', { credentials: 'same-origin', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok)
        throw new Error();
    const blob = await r.blob();
    objectUrl = URL.createObjectURL(blob);
    if (!cancel)
        setSrc(objectUrl);
}
catch {
    if (!cancel)
        setError(true);
} } load(); return () => { cancel = true; if (objectUrl)
    URL.revokeObjectURL(objectUrl); }; }, [formId, token]); if (error || !src)
    return null; return <img className="participant-banner" src={src} alt="Banner kegiatan"/>; }
export function ParticipantForm({ form, token, preview = false }: {
    form: any;
    token?: string;
    preview?: boolean;
}) { const [answers, setAnswers] = useState<Record<string, Answer>>({}), [page, setPage] = useState(0), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(''), [hp, setHp] = useState(''); const requestId = useRef<string>(''); useEffect(() => { requestId.current = crypto.randomUUID(); }, []); const pages = splitPages(form.questions); const current = pages[page]; const top = useRef<HTMLDivElement>(null); const set = (id: string, v: Answer) => setAnswers(a => ({ ...a, [id]: v })); function next() { try {
    validateAnswers(current.questions, answers);
    setError('');
    setPage(p => p + 1);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
catch (e) {
    setError(message(e));
} } async function submit(e: React.FormEvent) { e.preventDefault(); if (page < pages.length - 1) {
    next();
    return;
} try {
    validateAnswers(form.questions, answers);
}
catch (e) {
    setError(message(e));
    return;
} if (!consent) {
    setError('Berikan persetujuan penggunaan data sebelum mengirim.');
    return;
} if (preview) {
    setReceipt('PRATINJAU');
    return;
} setBusy(true); setError(''); try {
    const r = await api('public/' + form.id + '/responses', 'POST', { answers, consent, request_id: requestId.current, revision: form.revision, hp }, token);
    setReceipt(r.receipt);
}
catch (e) {
    setError(message(e));
}
finally {
    setBusy(false);
} } if (receipt)
    return <div className="receipt-card"><span className="receipt-icon"><CheckCircle2 size={35}/></span><h2>{preview ? 'Pratinjau selesai.' : 'Terima kasih.'}</h2><p>{preview ? 'Tidak ada jawaban yang disimpan.' : 'Simpan kode bukti ini.'}</p>{!preview && <code>{receipt}</code>}{preview && <Action variant="outline" onClick={() => { setReceipt(''); setPage(0); }}>Lihat formulir lagi</Action>}</div>; return <div className={'participant-form ' + (preview ? 'is-preview' : '')} ref={top}>{form.banner && <PublicBanner formId={form.id} token={token}/>}<header className="participant-title"><span className="eyebrow">{form.training_name ?? 'HAFECS RESEARCH & PUBLICATION'}</span><h1>{form.title}</h1>{form.description && <p>{form.description}</p>}</header><div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px', height: 0, overflow: 'hidden' }}><label>Jangan diisi<span style={{ display: 'inline' }}> </span><Input tabIndex={-1} autoComplete="off" type="text" name="hp" value={hp} onChange={e => setHp(e.target.value)}/></label></div><div className="participant-progress"><div><span>Bagian {page + 1} dari {pages.length}</span><span>{Math.round((page + 1) / pages.length * 100)}%</span></div><Progress value={(page + 1) / pages.length * 100}/></div><form onSubmit={submit}><section className="participant-section">{page > 0 && <header><h2>{current.title}</h2>{current.description && <p>{current.description}</p>}</header>}{current.questions.map((q, index) => q.type === 'section' ? <div className="inline-section" key={q.id}><h2><RichLabel question={q}/></h2>{q.help && <p>{q.help}</p>}{q.mediaId && <MediaView formId={form.id} mediaId={q.mediaId} token={token}/>}</div> : <div className="participant-question" key={q.id}><div id={'label-' + q.id} className="participant-label"><span className="question-number">{form.questions.filter((x: Question) => !['section', 'pagebreak'].includes(x.type)).findIndex((x: Question) => x.id === q.id) + 1}.</span><span><RichLabel question={q}/>{q.required && <span className="required-mark" aria-label="wajib diisi"> *</span>}</span></div>{q.help && <p className="question-help" id={'help-' + q.id}>{q.help}</p>}{q.mediaId && <MediaView formId={form.id} mediaId={q.mediaId} token={token}/>}<AnswerInput question={q} value={answers[q.id]} onChange={v => set(q.id, v)}/></div>)}</section>{page === pages.length - 1 && <section className="consent-panel"><div><LockKeyhole size={17}/><h3>Penggunaan data</h3></div><p>{form.privacy?.privacy_notice}</p><p>Respons disimpan selama {form.privacy?.retention_days ?? 365} hari.{form.privacy?.privacy_contact ? ' Pertanyaan dan permintaan penghapusan data: ' + form.privacy.privacy_contact : ''}</p><label className="checkbox-label"><Checkbox checked={consent} onCheckedChange={v => setConsent(!!v)}/><span>Saya menyetujui penggunaan jawaban untuk evaluasi.</span></label></section>}{error && <p className="error-box" role="alert">{error}</p>}<footer className="participant-nav">{page > 0 ? <Action type="button" variant="outline" disabled={busy} onClick={() => { setPage(p => p - 1); setError(''); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><ArrowLeft size={16}/> Kembali</Action> : <span className="required-note">* Wajib diisi</span>}<Action busy={busy}>{page === pages.length - 1 ? (preview ? 'Selesaikan pratinjau' : 'Kirim jawaban') : 'Lanjut'}{page === pages.length - 1 ? <Check size={17}/> : <ArrowRight size={17}/>}</Action></footer></form></div>; }
function AnswerInput({ question: q, value, onChange }: {
    question: Question;
    value?: Answer;
    onChange: (v: Answer) => void;
}) { const id = 'answer-' + q.id; if (['short_text', 'number'].includes(q.type))
    return <Input id={id} aria-labelledby={'label-' + q.id} aria-describedby={q.help ? 'help-' + q.id : undefined} type={q.type === 'number' ? 'number' : 'text'} step={q.type === 'number' ? 'any' : undefined} maxLength={10000} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)}/>; if (q.type === 'long_text')
    return <Textarea id={id} aria-labelledby={'label-' + q.id} rows={4} maxLength={10000} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)}/>; if (q.type === 'multiple_choice') {
    const selected = Array.isArray(value) ? value : [];
    const other = selected.find(v => v.startsWith('__other__:'));
    return <div role="group" aria-labelledby={'label-' + q.id} className="answer-options">{q.options.map((o, i) => <label key={i} className={'answer-option ' + (selected.includes(o) ? 'selected' : '')}><Checkbox checked={selected.includes(o)} onCheckedChange={v => onChange(v ? [...selected, o] : selected.filter(s => s !== o))}/><span>{o}</span></label>)}{q.allowOther && <div className={'answer-option other-option ' + (other !== undefined ? 'selected' : '')}><label><Checkbox checked={other !== undefined} onCheckedChange={v => onChange(v ? [...selected, '__other__:'] : selected.filter(s => !s.startsWith('__other__:')))}/><span>Lainnya</span></label>{other !== undefined && <Input aria-label="Jawaban lainnya" value={other.slice(10)} onChange={e => onChange([...selected.filter(s => !s.startsWith('__other__:')), '__other__:' + e.target.value])}/>}</div>}</div>;
} const opts = q.type === 'yes_no' ? ['Ya', 'Tidak'] : q.type === 'likert' ? Array.from({ length: q.scale }, (_, i) => String(i + 1)) : q.options; const other = typeof value === 'string' && value.startsWith('__other__:'); return <><RadioGroup aria-labelledby={'label-' + q.id} className={q.type === 'likert' ? 'likert-options' : 'answer-options'} value={other ? '__OTHER__' : String(value ?? '')} onValueChange={v => onChange(v === '__OTHER__' ? '__other__:' : v)}>{opts.map((o, i) => <label key={i} className={'answer-option ' + (value === o ? 'selected' : '')}><RadioGroupItem value={o}/><span>{o}</span></label>)}{q.allowOther && q.type === 'single_choice' && <div className={'answer-option other-option ' + (other ? 'selected' : '')}><label><RadioGroupItem value="__OTHER__"/><span>Lainnya</span></label>{other && <Input aria-label="Jawaban lainnya" value={String(value).slice(10)} onChange={e => onChange('__other__:' + e.target.value)}/>}</div>}</RadioGroup>{q.type === 'likert' && <div className="scale-labels"><span>Terendah</span><span>Tertinggi</span></div>}</>; }
export function ParticipantPage({ id }: {
    id: string;
}) { const [form, setForm] = useState<any>(null), [token, setToken] = useState(''), [error, setError] = useState(''); useEffect(() => { const k = new URLSearchParams(window.location.hash.slice(1)).get('k') ?? ''; setToken(k); if (!k) {
    setError('Buka tautan dari penyelenggara.');
    return;
} api('public/' + id, 'GET', undefined, k).then(setForm).catch(e => setError(message(e))); }, [id]); return <div className="participant-page"><header className="participant-brand"><img src="/images/logo-hrp.jpg" alt="HAFECS Research & Publication"/><span>HAFECS Insight</span></header><main className="participant-container">{error ? <div className="receipt-card"><LockKeyhole size={30}/><h1>Formulir belum dapat diakses</h1><p>{error}</p></div> : !form ? null : <ParticipantForm form={form} token={token}/>}</main><footer className="participant-footnote">HAFECS Research & Publication</footer></div>; }
