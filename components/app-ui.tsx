'use client';
import React, { createContext, useContext, useState } from 'react';
import { Loader2, ArrowRight, ShieldCheck, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { toast } from 'sonner';
export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export async function api(path: string, method = 'GET', body?: unknown, token?: string) { const response = await fetch('/api/' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: { ...(method !== 'GET' ? { 'X-Hrp-Insight-Request': '1' } : {}), ...(body instanceof FormData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }); const raw = await response.text(); let data: any; try {
    data = raw ? JSON.parse(raw) : {};
}
catch {
    data = {};
}
if (response.status === 401)
    window.dispatchEvent(new CustomEvent('hrp-insight:unauthorized'));
if (!response.ok)
    throw new ApiError(response.status, data.error ?? (response.status === 413 ? 'File terlalu besar.' : 'Permintaan gagal.')); return data; }
export const message = (e: unknown) => e instanceof Error ? e.message : 'Terjadi kesalahan. Coba lagi.';
export function Action({ children, busy, variant = 'default', className = '', ...props }: React.ComponentProps<typeof Button> & {
    busy?: boolean;
}) { return <Button variant={variant} className={'action ' + className} {...props} disabled={busy || props.disabled}>{busy && <Loader2 className="spin" size={16}/>} {children}</Button>; }
export function Field({ label, children, hint, className = '' }: {
    label: string;
    children: React.ReactNode;
    hint?: string;
    className?: string;
}) { return <div className={'field ' + className}><label>{label}{children}</label>{hint && <p className="field-hint">{hint}</p>}</div>; }
export function Pick({ value, onChange, options, label, disabled = false }: {
    value: string;
    onChange: (v: string) => void;
    options: (string | [
        string,
        string
    ])[];
    label: string;
    disabled?: boolean;
}) { return <Select value={value || '__none'} onValueChange={v => onChange(v === '__none' ? '' : v)} disabled={disabled}><SelectTrigger aria-label={label} className="pick"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <SelectItem key={v || '__none'} value={v || '__none'}>{l}</SelectItem>; })}</SelectContent></Select>; }
export function Status({ value }: {
    value: string;
}) { const words: Record<string, string> = { draft: 'Draf', published: 'Terbuka', closed: 'Ditutup' }; return <span className={'status status-' + value.toLowerCase()}>{words[value] ?? value}</span>; }
export function Blank({ title, text, icon: Icon = ArrowRight, children }: {
    title: string;
    text: string;
    icon?: React.ElementType;
    children?: React.ReactNode;
}) { return <Empty className="blank"><EmptyHeader><EmptyMedia variant="icon"><Icon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{text}</EmptyDescription></EmptyHeader>{children}</Empty>; }
export function PageHead({ eyebrow, title, text, children }: {
    eyebrow?: string;
    title: string;
    text?: string;
    children?: React.ReactNode;
}) { return <div className="page-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{text && <p>{text}</p>}</div><div className="head-actions">{children}</div></div>; }
export function Modal({ open, onOpenChange, title, description, children, wide = false }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    wide?: boolean;
}) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={'app-dialog ' + (wide ? 'dialog-wide' : '')}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description ?? ' '}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>; }
type Gate = {
    sensitive: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
    confirm: (title: string, detail: string, fn: () => Promise<unknown>) => void;
};
const GateContext = createContext<Gate>(null!);
export const useGate = () => useContext(GateContext);
export function GateProvider({ children }: {
    children: React.ReactNode;
}) { const [pending, setPending] = useState<(() => Promise<any>) | null>(null), [confirm, setConfirm] = useState<{
    title: string;
    detail: string;
    fn: () => Promise<unknown>;
} | null>(null), [password, setPassword] = useState(''), [otp, setOtp] = useState(''), [show, setShow] = useState(false), [busy, setBusy] = useState(false); async function sensitive<T>(fn: () => Promise<T>) { try {
    return await fn();
}
catch (e) {
    if (e instanceof ApiError && e.status === 428) {
        setPending(() => fn);
        return undefined;
    }
    throw e;
} } async function reauth(e: React.FormEvent) { e.preventDefault(); setBusy(true); try {
    await api('reauth', 'POST', { password, otp });
    const fn = pending;
    setPending(null);
    setPassword('');
    setOtp('');
    await fn?.();
}
catch (e) {
    toast.error(message(e));
}
finally {
    setBusy(false);
} } return <GateContext.Provider value={{ sensitive, confirm: (title, detail, fn) => setConfirm({ title, detail, fn }) }}>{children}<Modal open={!!pending} onOpenChange={v => { if (!v)
    setPending(null); }} title="Konfirmasikan identitas" description="Verifikasi untuk melanjutkan tindakan."><form onSubmit={reauth} className="stack"><Field label="Sandi"><div className="password-field"><Input autoFocus type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Field label="Kode autentikator"><Input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value)}/></Field><Action busy={busy}><LockKeyhole size={16}/> Konfirmasi</Action></form></Modal><AlertDialog open={!!confirm} onOpenChange={v => { if (!v)
    setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.detail}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={async () => { const fn = confirm?.fn; setConfirm(null); try {
    await fn?.();
}
catch (e) {
    toast.error(message(e));
} }}>Lanjutkan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></GateContext.Provider>; }
export function PrivacyBadge() { return <span className="privacy-badge"><ShieldCheck size={14}/> Privat</span>; }
export const formatDate = (value?: string) => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);
