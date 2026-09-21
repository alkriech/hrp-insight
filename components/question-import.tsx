'use client';
import { useEffect, useState } from 'react';
import { Search, FileDown, FileText, ClipboardList } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api, Action, Pick, Modal, Blank, message, formatDate } from './app-ui';
import { FORM_TYPES, type Question } from '@/lib/domain';
import { toast } from 'sonner';

export function prepareImportedQuestions(qs: Question[]): Question[] {
    return qs.map(q => ({ ...q, id: crypto.randomUUID(), mediaId: undefined }));
}

type SourceItem = {
    id: string;
    title: string;
    type: string;
    description: string;
    questions: Question[];
    created_at: string;
};

export function ImportQuestionsModal({ open, onOpenChange, excludeId, onImport }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    excludeId?: string;
    onImport: (questions: Question[]) => void;
}) {
    const [source, setSource] = useState('template');
    const [query, setQuery] = useState('');
    const [list, setList] = useState<{ source: string; items: SourceItem[] | null; error: string }>({ source: 'template', items: null, error: '' });
    useEffect(() => {
        if (!open) return;
        (source === 'template' ? api('templates') : api('forms')).then(d => setList({ source, items: (source === 'template' ? d.templates : (d.forms ?? []).filter((f: SourceItem) => f.id !== excludeId)).slice().sort((a: SourceItem, b: SourceItem) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), error: '' })).catch(e => setList({ source, items: null, error: message(e) }));
    }, [open, source, excludeId]);
    const typeLabel = (type: string) => FORM_TYPES.find(v => v[0] === type)?.[1] ?? type;
    const items = list.source === source ? list.items : null;
    const error = list.source === source ? list.error : '';
    const filtered = items?.filter(i => `${i.title} ${i.description}`.toLowerCase().includes(query.toLowerCase()));
    return <Modal open={open} onOpenChange={onOpenChange} title="Import pertanyaan" description="Tambahkan pertanyaan dari template atau formulir lain ke akhir daftar." wide><div className="stack"><Pick value={source} onChange={v => { setSource(v); setQuery(''); }} options={[['template', 'Dari template'], ['form', 'Dari formulir lain']]} label="Sumber import"/><div className="search-field"><Search size={17}/><Input value={query} onChange={e => setQuery(e.target.value)} aria-label="Cari sumber pertanyaan"/></div>{error ? <p className="error-box">{error}</p> : !items ? null : !filtered?.length ? <div className="panel"><Blank title={items.length ? 'Tidak ada yang cocok' : source === 'template' ? 'Belum ada template' : 'Belum ada formulir lain'} text="" icon={source === 'template' ? FileText : ClipboardList}/></div> : <div className="import-list">{filtered.map(i => <article className="import-item" key={i.id}><div className="import-item-main"><span className="eyebrow">{typeLabel(i.type)}</span><h3>{i.title}</h3><p>{i.description || 'Tanpa deskripsi.'}</p><span className="import-item-meta">{i.questions.length} butir · {formatDate(i.created_at)}</span></div><Action variant="ghost" disabled={!i.questions.length} onClick={() => { onImport(prepareImportedQuestions(i.questions)); onOpenChange(false); toast.success('Pertanyaan diimpor.'); }}><FileDown size={16}/> Import</Action></article>)}</div>}</div></Modal>;
}