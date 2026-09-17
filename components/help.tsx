'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Inbox, Paperclip, Trash2, ImagePlus, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { api, Action, Field, Pick, PageHead, Modal, Blank, useGate, message, formatDate } from './app-ui';
import type { Member } from '@/lib/domain';
import { toast } from 'sonner';
const CATEGORIES: Record<string, string> = { bug: 'Laporan error/bug', saran: 'Saran pengembangan' };
const STATUS_LABELS: Record<string, string> = { baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai', ditolak: 'Ditolak' };
const STATUS_OPTIONS: [string, string][] = [['baru', 'Baru'], ['diproses', 'Diproses'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak']];
const statusClass = (s: string) => ({ baru: 'status-selesai', diproses: 'status-rencana', selesai: 'status-published', ditolak: 'status-dibatalkan' } as Record<string, string>)[s] ?? '';
export function HelpPage({ user }: {
    user: Member;
}) { const isAdmin = user.role === 'admin'; const MAX_PHOTOS = 5; const [mine, setMine] = useState<any[] | null>(null), [messages, setMessages] = useState<any[] | null>(null), [remaining, setRemaining] = useState(10), [category, setCategory] = useState(''), [text, setText] = useState(''), [files, setFiles] = useState<File[]>([]), [previews, setPreviews] = useState<string[]>([]), [view, setView] = useState<any | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''); const gate = useGate(); const urlsRef = useRef<string[]>([]); const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; const room = MAX_PHOTOS - files.length; const add = picked.slice(0, room); if (picked.length > room)
    toast.error('Maksimal ' + MAX_PHOTOS + ' foto per kiriman.'); const urls: string[] = []; const valid: File[] = []; for (const f of add) { if (f.type && !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { toast.error('Gunakan foto PNG, JPG, atau WebP.'); continue; } if (f.size > 20 * 1024 * 1024) { toast.error('Ukuran gambar maksimal 20 MB.'); continue; } valid.push(f); urls.push(URL.createObjectURL(f)); } setFiles([...files, ...valid]); urlsRef.current.push(...urls); setPreviews([...previews, ...urls]); }; const removePhoto = (i: number) => { const u = urlsRef.current[i]; if (u) { URL.revokeObjectURL(u); urlsRef.current.splice(i, 1); } setFiles(files.filter((_, j) => j !== i)); setPreviews(previews.filter((_, j) => j !== i)); }; const load = useCallback(async () => { try {
    const a = await api('help');
    setMine(a.reports);
    setRemaining(a.remaining_today);
    if (isAdmin)
        setMessages((await api('help/messages')).reports);
    setError('');
}
catch (e) {
    setError(message(e));
} }, [isAdmin]); useEffect(() => { load(); }, [load]); const submit = async (e: React.FormEvent) => { e.preventDefault(); if (!category) {
    toast.error('Pilih kategori terlebih dahulu.');
    return;
} if (text.trim().length < 20) {
    toast.error('Uraian minimal 20 karakter.');
    return;
} setBusy(true); try {
    const fd = new FormData();
    fd.set('category', category);
    fd.set('message', text.trim());
    for (const f of files)
        fd.append('file', f);
    await api('help', 'POST', fd);
    setCategory('');
    setText('');
    for (const u of urlsRef.current)
        URL.revokeObjectURL(u);
    urlsRef.current = [];
    setFiles([]);
    setPreviews([]);
    toast.success(category === 'bug' ? 'Laporan terkirim ke admin.' : 'Saran terkirim ke admin.');
    load();
}
catch (err) {
    toast.error(message(err));
}
finally {
    setBusy(false);
} }; const setStatus = (r: any, v: string) => gate.confirm('Ubah status laporan?', 'Status "' + (STATUS_LABELS[v] ?? v) + '" ditandai.', async () => { await api('help/messages/' + r.id + '/status', 'POST', { status: v }); toast.success('Status disimpan.'); load(); }); const remove = (r: any) => gate.confirm('Hapus laporan ini?', 'Laporan dan lampiran ikut terhapus.', () => gate.sensitive(async () => { await api('help/messages/' + r.id, 'DELETE'); toast.success('Laporan dihapus.'); load(); })); if (error)
    return <p className="error-box">{error}</p>; if (!mine)
    return null; const newCount = messages?.filter(m => m.status === 'baru').length ?? 0; return <><PageHead title="Bantuan & masukan"/> {isAdmin ? <section className="panel"><div className="panel-heading"><h2>Kotak masuk admin{newCount > 0 && <span className={'status ' + statusClass('baru')}>{newCount} baru</span>}</h2></div>{!messages ? null : !messages.length ? <Blank title="Belum ada kiriman" text="" icon={Inbox}/> : <Table><TableHeader><TableRow><TableHead>Pengirim</TableHead><TableHead>Kategori</TableHead><TableHead>Isi</TableHead><TableHead>Lampiran</TableHead><TableHead>Waktu</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{messages.map(r => <TableRow key={r.id}><TableCell><div className="member-cell"><span className="avatar">{r.author_name.slice(0, 1)}</span><span>{r.author_name}{r.author_id === user.id && <small>Anda</small>}</span></div></TableCell><TableCell>{CATEGORIES[r.category] ?? r.category}</TableCell><TableCell><button className="text-link" onClick={() => setView(r)}>Baca</button></TableCell><TableCell>{r.media_count > 0 ? <div className="gallery-inline">{Array.from({ length: r.media_count }, (_, i) => <a key={i} className="media-thumb" href={'/api/help/media/' + r.id + '/' + i} target="_blank" rel="noreferrer"><img src={'/api/help/media/' + r.id + '/' + i} alt={'Foto ' + (i + 1)}/></a>)}</div> : <span className="muted">Tidak ada</span>}</TableCell><TableCell>{formatDate(r.created_at)}</TableCell><TableCell><Pick value={r.status} onChange={v => setStatus(r, v)} options={STATUS_OPTIONS} label={'Status laporan ' + r.author_name}/></TableCell><TableCell><div className="table-actions"><button className="icon-button" aria-label={'Hapus laporan ' + r.author_name} title="Hapus laporan" onClick={() => remove(r)}><Trash2 size={17}/></button></div></TableCell></TableRow>)}</TableBody></Table>}</section> : <div className="settings-grid"><form onSubmit={submit} className="panel padded stack"><div className="panel-heading" style={{ padding: 0 }}><h2>Kirim masukan</h2></div><Field label="Kategori"><Pick value={category} onChange={setCategory} options={[['bug', 'Laporan error/bug'], ['saran', 'Saran pengembangan']]} label="Kategori"/></Field><Field label="Uraian" hint="Minimal 20 karakter."><Textarea rows={7} required minLength={20} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Tulis kendala atau saran."/></Field><div className="field"><span className="input-label">Screenshot (opsional)</span><div className="screenshot-field">{previews.length > 0 && <div className="screenshot-thumbs">{previews.map((p, i) => <span className="screenshot-thumb-wrap" key={i}><img className="screenshot-thumb" src={p} alt={'Foto ' + (i + 1)}/><button type="button" className="screenshot-remove" onClick={() => removePhoto(i)} aria-label={'Hapus foto ' + (i + 1)}><X size={12}/></button></span>)}</div>}{files.length < MAX_PHOTOS && <><input id="screenshot-input" type="file" className="screenshot-input" multiple accept="image/png,image/jpeg,image/webp" onChange={pickFiles}/><label className="screenshot-btn" htmlFor="screenshot-input"><ImagePlus size={16}/> {files.length ? 'Tambah foto' : 'Pilih foto'}</label></>}</div><p className="field-hint">{files.length ? files.length + ' dari ' + MAX_PHOTOS + ' foto · ' : ''}PNG, JPG, atau WebP maksimal 20 MB.</p></div><div className="field"><span className="field-hint">Sisa kiriman hari ini: {remaining}</span></div><Action type="submit" busy={busy}><Send size={16}/> Kirim</Action></form><div className="stack"><section className="panel"><div className="panel-heading"><h2>Riwayat kiriman saya</h2></div>{!mine.length ? <Blank title="Belum ada kiriman" text="" icon={Inbox}/> : <Table><TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Kategori</TableHead><TableHead>Isi</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{mine.map(r => <TableRow key={r.id} onClick={() => setView(r)}><TableCell>{formatDate(r.created_at)}</TableCell><TableCell>{CATEGORIES[r.category] ?? r.category}</TableCell><TableCell><span title={r.message}>{r.message.length > 120 ? r.message.slice(0, 120) + '…' : r.message}{r.media_count > 0 && <Paperclip size={13} style={{ marginLeft: 6, verticalAlign: 'middle', color: '#97a9c1' }}/>}</span></TableCell><TableCell><span className={'status ' + statusClass(r.status)}>{STATUS_LABELS[r.status] ?? r.status}</span></TableCell></TableRow>)}</TableBody></Table>}</section></div></div>}<Modal open={!!view} onOpenChange={v => { if (!v)
    setView(null); }} title={view ? (CATEGORIES[view.category] ?? view.category) + ' · ' + (STATUS_LABELS[view.status] ?? view.status) : ''} description={view ? formatDate(view.created_at) : ''}><div className="stack">{view && <><p style={{ whiteSpace: 'pre-wrap' }}>{view.message}</p>{view.media_count > 0 && <div className="media-stack">{Array.from({ length: view.media_count }, (_, i) => <a key={i} className="media-thumb" href={'/api/help/media/' + view.id + '/' + i} target="_blank" rel="noreferrer"><img src={'/api/help/media/' + view.id + '/' + i} alt={'Foto ' + (i + 1)}/></a>)}</div>}</>}</div></Modal></>;
}