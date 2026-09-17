'use client';
import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { api, Action, Field, Pick, Modal, message } from './app-ui';
import { RichEditor } from './rich-editor';
import { QUESTION_TYPES, FORM_TYPES, newQuestion, type Question } from '@/lib/domain';
import { toast } from 'sonner';

function TemplateQuestion({ q, onChange, onMove, onRemove, first, last }: {
    q: Question;
    onChange: (patch: Partial<Question>) => void;
    onMove: (dir: -1 | 1) => void;
    onRemove: () => void;
    first: boolean;
    last: boolean;
}) {
    return <article className="question-card template-question"><div className="question-card-top"><span>{q.type === 'pagebreak' ? 'BAGIAN' : q.type === 'section' ? 'JUDUL' : 'PERTANYAAN'}</span><Pick value={q.type} onChange={type => onChange({ ...newQuestion(type), id: q.id, label: q.label, required: !['section', 'pagebreak'].includes(type) })} options={QUESTION_TYPES as [
        string,
        string
    ][]} label="Jenis pertanyaan"/><span className="question-move"><button type="button" className="icon-button" aria-label="Naikkan" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={15}/></button><button type="button" className="icon-button" aria-label="Turunkan" disabled={last} onClick={() => onMove(1)}><ArrowDown size={15}/></button><button type="button" className="icon-button" aria-label="Hapus pertanyaan" onClick={onRemove}><Trash2 size={15}/></button></span></div><div className="question-body"><span className="input-label">{['section', 'pagebreak'].includes(q.type) ? 'Judul' : 'Teks pertanyaan'}</span><RichEditor question={q} onChange={patch => onChange(patch)} disabled={false}/><Field label="Deskripsi"><Textarea rows={2} value={q.help} onChange={e => onChange({ help: e.target.value })}/></Field>{['single_choice', 'multiple_choice'].includes(q.type) && <div className="options-editor">{q.options.map((opt, index) => <div key={index} className="option-row"><span className={q.type === 'single_choice' ? 'option-circle' : 'option-square'}/><Input aria-label={'Opsi ' + (index + 1)} value={opt} onChange={e => onChange({ options: q.options.map((o, j) => j === index ? e.target.value : o) })}/><button type="button" className="icon-button" aria-label={'Hapus opsi ' + (index + 1)} onClick={() => onChange({ options: q.options.filter((_, j) => j !== index) })}><Trash2 size={15}/></button></div>)}{q.allowOther && <div className="option-row"><span className={q.type === 'single_choice' ? 'option-circle' : 'option-square'}/><span className="other-label">Lainnya</span><button type="button" className="icon-button" aria-label="Hapus opsi Lainnya" onClick={() => onChange({ allowOther: false })}><Trash2 size={15}/></button></div>}<div className="option-add"><button type="button" onClick={() => onChange({ options: [...q.options, ''] })}><Plus size={14}/> Tambah opsi</button>{!q.allowOther && <button type="button" onClick={() => onChange({ allowOther: true })}><Plus size={14}/> Tambah “Lainnya”</button>}</div></div>}{q.type === 'likert' && <Field label="Jumlah titik skala"><Pick value={String(q.scale)} onChange={v => onChange({ scale: Number(v) })} options={['3', '4', '5', '6', '7', '8', '9', '10']} label="Jumlah titik skala"/></Field>}{!['section', 'pagebreak'].includes(q.type) && <label className="switch-label"><span>Wajib diisi</span><Switch checked={q.required} onCheckedChange={v => onChange({ required: v })}/></label>}</div></article>;
}

export function TemplateEditModal({ open, onOpenChange, template, onSaved }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    template: any | null;
    onSaved: () => void;
}) {
    const [title, setTitle] = useState(() => template?.title ?? '');
    const [type, setType] = useState(() => template?.type ?? 'kebutuhan');
    const [description, setDescription] = useState(() => template?.description ?? '');
    const [questions, setQuestions] = useState<Question[]>(() => (template?.questions ?? []).map((q: Question) => ({ ...q })));
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const updateQuestion = (id: string, patch: Partial<Question>) => setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q));
    const move = (id: string, dir: -1 | 1) => setQuestions(qs => { const i = qs.findIndex(q => q.id === id); if (i < 0) return qs; const j = i + dir; if (j < 0 || j >= qs.length) return qs; const next = [...qs]; [next[i], next[j]] = [next[j], next[i]]; return next; });
    const remove = (id: string) => setQuestions(qs => qs.filter(q => q.id !== id));
    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!template) return;
        setBusy(true);
        try {
            await api('templates/' + template.id, 'PUT', { title, type, description, questions });
            toast.success('Template disimpan.');
            onSaved();
        }
        catch (err) {
            setError(message(err));
        }
        finally {
            setBusy(false);
        }
    }
    return <Modal open={open} onOpenChange={onOpenChange} title="Edit template" wide><div className="stack dialog-scroll"><form className="stack" onSubmit={save}><div className="settings-grid"><section className="panel padded stack"><h2>Informasi template</h2><Field label="Nama template"><Input required value={title} onChange={e => setTitle(e.target.value)}/></Field><Field label="Tipe template"><Pick value={type} onChange={setType} options={FORM_TYPES as [
            string,
            string
        ][]} label="Tipe template"/></Field><Field label="Deskripsi template"><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}/></Field></section></div><h2>Pertanyaan</h2>{!questions.length ? <p className="muted">Belum ada pertanyaan.</p> : questions.map((q, i) => <TemplateQuestion key={q.id} q={q} onChange={patch => updateQuestion(q.id, patch)} onMove={dir => move(q.id, dir)} onRemove={() => remove(q.id)} first={i === 0} last={i === questions.length - 1}/>)}<div className="add-toolbar"><Action type="button" variant="outline" onClick={() => setQuestions(qs => [...qs, newQuestion()])}><Plus size={16}/> Pertanyaan</Action><Action type="button" variant="outline" onClick={() => setQuestions(qs => [...qs, newQuestion('section')])}><Plus size={16}/> Tambah judul</Action><Action type="button" variant="outline" onClick={() => setQuestions(qs => [...qs, newQuestion('pagebreak')])}><Plus size={16}/> Tambah bagian</Action><Action type="submit" busy={busy}><Save size={16}/> Simpan</Action></div>{error && <p className="error-box">{error}</p>}</form></div></Modal>;
}