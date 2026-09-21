# Menjalankan HRP Insight di Windows

Paket ini memiliki setup database dan admin lokal. Gunakan Node.js 22.13 atau lebih baru. Ekstrak ZIP lalu buka CMD pada folder yang berisi package.json. Hentikan server versi lama dengan Ctrl+C terlebih dahulu.

Jika memperbarui folder lama, salin source dari ZIP ini ke folder proyek lama. Jangan menghapus .wrangler atau .dev.vars jika sudah berisi data. Dependency tidak berubah sehingga node_modules yang instalasinya sudah selesai dapat dipertahankan.

Jika ini folder baru, pasang dependency:

```bat
npm ci --registry=https://registry.npmjs.org/ --fetch-retries=5 --fetch-timeout=300000
```

Siapkan aplikasi sekali saja:

```bat
npm run setup:local
```

Isi nama dan username administrator saat diminta di terminal. Setup menampilkan sandi sementara acak satu kali. Simpan secara privat. Pendaftaran admin melalui browser tetap dinonaktifkan untuk penggunaan lokal. Tidak diperlukan akun Cloudflare, email, atau token hosting.

Kemudian jalankan:

```bat
npm run dev
```

### (Opsional) Mengisi data contoh

Untuk melihat aplikasi dengan data contoh kegiatan, formulir, respons, template, dan laporan, jalankan sekali saja setelah setup:

```bat
npm run seed:dummy
```

Perintah ini menghapus dan menyusun ulang data bisnis lokal (kegiatan, formulir, respons, template, Bantuan & Masukan, audit) lalu mengisi sekitar 15 kegiatan, 29 formulir, dan ribuan respons contoh yang deterministik. Tidak ada akun demo tambahan yang dibuat: akun yang ada (`hrp-admin`, `hrp-ira`) tetap berlaku dengan sandi tidak berubah dan akun ber-role staf diberi akses semua kegiatan contoh. Data contoh hanya ditulis ke database lokal; situs online tidak pernah menerima data contoh. Setelah seed, jalankan `npm run dev` seperti biasa.

Buka http://localhost:5173. Gunakan alamat ini persis, bukan 127.0.0.1, karena validasi Origin harus sesuai. Masuk menggunakan akun yang dibuat di terminal, lalu ganti sandi sementara pada halaman akun. Server hanya mendengarkan localhost. Tutup server dengan Ctrl+C; untuk penggunaan berikutnya cukup npm run dev.

Setup dapat dijalankan ulang. Migrasi yang sudah diterapkan akan dilewati dan akun yang sudah ada tidak diganti. Setup menolak mengganti kunci yang hilang ketika database sudah berisi akun. Data lokal berbeda dari data situs online dan tidak disinkronkan.

Database dan file unggahan tersimpan di .wrangler/state. Kunci enkripsi tersimpan di .dev.vars, bukan source yang dibagikan. Saat membuat cadangan, hentikan server lalu salin keduanya bersama-sama ke lokasi privat. Kehilangan .dev.vars dapat membuat data terenkripsi tidak dapat dibuka. Jangan mengunggah kedua lokasi tersebut ke Git atau membagikannya bersama source.

Jika muncul error port 5173 sedang dipakai, hentikan server sebelumnya. Port tidak akan berpindah otomatis agar konfigurasi Origin tetap tepat. Jika instalasi menunjukkan ECONNRESET, koneksi unduhan terputus; coba jaringan lain. EPERM saat pemasangan biasanya berarti file dependency sedang terkunci, jadi tutup proses proyek atau restart Windows sebelum mencoba ulang. Tidak perlu menghapus package-lock.json.

Perbaikan ini diuji melalui API backend dengan penyimpanan lokal nyata di Linux, termasuk migrasi berulang, login admin, dan persistensi unggahan. Belum diuji langsung di Windows atau melalui interaksi browser. Konfigurasi hosting dan pembatasan akses produksi tidak diubah oleh setup lokal.
