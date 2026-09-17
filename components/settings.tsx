'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Users, ShieldCheck, KeyRound, UserCheck, UserX, LockKeyhole, History, LogOut, Copy, CheckCircle2, Clock, Trash2, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { api, Action, Field, Pick, Modal, PageHead, Blank, useGate, message, formatDate } from './app-ui';
import type { Member } from '@/lib/domain';
import { toast } from 'sonner';
export function TeamPage({ user }: {
    user: Member;
}) { const [members, setMembers] = useState<Member[]>([]), [error, setError] = useState(''), [open, setOpen] = useState(false), [reset, setReset] = useState<Member | null>(null), [name, setName] = useState(''), [username, setUsername] = useState('')        , [password, setPassword] = useState(''), [role, setRole] = useState('staff'), [show, setShow] = useState(false), [busy, setBusy] = useState(false); const gate = useGate(); const load = useCallback(async () => { try {
    setMembers((await api('members')).members);
    setError('');
}
catch (e) {
    setError(message(e));
} }, []); useEffect(() => { load(); }, [load]); async function create(e: React.FormEvent) { e.preventDefault(); setBusy(true); try {
    await gate.sensitive(async () => { await api('members', 'POST', { name, username, password, role }); setOpen(false); setPassword(''); load(); toast.success('Akun dibuat. Sandi wajib diganti saat pertama masuk.'); });
}
catch (e) {
    toast.error(message(e));
}
finally {
    setBusy(false);
} } return <><PageHead title="Anggota tim"><Action onClick={() => { setName(''); setUsername(''); setPassword(''); setRole('staff'); setOpen(true); }}><Plus size={16}/> Tambah anggota</Action></PageHead>{error ? <p className="error-box">{error}</p> : <section className="panel"><Table><TableHeader><TableRow><TableHead>Anggota</TableHead><TableHead>Username</TableHead><TableHead>Peran</TableHead><TableHead>Status</TableHead><TableHead>Autentikator</TableHead><TableHead>Tindakan</TableHead></TableRow></TableHeader><TableBody>{members.map(m => <TableRow key={m.id}><TableCell><div className="member-cell"><span className="avatar">{m.name[0]}</span><span>{m.name}{m.id === user.id && <small>Anda</small>}</span></div></TableCell><TableCell>{m.username}</TableCell><TableCell><Pick value={m.role} disabled={m.id === user.id} onChange={v => gate.confirm('Ubah peran anggota?', 'Sesi aktif dicabut. Peran berlaku setelah masuk.', () => gate.sensitive(async () => { await api('members/' + m.id, 'PUT', { role: v, active: !!m.active }); load(); toast.success('Peran disimpan.'); }))} options={[['admin', 'Administrator'], ['staff', 'Staf kegiatan'], ['analyst', 'Analis']]} label={'Peran ' + m.name}/></TableCell><TableCell><span className={'status ' + (m.active ? 'status-published' : 'status-closed')}>{m.active ? 'Aktif' : 'Nonaktif'}</span></TableCell><TableCell>{m.totp_enabled ? 'Aktif' : 'Belum aktif'}</TableCell><TableCell><div className="table-actions"><button disabled={m.id === user.id} className="icon-button" aria-label={'Reset sandi ' + m.name} title="Reset sandi" onClick={() => { setPassword(''); setReset(m); }}><KeyRound size={17}/></button><button disabled={m.id === user.id} className="icon-button" aria-label={m.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} title={m.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} onClick={() => gate.confirm(m.active ? 'Nonaktifkan anggota?' : 'Aktifkan anggota?', m.active ? 'Sesi dicabut, akun tidak bisa masuk.' : 'Akun dapat masuk kembali.', () => gate.sensitive(async () => { await api('members/' + m.id, 'PUT', { role: m.role, active: !m.active }); load(); }))}>{m.active ? <UserX size={17}/> : <UserCheck size={17}/>}</button></div></TableCell></TableRow>)}</TableBody></Table></section>}<div className="role-explainer"><article><ShieldCheck size={20}/><h3>Administrator</h3><p>Kelola seluruh kegiatan, akun, dan kebijakan privasi.</p></article><article><Users size={20}/><h3>Staf kegiatan</h3><p>Kelola kegiatan milik atau tugasnya. Meninjau respons.</p></article><article><History size={20}/><h3>Analis</h3><p>Hanya membaca laporan pada kegiatan yang ditugaskan.</p></article></div><Modal open={open} onOpenChange={setOpen} title="Tambah anggota tim"><form onSubmit={create} className="stack"><Field label="Nama"><Input required value={name} onChange={e => setName(e.target.value)}/></Field><Field label="Username"><Input required minLength={3} maxLength={40} autoComplete="off" value={username} onChange={e => setUsername(e.target.value)}/></Field><Field label="Sandi sementara" hint="Minimal 8 karakter. Ganti setelah masuk."><div className="password-field"><Input required type={show ? 'text' : 'password'} minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Field label="Peran"><Pick value={role} onChange={setRole} options={[['staff', 'Staf kegiatan'], ['analyst', 'Analis'], ['admin', 'Administrator']]} label="Peran anggota"/></Field><Action busy={busy}>Buat akun</Action></form></Modal><Modal open={!!reset} onOpenChange={v => { if (!v)
    setReset(null); }} title="Reset sandi anggota" description="Sesi dicabut. Autentikator tetap diperlukan."><form className="stack" onSubmit={async (e) => { e.preventDefault(); try {
    await gate.sensitive(async () => { await api('members/' + reset!.id + '/password', 'PUT', { password }); setReset(null); setPassword(''); toast.success('Sandi sementara diperbarui.'); });
}
catch (e) {
    toast.error(message(e));
} }}><Field label="Sandi sementara baru"><div className="password-field"><Input required type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Action>Reset sandi</Action></form></Modal></>; }
export function SettingsPage() { const [data, setData] = useState<any>(null), [count, setCount] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false); const gate = useGate(); const load = useCallback(async () => { try {
    const d = await api('settings');
    setData(d.settings);
    setCount(d.expired_count);
}
catch (e) {
    setError(message(e));
} }, []); useEffect(() => { load(); }, [load]); if (error)
    return <p className="error-box">{error}</p>; if (!data)
    return null; return <><PageHead title="Privasi dan akses"/><div className="security-summary"><div><LockKeyhole /><span>Enkripsi respons<small>Respons disimpan dalam bentuk terenkripsi.</small></span></div><div><Users /><span>Akses berdasarkan peran<small>Hak akses diperiksa pada setiap permintaan.</small></span></div><div><History /><span>Catatan aktivitas<small>Perubahan penting dicatat agar dapat ditelusuri.</small></span></div></div><div className="settings-grid"><form className="panel padded stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try {
    await gate.sensitive(async () => { await api('settings', 'PUT', data); toast.success('Kebijakan privasi diperbarui.'); });
}
catch (e) {
    toast.error(message(e));
}
finally {
    setBusy(false);
} }}><h2>Penggunaan dan penyimpanan data</h2><Field label="Nama organisasi"><Input required value={data.name} onChange={e => setData({ ...data, name: e.target.value })}/></Field><Field label="Kontak penanggung jawab privasi" hint="Ditampilkan kepada peserta."><Input value={data.privacy_contact} onChange={e => setData({ ...data, privacy_contact: e.target.value })}/></Field><Field label="Pemberitahuan privasi"><Textarea rows={6} required minLength={30} maxLength={3000} value={data.privacy_notice} onChange={e => setData({ ...data, privacy_notice: e.target.value })}/></Field><Field label="Masa simpan respons (hari)" hint="30–3.650 hari."><Input type="number" min={30} max={3650} step={1} required value={data.retention_days} onChange={e => setData({ ...data, retention_days: Number(e.target.value) })}/></Field><Action busy={busy}>Simpan</Action></form><div className="stack"><section className="panel padded stack"><Clock className="blue-icon"/><h2>Respons yang melewati masa simpan</h2><div className="stat-value">{count}</div><p>Tidak disertakan analisis, tetap tersimpan.</p><Action variant="outline" disabled={!count} onClick={() => gate.confirm('Hapus data kedaluwarsa?', 'Hanya respons lewat masa simpan.', () => gate.sensitive(async () => { const r = await api('settings/purge', 'POST', {}); toast.success(r.deleted + ' respons dihapus.'); load(); }))}><Trash2 size={16}/> Hapus respons kedaluwarsa</Action></section><section className="panel padded"><h2>Akses dashboard dan formulir</h2><p>Peserta membuka formulir melalui tautan acak. Dashboard untuk pengelola.</p></section><section className="panel padded"><h2>Verifikasi dua langkah</h2><p>Masuk dengan kode dari aplikasi autentikator.</p><Link href="/akun" className="text-link">Buka pengaturan akun</Link></section></div></div></>; }
export function AccountPage({ user, refresh }: {
    user: Member;
    refresh: () => void;
}) { const router = useRouter(); const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [show, setShow] = useState(false), [otp, setOtp] = useState(''), [secret, setSecret] = useState(''), [mfaOtp, setMfaOtp] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''); const gate = useGate(); async function save(e: React.FormEvent) { e.preventDefault(); if (password !== confirm) {
    setError('Konfirmasi sandi tidak sesuai.');
    return;
} setBusy(true); setError(''); try {
    await api('account', 'POST', { current_password: current, password, otp });
    setCurrent('');
    setPassword('');
    setConfirm('');
    setOtp('');
    toast.success('Sandi diubah. Sesi lain keluar.');
    refresh();
}
catch (e) {
    setError(message(e));
}
finally {
    setBusy(false);
} } return <><PageHead title="Pengaturan akun"/>{!!user.must_change_password && <div className="notice"><KeyRound /><p>Ganti sandi sementara.</p></div>}<div className="settings-grid"><form onSubmit={save} className="panel padded stack"><h2>Ganti kata sandi</h2><Field label="Kata sandi saat ini"><div className="password-field"><Input required type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Field label="Kata sandi baru" hint="Minimal 8 karakter."><div className="password-field"><Input required type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Field label="Ulangi kata sandi baru"><div className="password-field"><Input required type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field>{user.totp_enabled && <Field label="Kode autentikator"><Input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)}/></Field>}{error && <p role="alert" className="error-box">{error}</p>}<Action busy={busy}>Simpan</Action></form><div className="stack"><section className="panel padded stack"><ShieldCheck className="blue-icon"/><h2>Verifikasi dua langkah</h2><p>Kode 6 digit dari aplikasi autentikator.</p>{!user.totp_enabled && !secret && <Action variant="outline" disabled={!!user.must_change_password} onClick={async () => { try {
    await gate.sensitive(async () => { const r = await api('mfa/begin', 'POST', {}); setSecret(r.secret); setMfaOtp(''); });
}
catch (e) {
    toast.error(message(e));
} }}>Hubungkan autentikator</Action>}{secret && <form className="stack" onSubmit={async (e) => { e.preventDefault(); try {
    await gate.sensitive(async () => { await api('mfa/enable', 'POST', { secret, otp: mfaOtp }); setSecret(''); setMfaOtp(''); toast.success('Verifikasi dua langkah aktif.'); refresh(); });
}
catch (e) {
    toast.error(message(e));
} }}><p>Tambah akun di aplikasi autentikator dengan kunci penyiapan ini. Pilih kode berbasis waktu.</p><Field label="Kunci penyiapan"><Input readOnly value={secret}/></Field><Action type="button" variant="ghost" onClick={async () => { try {
    await navigator.clipboard.writeText(secret);
    toast.success('Kunci disalin.');
}
catch {
    toast.error('Salin kunci dari kolom di atas.');
} }}><Copy size={15}/> Salin kunci</Action><Field label="Kode dari autentikator"><Input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaOtp} onChange={e => setMfaOtp(e.target.value)}/></Field><Action>Aktifkan</Action></form>}{user.totp_enabled && <div className="success-note"><CheckCircle2 size={17}/> Autentikator terhubung</div>}</section><section className="panel padded stack"><h2>Sesi masuk</h2><p>Sesi berakhir setelah 8 jam, atau 1 jam tanpa aktivitas.</p><Action variant="outline" onClick={() => gate.confirm('Keluar dari semua perangkat?', 'Perlu masuk kembali.', async () => { await api('account/sessions', 'DELETE'); router.push('/'); })}><LogOut size={16}/> Keluar dari semua perangkat</Action></section></div></div></>; }
const ACTION_LABELS: Record<string, string> = { 'workspace.setup': 'Workspace disiapkan', 'auth.login': 'Masuk ke akun', 'auth.logout': 'Keluar dari akun', 'auth.failed': 'Percobaan login gagal', 'account.password': 'Sandi diperbarui', 'account.revoke_sessions': 'Seluruh sesi dicabut', 'training.create': 'Kegiatan dibuat', 'training.update': 'Kegiatan diperbarui', 'training.delete': 'Kegiatan dihapus', 'training.members': 'Akses kegiatan diubah', 'form.create': 'Formulir dibuat', 'form.update': 'Formulir diperbarui', 'form.published': 'Formulir dibuka', 'form.closed': 'Formulir ditutup', 'form.rotate_link': 'Tautan formulir diganti', 'form.delete': 'Formulir dihapus', 'template.create': 'Template disimpan', 'template.delete': 'Template dihapus', 'responses.read': 'Respons dibuka', 'responses.export': 'Respons diekspor', 'response.delete': 'Respons dihapus', 'response.exclude': 'Respons dikecualikan', 'response.restore': 'Respons disertakan kembali', 'member.create': 'Akun tim dibuat', 'member.update': 'Akses akun diubah', 'member.reset_password': 'Sandi anggota direset', 'media.upload': 'Media diunggah', 'privacy.update': 'Kebijakan privasi diperbarui', 'privacy.purge': 'Data kedaluwarsa dihapus', 'mfa.enable': 'Autentikator diaktifkan', 'mfa.disable': 'Autentikator dinonaktifkan', 'help.create': 'Laporan/saran dikirim', 'help.status': 'Status laporan diubah', 'help.delete': 'Laporan dihapus' };
export function AuditPage() { const [events, setEvents] = useState<any[] | null>(null), [error, setError] = useState(''); useEffect(() => { api('audit').then(d => setEvents(d.events)).catch(e => setError(message(e))); }, []); return <><PageHead title="Jejak aktivitas"/>{error ? <p className="error-box">{error}</p> : !events ? null : <section className="panel"><Table><TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Pelaku</TableHead><TableHead>Aktivitas</TableHead><TableHead>Referensi</TableHead><TableHead>Keterangan</TableHead></TableRow></TableHeader><TableBody>{events.map(e => <TableRow key={e.id}><TableCell>{new Date(e.created_at).toLocaleString('id-ID')}</TableCell><TableCell>{e.actor_name}</TableCell><TableCell>{ACTION_LABELS[e.action] ?? e.action}</TableCell><TableCell><span className="mono">{e.target_id?.slice(0, 12) ?? 'Sistem'}</span></TableCell><TableCell>{e.detail}</TableCell></TableRow>)}</TableBody></Table></section>}</>; }
