'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, ClipboardList,
  FileText, KeyRound, Loader2, LockKeyhole, MessagesSquare, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from './app-ui';
import './landing.css';

type Landing = { name: string; request_url: string; feedback_url: string };
type LoadState = 'loading' | 'ready' | 'error';

function FormLink({ href, label, state, secondary = false }: {
  href: string; label: string; state: LoadState; secondary?: boolean;
}) {
  const className = `landing-button${secondary ? ' landing-button-secondary' : ''}`;
  return (
    <div className="landing-form-action">
      {state === 'ready' && href ? (
        <Button asChild className={className}>
          <a href={href} target="_blank" rel="noopener noreferrer">
            {label}<ArrowUpRight size={18} aria-hidden="true" />
            <span className="sr-only"> (buka di tab baru)</span>
          </a>
        </Button>
      ) : (
        <Button className={className} disabled>
          {state === 'loading' ? <><Loader2 size={17} className="landing-spinner" aria-hidden="true" />Memuat formulir…</> : label}
        </Button>
      )}
      <span className="landing-action-note" role="status">
        {state === 'loading' ? 'Menyiapkan tautan formulir.' : state === 'error' ? 'Tautan belum dapat dimuat.' : href ? 'Tanpa akun aplikasi' : 'Formulir belum dibuka oleh penyelenggara.'}
      </span>
    </div>
  );
}

export default function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Landing | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let active = true;
    setState('loading');
    api('public/landing')
      .then((result: Landing) => {
        if (active) { setData(result); setState('ready'); }
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    let observer: IntersectionObserver | undefined;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-revealed', 'true');
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      pageRef.current?.querySelectorAll('.landing-reveal').forEach(element => observer?.observe(element));
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="landing-page" ref={pageRef}>
      <a className="landing-skip" href="#landing-main">Lewati ke konten</a>
      <header className={`landing-header${scrolled ? ' landing-header-scrolled' : ''}`}>
        <div className="landing-container landing-header-inner">
          <Link className="wordmark landing-brand" href="/" aria-label="HRP Insight, beranda">
            hrp<span>insight</span><span className="brand-square" aria-hidden="true" />
          </Link>
          <nav className="landing-nav" aria-label="Navigasi utama">
            <a href="#formulir">Formulir layanan</a><a href="#workspace">Workspace</a><a href="#privasi">Privasi</a>
          </nav>
          <Button asChild className="landing-button landing-header-login">
            <Link href="/ringkasan">Masuk<ArrowRight size={17} aria-hidden="true" /></Link>
          </Button>
        </div>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-container">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow">HAFECS Research &amp; Publication</span>
              <h1 id="landing-title">Kelola pelatihan<br />dan evaluasi tim.</h1>
              <p>Ajukan kebutuhan kegiatan, sampaikan masukan, dan kelola evaluasi pelatihan melalui HRP Insight.</p>
              <div className="landing-hero-actions">
                <Button asChild className="landing-button"><a href="#formulir">Lihat formulir<ArrowRight size={18} aria-hidden="true" /></a></Button>
                <Button asChild className="landing-button landing-button-secondary"><Link href="/ringkasan">Masuk ke workspace</Link></Button>
              </div>
              <p className="landing-hero-note"><Check size={15} aria-hidden="true" />Formulir dapat diisi tanpa login</p>
            </div>
            <section id="formulir" className="landing-form-hub landing-reveal" aria-labelledby="services-title" aria-busy={state === 'loading'}>
              <div className="landing-hub-top">
                <span><span className="landing-status-dot" aria-hidden="true" />HRP Insight</span>
                <span><LockKeyhole size={14} aria-hidden="true" />Layanan formulir</span>
              </div>
              <div className="landing-hub-content">
                <div className="landing-hub-heading">
                  <div><span className="landing-eyebrow">Mulai di sini</span><h2 id="services-title">Apa yang ingin Anda sampaikan?</h2></div>
                  <span className="landing-hub-caption">Pilih formulir sesuai kebutuhan Anda.</span>
                </div>
                {state === 'error' && (
                  <div className="landing-load-error">
                    <p role="alert">Formulir belum dapat dimuat. Silakan coba lagi.</p>
                    <Button className="landing-button landing-button-secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Coba lagi</Button>
                  </div>
                )}
                <div className="landing-service-grid">
                  <article id="pengajuan" className="landing-service landing-service-request" aria-labelledby="request-title">
                    <div className="landing-service-top"><span className="landing-icon landing-icon-blue"><CalendarDays size={24} aria-hidden="true" /></span><span>Bagi atasan</span></div>
                    <h3 id="request-title">Pengajuan kegiatan</h3>
                    <p>Ajukan kebutuhan pelatihan atau pengembangan tim kepada penyelenggara.</p>
                    <FormLink href={data?.request_url || ''} label="Ajukan kegiatan" state={state} />
                  </article>
                  <article id="masukan" className="landing-service landing-service-feedback" aria-labelledby="feedback-title">
                    <div className="landing-service-top"><span className="landing-icon landing-icon-purple"><MessagesSquare size={24} aria-hidden="true" /></span><span>Bagi peserta</span></div>
                    <h3 id="feedback-title">Saran dan masukan</h3>
                    <p>Sampaikan pengalaman, saran, dan masukan untuk evaluasi pelatihan.</p>
                    <FormLink href={data?.feedback_url || ''} label="Kirim masukan" state={state} secondary />
                  </article>
                </div>
              </div>
            </section>
            <div className="landing-hero-bottom"><span>Pelatihan</span><span>Survei</span><span>Asesmen</span></div>
          </div>
        </section>
        <section className="landing-overview landing-section landing-container landing-reveal" aria-labelledby="overview-title">
          <div className="landing-section-intro">
            <span className="landing-eyebrow">Alur kerja HRP</span>
            <h2 id="overview-title">Dari pengajuan<br />sampai evaluasi.</h2>
            <p>Kegiatan, formulir, dan hasil evaluasi tersusun dalam satu tempat untuk membantu tim HRP mengelola pelatihan.</p>
          </div>
          <div className="landing-capabilities">
            <article><ClipboardList size={26} aria-hidden="true" /><h3>Rekap kegiatan</h3><p>Catat informasi pelatihan, survei, dan asesmen dalam workspace pengelola.</p></article>
            <article><BarChart3 size={26} aria-hidden="true" /><h3>Respons dan analisis</h3><p>Lihat hasil evaluasi dan susun laporan yang dapat dicetak.</p></article>
            <article><ShieldCheck size={26} aria-hidden="true" /><h3>Privasi data</h3><p>Respons terenkripsi dengan masa simpan yang dapat diatur.</p></article>
          </div>
        </section>
        <section id="workspace" className="landing-workspace-section landing-section landing-container landing-split landing-reveal" aria-labelledby="workspace-title">
          <div className="landing-section-copy">
            <span className="landing-eyebrow">Untuk tim HRP</span>
            <h2 id="workspace-title">Kegiatan dan formulir.<br />Satu workspace.</h2>
            <p>Masuk untuk mengelola kegiatan, menyusun formulir, dan melihat hasil evaluasi pelatihan.</p>
            <ul className="landing-check-list">
              <li><Check size={17} aria-hidden="true" />Rekap informasi kegiatan</li>
              <li><Check size={17} aria-hidden="true" />Kelola formulir dan respons</li>
              <li><Check size={17} aria-hidden="true" />Lihat laporan evaluasi</li>
            </ul>
            <Button asChild className="landing-button"><Link href="/ringkasan">Masuk ke workspace<ArrowRight size={18} aria-hidden="true" /></Link></Button>
          </div>
          <div className="landing-workspace-visual">
            <div className="landing-workspace-card">
              <div className="landing-workspace-card-heading"><span className="landing-icon landing-icon-blue"><ClipboardList size={22} aria-hidden="true" /></span><div><span>HRP Insight</span><h3>Workspace pengelola</h3></div></div>
              <ul className="landing-module-list">
                <li><CalendarDays size={21} aria-hidden="true" /><div><strong>Rekap kegiatan</strong><span>Pelatihan, survei, dan asesmen</span></div></li>
                <li><FileText size={21} aria-hidden="true" /><div><strong>Formulir dan respons</strong><span>Instrumen dan hasil pengisian</span></div></li>
                <li><BarChart3 size={21} aria-hidden="true" /><div><strong>Laporan evaluasi</strong><span>Analisis untuk kegiatan berikutnya</span></div></li>
              </ul>
              <div className="landing-workspace-card-footer"><LockKeyhole size={15} aria-hidden="true" />Masuk dengan akun pengelola</div>
            </div>
            <div className="landing-floating-note"><span><Check size={16} aria-hidden="true" /></span>Kegiatan dan evaluasi, lebih teratur.</div>
          </div>
        </section>
        <section id="privasi" className="landing-privacy-section landing-section landing-container landing-split landing-reveal" aria-labelledby="privacy-title">
          <div className="landing-privacy-visual">
            <span className="landing-shield"><ShieldCheck size={44} strokeWidth={1.6} aria-hidden="true" /></span>
            <h3>Privasi dalam pengelolaan data</h3>
            <dl className="landing-privacy-list">
              <div><dt><LockKeyhole size={18} aria-hidden="true" />Respons</dt><dd>Terenkripsi</dd></div>
              <div><dt><CalendarDays size={18} aria-hidden="true" />Masa simpan</dt><dd>Dapat diatur</dd></div>
              <div><dt><KeyRound size={18} aria-hidden="true" />Workspace</dt><dd>Perlu login</dd></div>
            </dl>
          </div>
          <div className="landing-section-copy">
            <span className="landing-eyebrow">Privasi data</span>
            <h2 id="privacy-title">Data pelatihan<br />punya batas akses.</h2>
            <p>Peserta mengisi formulir melalui tautan yang dibagikan. Pengelolaan kegiatan dan respons dilakukan di workspace yang memerlukan akun.</p>
            <p>Respons disimpan dalam bentuk terenkripsi, dengan masa simpan yang dapat diatur oleh pengelola.</p>
            <a className="landing-text-link" href="#formulir">Lihat formulir yang tersedia<ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </section>
        <section className="landing-bottom-cta landing-reveal" aria-labelledby="cta-title">
          <div className="landing-container">
            <span className="landing-eyebrow">Formulir layanan HRP</span>
            <h2 id="cta-title">Ajukan kegiatan.<br />Sampaikan masukan.</h2>
            <p>Pilih formulir untuk kebutuhan pelatihan atau evaluasi kegiatan Anda.</p>
            <Button asChild className="landing-button"><a href="#formulir">Buka formulir layanan<ArrowRight size={18} aria-hidden="true" /></a></Button>
            <span className="landing-cta-note">Dapat diisi tanpa akun aplikasi.</span>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-top">
            <div className="landing-footer-brand">
              <Link className="wordmark landing-brand" href="/" aria-label="HRP Insight, beranda">hrp<span>insight</span><span className="brand-square" aria-hidden="true" /></Link>
              <p>Pengelolaan kegiatan dan<br />evaluasi pelatihan HRP.</p>
              <img src="/images/logo-hrp.jpg" alt="HAFECS Research & Publication" width={125} height={60} />
            </div>
            <nav aria-label="Formulir layanan"><h2>Formulir layanan</h2><a href="#pengajuan">Pengajuan kegiatan</a><a href="#masukan">Saran dan masukan</a></nav>
            <nav aria-label="Workspace HRP"><h2>HRP Insight</h2><a href="#workspace">Tentang workspace</a><a href="#privasi">Privasi data</a><Link href="/ringkasan">Masuk</Link></nav>
          </div>
          <div className="landing-footer-bottom"><span>{data?.name || 'HAFECS Research & Publication'}</span><a href="#landing-main">Kembali ke atas<ArrowUpRight size={14} aria-hidden="true" /></a></div>
        </div>
      </footer>
    </div>
  );
}
