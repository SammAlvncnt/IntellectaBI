# IntellectaBI 🚀 | Self-Service AI-Powered BI & Analytics Dashboard

IntellectaBI adalah platform **Self-Service Business Intelligence (BI) & Analytics** modern yang ditenagai oleh kecerdasan buatan tingkat lanjut (**Google Gemini AI / Gemini 3.5 Flash**). Platform ini dirancang untuk mendemokratisasi analisis data—mengubah file mentah CSV biasa menjadi ekosistem dasbor interaktif, visual, dan berwawasan strategis tingkat direksi (*Executive-Ready*) hanya dalam hitungan detik.

Aplikasi ini dibangun menggunakan arsitektur full-stack modern yang sangat fleksibel: berjalan sebagai aplikasi Express-Vite terintegrasi di lingkungan lokal/container (Cloud Run) dan bertransformasi secara mulus (*seamless hybrid transition*) menjadi arsitektur Serverless-ready ketika dideploy ke Vercel.

---

## 🌟 Pilar Fitur Utama (Core Features)

### 1. **AI-Powered Data Scientist & Consulting Engine**
*   **Multi-Dimensional Exploratory Data Analysis (EDA):** AI tidak hanya meringkas totalitas data, melainkan membedah korelasi tersembunyi antar dimensi secara silang (misal: performa produk X di wilayah Y pada jam sibuk).
*   **Executive Strategic Narrative:** Menyajikan analisis mendalam yang dibagi menjadi 3 level keputusan bisnis terstruktur:
    *   **Level Operasional:** Menjelaskan apa yang sedang terjadi di lapangan (*What happened*).
    *   **Level Taktis:** Mengungkap alasan mengapa tren tersebut terbentuk (*Why it happened*).
    *   **Level Strategis:** Memberikan rekomendasi nyata dan taktis bagi CEO/Direksi (*Actionable feedback*).
*   **Dynamic Auto-Formatting KPI:** Mendeteksi orkestrasi nilai secara otomatis. Meliputi pemformatan mata uang (Rupiah/Rp), persentase, desimal, hingga penyematan singkatan unit pintar (`M` untuk Jutaan, `k` untuk Ribuan, `B` untuk Milyar).

### 2. **Self-Service BI & Dynamic Customization**
Grafik dan metrik yang dihasilan oleh AI bersifat interaktif sepenuhnya, bukan sekadar gambar statis:
*   **Dynamic Chart Reconstruction:** Pengguna dapat mengganti dimensi sumbu X (kategorikal/waktu) dan sumbu Y (metrik numerik) secara dinamis menggunakan daftar kolom valid (`available_x_fields` & `available_y_fields`) yang dipetakan oleh AI.
*   **Flexible Visualization Types:** Mengubah visualisasi grafik dalam sekejap ke berbagai tipe: *Bar Chart, Line Chart, Pie Chart, Doughnut Chart, dan Area Chart*.
*   **KPI Recalculation Engine:** Mengubah metrik kolom dan tipe agregasi data (*SUM, AVERAGE, COUNT*) secara dinamis dari pilihan metrik angka yang relevan (`kpi_options`).
*   **Full Data Preview:** Akses transparansi data penuh lewat tabel interaktif data mentah (CSV) langsung dari navbar dasbor.

### 3. **State-Safe JSON Parsing (Anti-Crash Architecture)**
*   Dibuat khusus untuk mengatasi masalah legendaris parsing JSON pada integrasi LLM (misalnya error `Unexpected token T, "The page..."`).
*   Mengimplementasikan filter pra-proses regex dan deteksi kurung kurawal terluar (*outermost curly braces locator*) untuk mengekstraksi struktur objek JSON murni meskipun model AI mengirimkan teks pengantar (*preamble* atau markdown block ```json).

### 4. **Cloud-Sync & History Session Management**
*   **Suggested Session Naming:** AI secara otomatis memberikan rekomendasi nama sesi analitik yang sangat representatif berdasarkan data yang diunggah (misal: "Analisis Penjualan Q3 - Cabang Jakarta").
*   **Dynamic Session States:** Mendukung navigasi sidebar interaktif untuk memuat kembali dasbor historis dari cloud secara instan.
*   **Firebase Authentication & Firestore Sync:** Menyalin data sesi analisis pengguna secara real-time ke **Google Cloud Firestore** untuk pengguna terautentikasi.
*   **No-Cost Sandbox Mode:** Jika pengguna belum login, dasbor tetap dapat berjalan lancar menggunakan restu memori browser (*LocalStorage*) sebagai cadangan tangguh (*graceful fallback*).

---

## 🛠️ Arsitektur & Teknologi Stack

### Frontend (Client SPA)
*   **React 19 & Webpack/Vite 6:** Menjamin render super cepat, ukuran bundle minimal, dan siklus pengembangan yang optimal.
*   **Tailwind CSS (v4 Engine):** Penuh kebebasan desain visual menggunakan utilitas kustom modern tanpa beban berat konfigurasi PostCSS lama.
*   **Chart.js & React-Chartjs-2:** Library visualisasi data kelas dunia yang responsif, berkinerja tinggi, dan interaktif.
*   **Motion (Framer Motion API):** Animasi transisi masuk halaman, pergantian tab, dan perubahan konfigurasi grafik yang cair dan natural.
*   **PapaParse:** Parser CSV berbasis peramban (*client-side*) tangguh yang mampu menangani file ratusan ribu baris dengan memori yang aman.
*   **Lucide React:** Paket ikon bergaya minimalis dan modern untuk kejelasan fungsi UI.

### Backend (API & Middleware)
*   **Node.js & TypeScript:** Menjamin keselamatan tipe data (*type safety*) di hulu hingga hilir pengembangan.
*   **Express.js (Local/Container Runtime):** Server penampung requests lokal yang mengintegrasikan Vite Middleware untuk melayani hot-reloading di port `3000`.
*   **Esbuild Bundling (CJS Output):** Menyusun file `server.ts` menjadi file tunggal `/dist/server.cjs` yang memangkas waktu start container dan menyembuhkan problem ESM import Node di Cloud Run.
*   **Google Gen AI SDK (`@google/genai`):** SDK generasi terbaru Google yang sangat efisien untuk berkomunikasi secara asinkron dengan API Gemini.
*   **Vercel Serverless Functions (`/api/*` routing):** Modul handler serverless terpisah yang siap digunakan di Vercel, lengkap dengan penanganan CORS preflight requests yang aman.

---

## 📂 Struktur Direktori Proyek

```bash
├── api/
│   └── analyze.ts             # Serverless API Handler khusus untuk platform Vercel
├── src/
│   ├── components/            # Komponen UI modular (Visual Charts, KPI Cards, Sidebar, dsb.)
│   ├── App.tsx                # Komponen inti, router visual, dan logika pusat aplikasi
│   ├── index.css              # Entrypoint CSS Tailwind v4
│   ├── main.tsx               # Point Inisialisasi React ke DOM
│   └── types.ts               # Kamus global definisi tipe data TypeScript (BI & Session)
├── public/                    # Aset publik statis
├── server.ts                  # Server Express utama untuk lari lokal dan Cloud Run container
├── vercel.json                # Konfigurasi routing rewrite khusus untuk deployment Vercel
├── vite.config.ts             # Konfigurasi bundler Vite 6
├── tsconfig.json              # Konfigurasi kompilator TypeScript
├── package.json               # Daftar Dependensi dan script pipeline
└── .env.example               # Contoh penyiapan variabel lingkungan (Environment Variables)
```

---

## 🔧 Panduan Instalasi Lokal & Penggunaan

### 1. Prasyarat (*Prerequisites*)
Pastikan Anda sudah menginstal:
*   [Node.js](https://nodejs.org/) (Sangat direkomendasikan versi 18 atau lebih tinggi)
*   NPM (Disertakan bersama instalasi Node.js)

### 2. Kloning Repositori
```bash
git clone https://github.com/USERNAME_ANDA/REPOSITORI_ANDA.git
cd REPOSITORI_ANDA
```

### 3. Instalasi Dependensi
```bash
npm install
```

### 4. Konfigurasi Variabel Lingkungan (*Environment Variables*)
Buat file bernama `.env` di direktori utama (sejajar dengan `package.json`):
```env
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere...
```
*(Dapatkan kunci API Anda secara gratis di [Google AI Studio](https://aistudio.google.com/))*

### 5. Menjalankan Aplikasi di Lokal (Mode Pengembangan)
```bash
npm run dev
```
Buka peramban Anda dan arahkan ke alamat `http://localhost:3000`. Server lokal akan langsung memuat aplikasi, mendeteksi perubahan file secara real-time, dan mem-proxy panggilan `/api/analyze` langsung ke controller di `server.ts`.

### 6. Proses Kompilasi Produksi (Build)
```bash
npm run build
```
Proses ini akan mengompilasi bundel statis React ke folder `/dist` dan mem-bundel server asisten TypeScript ke `/dist/server.cjs` menggunakan `esbuild`.

### 7. Menjalankan Hasil Build Produksi
```bash
npm run start
```

---

## 🚀 Panduan Deployment Ke Vercel

IntellectaBI telah dioptimalkan secara mendalam menggunakan konfigurasi khusus agar dapat dideploy ke **Vercel** hanya dengan beberapa klik tanpa mengalami error `404 NOT FOUND` pada rute statis ataupun rute API API-nya.

### Langkah-langkah Deployment:

1.  **Daftarkan Akun/Masuk ke Platform Vercel:** Silakan mengunjungi [Vercel](https://vercel.com).
2.  **Impor Github Repositori Anda:** Sambungkan akun GitHub Anda, pilih repositori IntellectaBI, lalu muat proyek tersebut.
3.  **Konfigurasi Proyek di Vercel:**
    *   **Framework Preset:** Pilih `Vite` atau biarkan deteksi `Other`.
    *   **Root Directory:** Tetapkan di tingkat dasar (`./` atau biarkan default).
    *   **Build & Development Settings:** Biarkan sesuai bawaan sistem (Vercel secara otomatis mendeteksi script `build` dari `package.json` dan memanfaatkannya).
4.  **Daftarkan Environment Variables di Vercel Dashboard:**
    *   Buka bagian **Environment Variables** di dashboard konfigurasi proyek Vercel Anda.
    *   Tambahkan variabel lingkungan baru:
        *   **Key:** `GEMINI_API_KEY`
        *   **Value:** `AIzaSy...` (Isi dengan token Google Gemini API Key Anda).
5.  **Klik tombol Deploy:** Selesai! Proyek Anda akan langsung mengudara di alamat subdomain gratis Vercel (misal: `https://intellecta-bi.vercel.app`).

### Mengapa Dasbor Vercel Tidak Akan Mengalami Masalah `NOT_FOUND` atau `Method Not Allowed`?
*   **Unified Rewrite (`vercel.json`):** Kami telah melampirkan aturan rewrite di `vercel.json` untuk meneruskan seluruh panggilan berawalan `/api/(.*)` ke folder `/api/` (yang dikendalikan oleh serverless handler Vercel Node), namun rute navigasi aplikasi browser lainnya akan diputar secara otomatis kembali ke `/index.html`. Ini mencegah kesalahan kembalian `NOT_FOUND` yang umumnya dialami oleh arsitektur Single Page Application (SPA).
*   **Dedicated API Handler (`/api/analyze.ts`):** File `/api/analyze.ts` dikonfigurasi menggunakan standar performa eksekusi serverless tingkat tinggi dengan dukungan parsing JSON modular yang tangguh terhadap kotoran data pengantar non-JSON dari AI.

---

## 🔒 Firebase Security & Domain Whitelisting (PENTING untuk Autentikasi Cloud)

Jika Anda melihat error akses autentikasi saat melakukan registrasi atau masuk (*login*) lewat tautan domain Vercel Anda, ini disebabkan karena platform keamanan Google belum mengenal domain produksi Vercel Anda.

### Cara Melakukan Verifikasi Domain di Firebase / Google Cloud:

1.  Buka [Google Cloud Console](https://console.cloud.google.com/) atau [Firebase Console](https://console.firebase.google.com/).
2.  Pilih proyek Firebase yang selaras dengan aplikasi IntellectaBI Anda.
3.  Jika menggunakan **Firebase Console:**
    *   Masuk ke menu **Authentication** di panel samping kiri komputer Anda.
    *   Pilih tab **Settings** (biasanya berada di sebelah kanan tab *Users* / *Templates*).
    *   Gulir ke bawah hingga menemukan menu kolom **Authorized Domains**.
    *   Klik tombol **Add Domain**, lalu masukkan nama host domain Vercel Anda (misal: `intellecta-bi.vercel.app` — *tanpa `https://` atau tanda garis miring di akhir*).
4.  Jika menggunakan **Google Cloud Console (Identity Platform):**
    *   Ketik "**Identity Platform**" atau "**Aplikasi Google OAuth**" pada bilah pencarian paling atas.
    *   Masuk ke menu **Settings** pada panel samping navigasi.
    *   Masuk ke tab **Security** / **Authorized Domains**.
    *   Tambahkan tautan domain Vercel baru Anda di sana dan tekan simpan.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah lisensi **MIT**. Silakan digunakan, dimodifikasi, dan didistribusikan secara bebas untuk kebutuhan komersial, akademis, maupun personal.

---

<ctrl94> Ditulis dengan dedikasi tinggi oleh tim pengembang **IntellectaBI**. Nikmati kenyamanan melakukan analisis data modern secara cerdas dengan balutan kecerdasan buatan kelas dunia. 📈⚡
