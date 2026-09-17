import { z } from 'zod';
export const PROGRAMS = ['IHT', 'TLC', 'Bootcamp', 'Elevate Class', 'ACCEL', 'Training', 'Kolaborasi', 'Open Class', 'Research Academy', 'Lainnya'] as const;
export const STATUSES = ['Rencana', 'Berlangsung', 'Selesai', 'Dibatalkan'] as const;
export const FORM_TYPES = [['kebutuhan', 'Survei Kebutuhan'], ['pretest', 'Pre-test'], ['posttest', 'Post-test'], ['pra_sesi', 'Pra-Sesi'], ['pasca_sesi', 'Pasca-Sesi'], ['evaluasi', 'Evaluasi Kegiatan'], ['tindak_lanjut', 'Tindak Lanjut'], ['lainnya', 'Survei Lainnya']];
export const QUESTION_TYPES = [['short_text', 'Teks singkat'], ['long_text', 'Paragraf'], ['number', 'Angka'], ['single_choice', 'Pilihan ganda'], ['multiple_choice', 'Checkbox'], ['likert', 'Skala Likert'], ['yes_no', 'Ya / Tidak'], ['section', 'Judul & deskripsi'], ['pagebreak', 'Bagian baru']];
export const questionSchema = z.object({ id: z.string().min(1).max(80), type: z.enum(['short_text', 'long_text', 'number', 'single_choice', 'multiple_choice', 'likert', 'yes_no', 'section', 'pagebreak']), label: z.string().trim().min(1).max(2000), help: z.string().max(3000).default(''), rich: z.array(z.object({ text: z.string().max(2000), bold: z.boolean().optional(), italic: z.boolean().optional(), underline: z.boolean().optional(), href: z.string().url().max(2000).refine(v => v.startsWith('https://') || v.startsWith('http://')).optional() })).max(200).optional(), required: z.boolean().default(true), options: z.array(z.string().trim().min(1).max(300)).max(40).default([]), scale: z.number().int().min(3).max(10).default(5), allowOther: z.boolean().default(false), scored: z.boolean().default(false), correctAnswer: z.string().max(300).optional(), multiCorrect: z.array(z.string().max(300)).max(40).default([]), weight: z.number().min(0.01).max(1000).default(1), mediaId: z.string().max(80).optional() });
export type Question = z.infer<typeof questionSchema>;
export type Answer = string | string[];
export type Training = {
    id: string;
    name: string;
    program: string;
    status: string;
    start_date: string;
    end_date: string;
    location: string;
    facilitator: string;
    details: Record<string, string | number>;
    version: number;
    created_by: string;
    form_count: number;
    response_count: number;
    banner?: boolean;
    created_at: string;
};
export type FormRecord = {
    id: string;
    training_id: string;
    training_name?: string;
    title: string;
    type: string;
    description: string;
    questions: Question[];
    status: string;
    pair_question_id: string | null;
    version: number;
    revision: number;
    locked_at: string | null;
    expires_at: string | null;
    share_code?: string;
    response_count: number;
    updated_at: string;
};
export type Member = {
    id: string;
    username: string;
    must_change_password?: number;
    totp_enabled?: boolean;
    name: string;
    role: 'admin' | 'staff' | 'analyst';
    active: number;
};
export function newQuestion(type = 'short_text'): Question { return { id: crypto.randomUUID(), type: type as Question['type'], label: '', help: '', required: !['section', 'pagebreak'].includes(type), options: ['single_choice', 'multiple_choice'].includes(type) ? ['Opsi 1', 'Opsi 2'] : [], scale: 5, allowOther: false, scored: false, multiCorrect: [], weight: 1 }; }
export function cleanQuestions(input: unknown): Question[] { const qs = z.array(questionSchema).max(100).parse(input); if (new Set(qs.map(q => q.id)).size !== qs.length)
    throw new Error('ID pertanyaan harus unik.'); for (const q of qs) {
    if (q.rich?.length && q.rich.map(s => s.text).join('').trim() !== q.label)
        throw new Error('Teks dan format pertanyaan tidak sesuai.');
    if (q.rich && q.rich.reduce((n, s) => n + s.text.length, 0) > 2000)
        throw new Error('Teks pertanyaan terlalu panjang.');
    if (['single_choice', 'multiple_choice'].includes(q.type) && (q.options.length < 2 || new Set(q.options).size !== q.options.length))
        throw new Error('Pilihan jawaban minimal dua dan tidak boleh berulang.');
    if (q.scored) {
        if (!['single_choice', 'multiple_choice', 'yes_no'].includes(q.type))
            throw new Error('Skor otomatis hanya untuk pilihan ganda, checkbox, atau Ya/Tidak.');
        const opts = q.type === 'yes_no' ? ['Ya', 'Tidak'] : q.options;
        if (q.type === 'multiple_choice' ? (!q.multiCorrect.length || q.multiCorrect.some(v => !opts.includes(v))) : (!q.correctAnswer || !opts.includes(q.correctAnswer)))
            throw new Error('Lengkapi kunci jawaban dari opsi yang tersedia.');
    }
} return qs; }
export function publicQuestions(qs: Question[]) { return qs.map(({ correctAnswer, multiCorrect, weight, scored, ...q }) => q); }
export function validateAnswers(qs: Question[], raw: unknown): Record<string, Answer> { const answers = z.record(z.union([z.string().max(10000), z.array(z.string().max(500)).max(40)])).parse(raw); const out: Record<string, Answer> = {}; for (const q of qs.filter(q => !['section', 'pagebreak'].includes(q.type))) {
    const v = answers[q.id];
    const empty = v === undefined || (typeof v === 'string' ? !v.trim() : !v.length);
    if (empty) {
        if (q.required)
            throw new Error(`Lengkapi jawaban: ${q.label}`);
        continue;
    }
    const validOption = (s: string) => q.options.includes(s) || (q.allowOther && s.startsWith('__other__:') && !!s.slice(10).trim());
    if (q.type === 'multiple_choice') {
        if (!Array.isArray(v) || new Set(v).size !== v.length || v.some(s => !validOption(s)))
            throw new Error(`Pilihan tidak valid: ${q.label}`);
    }
    else {
        if (typeof v !== 'string')
            throw new Error(`Jawaban tidak valid: ${q.label}`);
        if (q.type === 'single_choice' && !validOption(v))
            throw new Error(`Pilihan tidak valid: ${q.label}`);
        if (q.type === 'yes_no' && !['Ya', 'Tidak'].includes(v))
            throw new Error(`Pilihan tidak valid: ${q.label}`);
        if (q.type === 'number' && (!Number.isFinite(Number(v)) || Math.abs(Number(v)) > 1e12))
            throw new Error(`Angka tidak valid: ${q.label}`);
        if (q.type === 'likert' && (!Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > q.scale))
            throw new Error(`Skala tidak valid: ${q.label}`);
    }
    out[q.id] = v;
} return out; }
export function computeScore(qs: Question[], answers: Record<string, Answer>) { let score = 0, max = 0; for (const q of qs.filter(q => q.scored)) {
    max += q.weight;
    const v = answers[q.id];
    const correct = q.type === 'multiple_choice' ? Array.isArray(v) && new Set(v).size === new Set(q.multiCorrect).size && q.multiCorrect.every(a => v.includes(a)) : v === q.correctAnswer;
    if (correct)
        score += q.weight;
} return { score: max ? score : null, max_score: max || null }; }
export function csvCell(value: unknown) { let s = String(value ?? ''); if (/^[\s]*[=+@\-\t\r]/.test(s))
    s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }
export function csv(rows: unknown[][]) { return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'); }
export const mean = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 100) / 100 : null;
export const normalize = (s: string) => s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
export function splitPages(questions: Question[]) { const pages: {
    title: string;
    description: string;
    questions: Question[];
}[] = [{ title: "Bagian 1", description: "", questions: [] }]; for (const q of questions) {
    if (q.type === "pagebreak")
        pages.push({ title: q.label, description: q.help, questions: [] });
    else
        pages[pages.length - 1].questions.push(q);
} return pages; }
