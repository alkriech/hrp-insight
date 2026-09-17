'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Eye, EyeOff, Layers, BarChart3, ClipboardCheck, LockKeyhole } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api, Action, Field, message } from './app-ui';
export function AuthScreen({ setup, onSuccess }: {
    setup: boolean;
    onSuccess: () => void;
}) { const [name, setName] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [otp, setOtp] = useState(''), [setupCode, setSetupCode] = useState(''), [needsOtp, setNeedsOtp] = useState(false), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''); async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try {
    await api(setup ? 'setup' : 'login', 'POST', { name, username, password, otp, setup_code: setupCode });
    onSuccess();
}
catch (e) {
    const m = message(e);
    setError(m);
    if (m.includes('autentikator'))
        setNeedsOtp(true);
}
finally {
    setBusy(false);
} } return <div className="auth-page"><header className="auth-header"><Link className="wordmark" href="/">hafecs<span>insight</span><span className="brand-square"/></Link><span className="auth-tag">RESEARCH & PUBLICATION</span></header><main className="auth-grid"><section className="auth-form"><div className="eyebrow">HAFECS INSIGHT</div><h1>{setup ? <>Kelola pelatihan<br />dan evaluasi tim<span>.</span></> : <>Selamat datang kembali</>}</h1><form onSubmit={submit} className="stack">{setup && <Field label="Nama"><Input required autoComplete="name" value={name} onChange={e => setName(e.target.value)}/></Field>}{setup && <Field label="Kode penyiapan"><Input required autoComplete="off" autoCapitalize="none" type="password" value={setupCode} onChange={e => setSetupCode(e.target.value)}/></Field>}<Field label="Username" hint={setup ? '3–40 karakter.' : undefined}><Input required autoComplete="username" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)}/></Field><Field label="Kata sandi" hint={setup ? 'Minimal 8 karakter.' : undefined}><div className="password-field"><Input required type={show ? 'text' : 'password'} autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 8 : undefined} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field>{needsOtp && <Field label="Kode autentikator"><Input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)}/></Field>}{error && <p role="alert" className="error-box">{error}</p>}<Action className="auth-submit" busy={busy}>{setup ? 'Buat akun' : 'Masuk'}<ArrowRight size={18}/></Action></form><div className="auth-note"><LockKeyhole size={15}/><span>Pendaftaran dan reset sandi melalui administrator.</span></div></section><section className="auth-visual" aria-label="Alur kerja HAFECS"><h2>Cara kerja</h2><div className="auth-workflow">{[[Layers, 'Kegiatan', ''], [ClipboardCheck, 'Survei dan asesmen', 'mint'], [BarChart3, 'Hasil evaluasi', 'peach']].map(([Icon, title, color]: any) => <div key={title}><span className={'flow-icon ' + color}><Icon size={24}/></span><span>{title}</span><ArrowUpRight size={18}/></div>)}</div><div className="hrp-lockup"><img src="/images/logo-hrp.jpg" alt="HAFECS Research & Publication"/></div></section></main><footer className="auth-footer">HAFECS Insight<span>Pelatihan · Survei · Asesmen · Pelaporan</span></footer></div>; }
