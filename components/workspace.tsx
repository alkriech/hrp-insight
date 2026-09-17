'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, CalendarDays, ClipboardList, Library, BarChart3, Users, ShieldCheck, Settings2, LogOut, ChevronRight, ArrowUpRight, Plus, Layers, MessageSquare, GraduationCap, LifeBuoy } from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { api, Action, PageHead, Blank, GateProvider, PrivacyBadge, Status, formatDate, num, message } from './app-ui';
import { AuthScreen } from './auth-screen';
import { TrainingsPage, TrainingDetail, TrainingDialog } from './trainings';
import { FormsPage, TemplatesPage, FormBuilder } from './form-builder';
import { ReportsPage, ResponsesPage } from './reports';
import { TeamPage, SettingsPage, AccountPage, AuditPage } from './settings';
import { HelpPage } from './help';
import type { Member, Training } from '@/lib/domain';
import { toast } from 'sonner';
const nav = [['/', 'Ringkasan', LayoutDashboard], ['/kegiatan', 'Rekap pelatihan', CalendarDays], ['/formulir', 'Formulir', ClipboardList], ['/template', 'Template formulir', Library], ['/laporan', 'Laporan dan analisis', BarChart3]] as const;
let cachedSession: any = null;
export function Workspace() {
    const path = usePathname();
    const [session, setSession] = useState<any>(() => cachedSession), [error, setError] = useState(''), [denied, setDenied] = useState(false);
    const refresh = useCallback(async (force: boolean = false) => { if (!force && cachedSession)
        setSession(cachedSession); try {
        const s = await api('session');
        cachedSession = s;
        setSession(s);
        setDenied(false);
        setError('');
    }
    catch (e) {
        setError(message(e));
    } }, []);
    useEffect(() => { refresh(); const on401 = () => { cachedSession = null; setSession(null); setDenied(true); }; window.addEventListener('hafecs:unauthorized', on401); return () => window.removeEventListener('hafecs:unauthorized', on401); }, [refresh]);
    if (denied)
        return <><AuthScreen setup={false} onSuccess={() => refresh(true)}/><Toaster /></>;
    if (error)
        return <div className="center-state"><ShieldCheck size={32}/><h1>Workspace belum dapat dimuat</h1><p>{error}</p><Action onClick={() => refresh(true)}>Coba lagi</Action></div>;
    if (!session)
        return null;
    if (!session.user)
        return <><AuthScreen setup={session.needs_setup} onSuccess={() => refresh(true)}/><Toaster /></>;
    const user: Member = session.user;
    const isAdmin = user.role === 'admin';
    const active = nav.find(n => n[0] === '/' ? path === '/' : path.startsWith(n[0]));
    const breadcrumb: Record<string, string> = { '/tim': 'Anggota tim', '/privasi': 'Privasi dan akses', '/audit': 'Jejak aktivitas', '/akun': 'Pengaturan akun', '/bantuan': 'Bantuan & masukan' };
    const route = path.split('/').filter(Boolean);
    let page;
    if (user.must_change_password)
        page = <AccountPage user={user} refresh={() => refresh(true)}/>;
    else if (route[0] === 'kegiatan')
        page = route[1] ? <TrainingDetail id={route[1]} user={user}/> : <TrainingsPage user={user}/>;
    else if (route[0] === 'formulir')
        page = route[1] ? (route[2] === 'respons' ? <ResponsesPage id={route[1]} user={user}/> : <FormBuilder id={route[1]} user={user}/>) : <FormsPage user={user}/>;
    else if (route[0] === 'template')
        page = <TemplatesPage user={user}/>;
    else if (route[0] === 'laporan')
        page = <ReportsPage />;
    else if (route[0] === 'tim')
        page = <TeamPage user={user}/>;
    else if (route[0] === 'privasi')
        page = <SettingsPage />;
    else if (route[0] === 'akun')
        page = <AccountPage user={user} refresh={() => refresh(true)}/>;
    else if (route[0] === 'audit')
        page = <AuditPage />;
    else if (route[0] === 'bantuan')
        page = <HelpPage user={user}/>;
    else if (route.length === 0)
        page = <Dashboard user={user}/>;
    else
        page = <Blank title="Halaman tidak ditemukan" text=""><Link className="text-link" href="/">Ke ringkasan</Link></Blank>;
    return <GateProvider><SidebarProvider style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}><Sidebar className="app-sidebar"><SidebarHeader><Link className="wordmark sidebar-logo" href="/">hafecs<span>insight</span><span className="brand-square"/></Link></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupLabel>WORKSPACE</SidebarGroupLabel><SidebarMenu>{nav.map(([href, label, Icon]) => <SidebarMenuItem key={href}><SidebarMenuButton asChild isActive={href === '/' ? path === '/' : path.startsWith(href)} tooltip={label}><Link href={href}><Icon /><span>{label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup><SidebarGroup><SidebarGroupLabel>PENGELOLAAN</SidebarGroupLabel><SidebarMenu>{isAdmin && <>{[['/tim', 'Anggota tim', Users], ['/privasi', 'Privasi dan akses', ShieldCheck], ['/audit', 'Jejak aktivitas', ClipboardList]].map(([href, label, Icon]: any) => <SidebarMenuItem key={href}><SidebarMenuButton asChild isActive={path === href}><Link href={href}><Icon /><span>{label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</>}<SidebarMenuItem><SidebarMenuButton asChild isActive={path === '/bantuan'}><Link href="/bantuan"><LifeBuoy /><span>Bantuan &amp; masukan</span></Link></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton asChild isActive={path === '/akun'}><Link href="/akun"><Settings2 /><span>Pengaturan akun</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup></SidebarContent><SidebarFooter><div className="sidebar-brand"><img src="/images/logo-hrp.jpg" alt="HRP"/></div><div className="user-block"><Link href="/akun" className="avatar">{user.name.slice(0, 1).toUpperCase()}</Link><Link href="/akun" className="user-name">{user.name}<small>{user.role === 'admin' ? 'Administrator' : user.role === 'staff' ? 'Staf kegiatan' : 'Analis'}</small></Link><button title="Keluar" aria-label="Keluar" onClick={async () => { try {
        await api('logout', 'POST', {});
    }
    catch (e) {
        toast.error(message(e));
    }
    cachedSession = null; setSession(null); setDenied(true); }}><LogOut size={17}/></button></div></SidebarFooter></Sidebar><SidebarInset className="workspace-main"><header className="topbar"><div className="breadcrumb"><SidebarTrigger /><span>Workspace</span><ChevronRight size={14}/><span>{active?.[1] ?? breadcrumb[path] ?? 'Pengelolaan'}</span></div><PrivacyBadge /></header><div className="page-content">{page}</div><footer className="workspace-footer"><span>HAFECS Insight</span><span>Research & Publication</span></footer></SidebarInset></SidebarProvider><Toaster position="bottom-right" richColors/></GateProvider>;
}
function Dashboard({ user }: {
    user: Member;
}) { const [rows, setRows] = useState<Training[] | null>(null), [error, setError] = useState(''), [open, setOpen] = useState(false); const load = useCallback(() => api('trainings').then(d => setRows(d.trainings)).catch(e => setError(message(e))), []); useEffect(() => { load(); }, [load]); const data = rows ?? []; const stats = [['Kegiatan pelatihan', data.length, CalendarDays, 'blue'], ['Formulir', data.reduce((s, t) => s + t.form_count, 0), ClipboardList, 'violet'], ['Respons masuk', data.reduce((s, t) => s + t.response_count, 0), MessageSquare, 'green'], ['Target peserta', data.reduce((s, t) => s + Number(t.details.participant_count || 0), 0), GraduationCap, 'orange']] as const; return <><PageHead title={`Halo, ${user.name.split(' ')[0]}`}>{user.role !== 'analyst' && <Action onClick={() => setOpen(true)}><Plus size={17}/> Buat kegiatan</Action>}</PageHead>{error && <p className="error-box">{error}</p>}<div className="stats-grid">{stats.map(([label, value, Icon, color]) => <article className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={'stat-icon ' + color}><Icon size={19}/></span></div><div className="stat-value">{rows ? num(value) : null}</div></article>)}</div><div className="dashboard-grid"><section className="panel activities-panel"><div className="panel-heading"><h2>Kegiatan terbaru</h2><Link href="/kegiatan" className="text-link">Lihat semua <ArrowUpRight size={15}/></Link></div>{!rows ? null : !data.length ? <Blank title="Mulai dari kegiatan pertama" text="" icon={CalendarDays}>{user.role !== 'analyst' && <Action variant="outline" onClick={() => setOpen(true)}><Plus size={16}/> Tambah kegiatan</Action>}</Blank> : <div className="activity-list">{data.slice(0, 2).map(t => <Link href={'/kegiatan/' + t.id} key={t.id} className="activity-row"><span className="activity-icon"><CalendarDays size={21}/></span><div><h3>{t.name}</h3><p>{t.program} · {formatDate(t.start_date)}</p></div><Status value={t.status}/><ChevronRight size={17}/></Link>)}</div>}</section><section className="start-panel"><h2>Buat formulir dari template</h2><Link href="/template" className="start-link">Lihat template <ArrowUpRight size={17}/></Link><div className="template-tags"><span>Survei kebutuhan · Pre-test · Post-test · Evaluasi kegiatan</span></div></section></div><div className="dashboard-bottom"><section className="panel"><div className="panel-heading"><h2>Jenis kegiatan</h2><Layers size={18}/></div>{!data.length ? <Blank title="Belum ada program" text="" icon={Layers}/> : <div className="program-bars">{Array.from(new Set(data.map(t => t.program))).map(p => { const count = data.filter(t => t.program === p).length; return <div key={p}><div><span>{p}</span><span>{count} kegiatan</span></div><div className="bar-track"><span style={{ width: (count / data.length * 100) + '%' }}/></div></div>; })}</div>}</section><section className="panel"><div className="panel-heading"><h2>Panduan kegiatan</h2><ArrowUpRight size={18}/></div><div className="workflow-steps">{[['01', 'Buat kegiatan', '/kegiatan'], ['02', 'Susun dan bagikan formulir', '/formulir'], ['03', 'Lihat hasil evaluasi', '/laporan']].map(([n, title, href]) => <Link href={href} key={n}><span>{n}</span><div><h3>{title}</h3></div><ChevronRight size={16}/></Link>)}</div></section></div><TrainingDialog open={open} onOpenChange={setOpen} onSaved={() => { setOpen(false); load(); }}/></>; }
