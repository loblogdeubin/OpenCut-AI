# Master PRD — OpenCut AI Rough Cut Assistant

**Status:** Implementasi aktif — Milestone 1 selesai  
**Versi:** 1.1  
**Tanggal:** 29 Agustus 2026  
**Pemilik produk:** Loblogdeubin  
**Basis proyek:** Fork OpenCut untuk penggunaan pribadi  
**Target rilis pertama:** Desktop/web lokal di macOS  

## 1. Ringkasan keputusan

Produk ini membantu pengguna mengubah banyak footage lokal menjadi satu rough cut utuh melalui percakapan. Pengguna mengimpor footage, menjelaskan hasil yang diinginkan, menerima rencana edit, menyetujui rencana tersebut, meninjau hasil di timeline OpenCut, lalu mengekspor video.

Keputusan teknis utama:

1. Rilis pertama dibangun di atas `opencut-classic`, bukan repository rewrite terbaru.
2. Semua operasi editor dibungkus dalam `Editor Adapter` agar kelak dapat dipindahkan ke Editor API/Rust core OpenCut terbaru.
3. Footage asli, proxy, transkrip, dan proses render disimpan serta dijalankan lokal secara default.
4. ChatGPT Plus digunakan sebagai antarmuka reasoning melalui remote MCP apabila custom MCP tersedia pada akun pengguna.
5. ChatGPT tidak menerima akses file-system umum. MCP hanya mengekspos proyek dan operasi editor yang sudah diizinkan.
6. Semua perubahan timeline bersifat previewable, transactional, dapat di-undo, dan membutuhkan approval sebelum diterapkan.
7. Rilis pertama menghasilkan rough cut berkualitas untuk direview, bukan menjanjikan final edit tanpa intervensi manusia.

### Alasan memilih `opencut-classic` untuk MVP

Snapshot repository pada 28 Agustus 2026 menunjukkan:

- Repository `OpenCut-app/OpenCut` terbaru masih merupakan rewrite awal.
- Web editor masih menampilkan `Coming soon`.
- API baru menyediakan health check dan echo.
- Desktop timeline masih berupa placeholder.
- Repository `opencut-classic` sudah memiliki project store, media processing, timeline manager, command pattern, split/update/delete element, undo-related command structure, preview, dan export surface.

Konsekuensinya, `opencut-classic` memberi jalur tercepat menuju produk yang dapat dipakai. Karena repository tersebut sudah diarsipkan, semua integrasi AI harus ditempatkan di lapisan adapter dan tidak mengikat domain AI langsung ke store lama.

## 2. Visi produk

> Mengubah kumpulan footage mentah menjadi rough cut yang koheren melalui instruksi bahasa alami, tanpa menyerahkan kontrol kreatif atau file asli kepada sistem cloud.

Contoh hasil yang diharapkan:

> “Dari semua footage ini, buat video highlight maksimal tiga menit. Pilih take terbaik, hapus bagian diam, salah bicara, blur, dan duplikat. Buat pembuka yang kuat, susun isi secara kronologis, tambahkan subtitle Bahasa Indonesia, kecilkan musik ketika ada dialog, dan tampilkan preview sebelum export.”

## 3. Masalah yang diselesaikan

Mengedit banyak footage memerlukan waktu besar untuk:

- menonton seluruh materi;
- menemukan bagian relevan;
- membuang silence, salah bicara, blur, dan duplikat;
- menyusun cerita;
- menormalisasi audio;
- membuat subtitle;
- mengubah rasio output;
- mengekspor versi pertama untuk direview.

OpenCut sudah menyediakan fondasi editor, tetapi belum menyediakan workflow percakapan yang memahami media dan mengubah intent menjadi operasi timeline yang aman.

## 4. Tujuan dan ukuran keberhasilan

### 4.1 Tujuan MVP

- Mengimpor sekurangnya 20 footage dalam satu proyek.
- Membuat indeks media lokal tanpa memodifikasi file sumber.
- Membuat transkrip dengan timestamp.
- Mendeteksi scene dan bagian diam.
- Menghasilkan edit plan dari prompt.
- Menerapkan edit plan secara atomik ke timeline.
- Menampilkan before/after summary dan preview.
- Menyediakan undo satu langkah untuk keseluruhan aksi AI.
- Mengekspor rough cut ke MP4.
- Memungkinkan ChatGPT Plus mengontrol proyek lewat MCP apabila fitur custom MCP tersedia.

### 4.2 North-star metric

**Time to acceptable rough cut:** waktu sejak footage selesai diimpor sampai pengguna menyatakan rough cut layak dilanjutkan.

Target MVP internal:

- proyek uji 20 clip / total 60 menit menghasilkan draft pertama dalam maksimal 20 menit pada perangkat target;
- pengguna mempertahankan minimal 70% susunan hasil AI setelah review pertama;
- tidak ada perubahan destruktif pada footage sumber;
- 100% aksi AI dapat di-undo tanpa kerusakan project state.

### 4.3 Metrik pendukung

- waktu indexing per menit footage;
- rasio transcript coverage;
- persentase edit plan yang lolos validasi;
- jumlah koreksi manual setelah draft;
- kegagalan render;
- crash-free session;
- jumlah operasi AI yang dibatalkan saat approval;
- penggunaan jaringan per proyek.

## 5. Pengguna sasaran

### Persona utama

Pemilik proyek yang memiliki banyak footage dan ingin memperoleh rough cut dengan cepat tanpa mempelajari workflow editor kompleks.

Kebutuhan utama:

- perintah dalam Bahasa Indonesia;
- footage tetap lokal;
- dapat melihat alasan clip dipilih atau dibuang;
- dapat mengunci clip wajib;
- dapat memperbaiki hasil melalui prompt lanjutan;
- tidak dikenai biaya OpenAI API ketika mode ChatGPT Plus + MCP digunakan;
- dapat kembali ke state sebelum edit AI.

### Persona sekunder

Editor yang ingin AI melakukan pekerjaan mekanis: silence removal, transcript search, rough sequencing, caption draft, aspect-ratio conversion, dan audio ducking.

## 6. Scope produk

### 6.1 In scope untuk MVP

- proyek lokal tunggal;
- media video dan audio lokal;
- import banyak file;
- proxy dan thumbnail lokal;
- metadata melalui `ffprobe`;
- scene boundary detection;
- silence detection;
- transkripsi Bahasa Indonesia dan Inggris;
- pencarian transkrip;
- pemilihan take berdasarkan transcript, silence, duplikasi, dan quality signals dasar;
- trim, split, insert, delete, move, dan reorder clip;
- lock/pin clip yang wajib dipertahankan;
- aspect ratio 16:9, 9:16, dan 1:1;
- subtitle dari transkrip;
- audio ducking sederhana;
- edit-plan preview;
- approval;
- atomic apply;
- undo;
- export MP4 H.264/AAC;
- MCP read tools dan write tools;
- autentikasi perangkat untuk remote MCP gateway;
- log audit lokal.

### 6.2 Out of scope MVP

- generative video atau text-to-video;
- face replacement, generative fill, dan background generation;
- color grading sinematik otomatis;
- multi-user collaboration;
- cloud storage footage penuh;
- mobile editor;
- frame-accurate semantic understanding untuk semua jenis adegan;
- lisensi musik otomatis;
- publikasi langsung ke YouTube/TikTok/Instagram;
- edit final tanpa review manusia;
- pembayaran dan akun multi-tenant.

## 7. Prinsip produk

1. **Local first:** media asli tidak keluar dari perangkat secara default.
2. **Plan before action:** AI harus membuat rencana sebelum mutasi timeline.
3. **Human approval:** write operation berisiko membutuhkan persetujuan.
4. **Reversible:** satu permintaan pengguna menjadi satu transaction yang dapat di-undo.
5. **Source immutable:** footage sumber bersifat read-only.
6. **Explainable selection:** pengguna dapat melihat mengapa segmen dipakai atau dibuang.
7. **Provider independent:** domain editing tidak bergantung pada ChatGPT atau model tertentu.
8. **Graceful fallback:** kegagalan AI tidak boleh merusak timeline atau mencegah edit manual.

## 8. User journey utama

### 8.1 Onboarding

1. Pengguna membuka aplikasi.
2. Aplikasi memeriksa FFmpeg/ffprobe, kapasitas disk, dan kemampuan transkripsi.
3. Pengguna memilih mode AI:
   - ChatGPT Plus melalui MCP;
   - local model;
   - OpenAI API sebagai opsi masa depan.
4. Untuk ChatGPT Plus, pengguna memasangkan perangkat dengan remote MCP gateway.
5. Aplikasi menjalankan connection test tanpa membuka proyek atau file pribadi.

### 8.2 Import dan indexing

1. Pengguna membuat proyek.
2. Pengguna memilih folder/file footage.
3. OpenCut mencatat referensi file dan checksum; tidak menyalin file sumber tanpa kebutuhan.
4. Background worker membuat proxy, waveform, thumbnail, scene boundary, silence ranges, dan transkrip.
5. UI menampilkan progress per file serta kegagalan yang dapat di-retry.

### 8.3 Membuat rough cut

1. Pengguna menandai clip wajib atau clip terlarang bila diperlukan.
2. Pengguna memberi prompt.
3. ChatGPT membaca project summary, media manifest, transcript summary, serta batasan proyek melalui MCP read tools.
4. ChatGPT menghasilkan `EditPlan` terstruktur.
5. Local validator memeriksa media ID, time range, overlap, durasi, track, revision, dan batasan pengguna.
6. UI menampilkan:
   - estimasi durasi hasil;
   - clip yang digunakan;
   - segmen yang dibuang;
   - alasan pemilihan;
   - perubahan audio/caption/aspect ratio;
   - peringatan.
7. Pengguna memilih Apply, Revise, atau Cancel.
8. Jika Apply, seluruh plan dijalankan sebagai satu transaction.
9. Pengguna melihat timeline dan preview.

### 8.4 Revisi percakapan

Contoh:

- “Pembukanya kurang kuat, gunakan cuplikan drone.”
- “Pertahankan wawancara Ibu Rina secara lengkap.”
- “Pendekkan menjadi 60 detik tanpa menghilangkan kesimpulan.”
- “Undo perubahan terakhir.”

Setiap revisi menggunakan `project_revision` terbaru dan menghasilkan plan baru.

### 8.5 Export

1. Pengguna memilih preset export.
2. Sistem menjalankan preflight check.
3. Pengguna menyetujui render.
4. Render dijalankan lokal dengan progress dan log.
5. Hasil disimpan ke lokasi yang dipilih pengguna.

## 9. Functional requirements

### FR-01 — Project dan media import

- Sistem harus mendukung multi-select file dan import folder.
- Sistem harus menyimpan URI lokal, ukuran, checksum, codec, resolusi, FPS, duration, dan audio-stream metadata.
- File sumber tidak boleh ditulis atau dipindahkan.
- Missing media harus terdeteksi dan dapat di-relink.

**Acceptance:** 20 file dapat diimpor, ditutup, dibuka kembali, dan seluruh referensi tetap valid.

### FR-02 — Local media indexing

- Sistem membuat proxy opsional, thumbnail, waveform, transcript, scene ranges, silence ranges, dan quality signals.
- Indexing berjalan sebagai background job yang dapat pause, resume, cancel, dan retry.
- Artifact indexing memiliki versi pipeline agar dapat dibuat ulang setelah algoritma berubah.

**Acceptance:** crash aplikasi di tengah indexing tidak merusak proyek dan job dapat dilanjutkan.

### FR-03 — Transcript

- Transcript berisi `media_id`, `start_ms`, `end_ms`, `speaker?`, `text`, dan confidence.
- Pengguna dapat mencari frasa dan melompat ke timestamp.
- Pengguna dapat mengoreksi teks tanpa mengubah timestamp sumber secara tidak sengaja.

**Acceptance:** pencarian sebuah frasa mengembalikan clip dan time range yang benar.

### FR-04 — Prompt workspace

- UI menyediakan prompt box, prompt history, status tool call, dan hasil rencana.
- Pengguna dapat menyebut clip menggunakan nama atau `@media`.
- Prompt harus menerima batasan durasi, gaya, rasio, bahasa subtitle, clip wajib, dan clip terlarang.

**Acceptance:** prompt berbahasa Indonesia menghasilkan plan valid dan bukan teks instruksi semata.

### FR-05 — Edit planning

- AI hanya boleh merujuk media ID yang diberikan tool.
- Plan harus menyertakan alasan singkat untuk setiap segment selection.
- Plan harus menyertakan expected output duration dan warning.
- Plan tidak boleh mengubah timeline saat dibuat.

**Acceptance:** permintaan plan tidak mengubah project revision maupun timeline hash.

### FR-06 — Plan validation

- Semua rentang waktu harus berada di dalam durasi media.
- `source_start_ms < source_end_ms`.
- Clip locked tidak boleh dihapus.
- Operasi harus menggunakan `base_project_revision` terkini.
- Plan stale harus ditolak dan dibuat ulang.
- Target duration memiliki tolerance yang dapat dikonfigurasi.

**Acceptance:** plan dengan media ID atau timestamp invalid ditolak sebelum timeline berubah.

### FR-07 — Approval

- Sistem harus menampilkan ringkasan perubahan sebelum apply.
- Apply, Revise, dan Cancel tersedia.
- Write tools dari MCP memiliki approval default `always`.
- Read tools tidak memerlukan approval berulang setelah proyek diizinkan.

**Acceptance:** tidak ada mutasi timeline hanya karena ChatGPT menghasilkan tool call.

### FR-08 — Atomic timeline application

- Semua operasi dalam satu `EditPlan` dijalankan sebagai satu batch command.
- Jika satu operasi gagal, seluruh batch rollback.
- Batch memiliki idempotency key.
- Project revision bertambah hanya setelah commit berhasil.

**Acceptance:** kegagalan pada operasi ke-N mengembalikan timeline ke hash sebelumnya.

### FR-09 — Undo dan audit

- Satu aksi Apply AI menghasilkan satu entri history.
- Undo mengembalikan timeline, caption, audio, dan project settings terkait.
- Audit log mencatat prompt reference, plan ID, actor, timestamp, base revision, result, dan error; tidak menyimpan secrets.

**Acceptance:** apply lalu undo menghasilkan timeline hash identik dengan state awal.

### FR-10 — Rough-cut editing operations

MVP harus mendukung:

- insert media segment;
- split element;
- trim source in/out;
- delete element;
- move/reorder element;
- add/remove track;
- set project aspect ratio;
- add caption segment;
- set clip volume;
- add simple audio ducking envelope;
- lock/unlock element;
- render project.

### FR-11 — Preview dan review

- UI menyediakan timeline hasil, playback, source reference, dan badge `AI edited`.
- Pengguna dapat membandingkan ringkasan sebelum/sesudah.
- Segmen yang dibuang tetap dapat ditelusuri dari decision list.

### FR-12 — Export

- Preset minimum: 1080p H.264/AAC untuk 16:9 dan 9:16.
- Export menampilkan progress, cancel, output path, dan error yang dapat ditindaklanjuti.
- Export tidak boleh dimulai otomatis oleh prompt tanpa approval eksplisit.

### FR-13 — MCP connection

- MCP server menyediakan tool list yang stabil dan versioned.
- ChatGPT hanya menerima project-scoped capability token.
- Remote gateway tidak mempunyai arbitrary filesystem access.
- Local companion membuka koneksi outbound ke gateway.
- Jika ChatGPT Plus custom MCP tidak tersedia, aplikasi menampilkan fallback yang jelas tanpa merusak fitur manual.

### FR-14 — Privacy controls

Pengguna memilih salah satu tingkat berbagi:

1. `metadata_only`: nama tersamarkan, durasi, transcript summary, dan quality signals.
2. `transcript`: transcript lengkap dan metadata; default MVP.
3. `selected_keyframes`: transcript plus thumbnail yang disetujui dan memiliki expiry.

Full raw footage upload tidak termasuk MVP.

## 10. Non-functional requirements

### NFR-01 — Reliability

- Autosave project setelah transaction commit.
- Project file harus menggunakan atomic write.
- Recovery tersedia setelah crash saat apply atau render.
- Tidak ada silent failure.

### NFR-02 — Performance

- UI tetap responsif selama indexing dan render.
- Scrubbing proxy target 30 FPS pada perangkat target.
- Read MCP tool target respons di bawah dua detik untuk manifest yang sudah diindeks.
- Plan application target di bawah lima detik untuk 200 operasi timeline, di luar render.

### NFR-03 — Security

- Device token disimpan di OS keychain.
- Gateway menggunakan TLS.
- Token memiliki project scope, tool scope, expiry, dan revocation.
- Path absolut tidak dikirim ke model; gunakan display name dan opaque ID.
- MCP tidak menyediakan shell execution atau arbitrary path read.
- Write tools menggunakan approval dan revision guard.
- Semua input model diperlakukan sebagai untrusted.

### NFR-04 — Privacy

- Default adalah local processing.
- UI harus memperlihatkan data apa yang akan dikirim sebelum koneksi AI diaktifkan.
- Thumbnail yang diunggah bersifat opt-in dan memiliki automatic deletion.
- Log tidak boleh berisi access token atau raw API key.

### NFR-05 — Compatibility

- MVP: macOS Apple Silicon.
- Media minimum: MP4/MOV H.264/H.265 input, WAV/MP3/AAC audio.
- Output minimum: MP4 H.264/AAC.

### NFR-06 — Observability

- Local structured log untuk indexing, MCP calls, plan validation, timeline transaction, dan render.
- Correlation ID sama dari MCP request sampai command transaction.
- Diagnostic bundle harus dapat diekspor tanpa footage dan secrets.

## 11. Arsitektur target

```text
ChatGPT Plus
    |
    | Remote MCP over HTTPS
    v
MCP Gateway
    | auth, tool schemas, request routing, audit envelope
    |
    | encrypted outbound device session
    v
Local Companion / OpenCut AI Service
    |-- Project Index
    |-- Transcript and Scene Indexer
    |-- Edit Plan Validator
    |-- Approval Queue
    |-- Editor Adapter
    |-- Render Job Manager
    |
    v
OpenCut Classic Command Bus / Timeline / Preview / Export
    |
    v
Local footage, proxies, project data, rendered output
```

### 11.1 Komponen

#### A. OpenCut UI

- media browser;
- timeline dan preview;
- AI prompt panel;
- indexing status;
- edit-plan review;
- approval dialog;
- render status;
- connection/privacy settings.

#### B. Editor Adapter

Interface stabil yang memisahkan AI dari implementasi editor:

```ts
interface EditorAdapter {
  getProjectSnapshot(): Promise<ProjectSnapshot>;
  validatePlan(plan: EditPlan): Promise<ValidationResult>;
  applyPlan(plan: EditPlan): Promise<TransactionResult>;
  undoTransaction(transactionId: string): Promise<TransactionResult>;
  render(request: RenderRequest): Promise<RenderJob>;
}
```

Implementasi awal menerjemahkan operasi ke command di `opencut-classic`. Implementasi masa depan menerjemahkannya ke Editor API/Rust core OpenCut rewrite.

#### C. Media analysis worker

- `ffprobe` untuk metadata;
- FFmpeg untuk proxy, thumbnail, silence/scene signals, dan render helper;
- local speech-to-text engine untuk transcript;
- quality scoring modular untuk blur, black frame, clipping, duplicate, dan shake;
- job queue lokal dengan checkpoint.

#### D. MCP Gateway

- endpoint MCP remote;
- OAuth/device pairing atau short-lived capability token;
- routing ke perangkat yang sedang online;
- tidak menyimpan footage;
- payload limit;
- request timeout dan retry policy;
- revocation.

#### E. Local Companion

Untuk MVP dapat berjalan sebagai proses sidecar bersama OpenCut web/desktop. Tugasnya menjaga session ke gateway, menjalankan MCP tool secara lokal, meminta approval pada UI, dan mengembalikan hasil terstruktur.

## 12. Model data inti

### 12.1 Media asset

```ts
type MediaAsset = {
  id: string;
  displayName: string;
  localUriEncrypted: string;
  checksum: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  videoCodec?: string;
  audioCodec?: string;
  status: "available" | "missing" | "indexing" | "ready" | "failed";
  indexVersion?: string;
};
```

### 12.2 Transcript segment

```ts
type TranscriptSegment = {
  id: string;
  mediaId: string;
  startMs: number;
  endMs: number;
  speaker?: string;
  text: string;
  confidence?: number;
};
```

### 12.3 Edit plan

```ts
type EditPlan = {
  schemaVersion: "1.0";
  planId: string;
  idempotencyKey: string;
  projectId: string;
  baseProjectRevision: number;
  userIntent: string;
  expectedDurationMs: number;
  operations: EditOperation[];
  decisions: EditDecision[];
  warnings: string[];
};
```

`EditOperation` harus berupa discriminated union; tidak menerima arbitrary code atau free-form command.

Contoh operasi:

```ts
type InsertSegment = {
  type: "insert_segment";
  mediaId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  trackId: string;
  timelineStartMs: number;
};
```

### 12.4 Edit decision

```ts
type EditDecision = {
  mediaId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  action: "keep" | "exclude";
  reasonCode:
    | "strong_opening"
    | "required_content"
    | "clear_dialogue"
    | "duplicate"
    | "silence"
    | "low_quality"
    | "off_topic";
  explanation: string;
};
```

## 13. MCP tool contract v1

### Read-only tools

#### `project_get_summary`

Mengembalikan project ID, revision, duration, aspect ratio, track summary, indexing status, dan privacy mode.

#### `media_list`

Mengembalikan opaque media ID, display name, duration, dimensions, status, transcript availability, dan quality summary. Tidak mengembalikan local path.

#### `media_get_segments`

Mengembalikan scene ranges, silence ranges, quality signals, dan transcript untuk media terpilih. Mendukung pagination.

#### `transcript_search`

Mencari frasa, topik, atau speaker dan mengembalikan media ID serta timestamp.

#### `timeline_get_snapshot`

Mengembalikan revision, tracks, elements, locks, markers, duration, dan timeline hash.

#### `edit_plan_validate`

Melakukan dry-run validation dan menghasilkan errors, warnings, serta predicted timeline summary.

### Write tools

#### `edit_plan_submit`

Mengirim plan ke approval queue lokal. Tool ini belum mengubah timeline. Hasilnya `pending_user_approval`, `rejected`, atau `approved_for_apply`.

#### `edit_plan_apply`

Menerapkan plan yang sudah disetujui. Membutuhkan plan ID, approval token, base revision, dan idempotency key.

#### `timeline_undo_transaction`

Mengembalikan satu transaction AI. Membutuhkan konfirmasi pengguna.

#### `project_render_request`

Membuat render request setelah approval. Tidak boleh menerima arbitrary output path dari model; pengguna memilih folder melalui local UI.

### Aturan MCP

- Semua schema strict.
- Tool response maksimal dan pagination harus ditentukan.
- Write tool default membutuhkan approval.
- Tool harus idempotent atau memiliki idempotency key.
- Tool tidak boleh menerima shell command.
- Tool tidak boleh menerima raw filesystem path dari model.
- Tool error harus menggunakan kode stabil: `PROJECT_STALE`, `MEDIA_MISSING`, `INVALID_RANGE`, `LOCKED_ELEMENT`, `APPROVAL_REQUIRED`, `DEVICE_OFFLINE`, atau `RENDER_FAILED`.

## 14. Strategi pemilihan dan penyusunan footage

Pipeline MVP bukan satu prompt besar. Sistem memprosesnya bertahap:

1. **Inventory:** metadata dan kesehatan file.
2. **Segmentation:** scene, silence, dan transcript segment.
3. **Filtering:** buang bagian tidak layak berdasarkan aturan eksplisit.
4. **Candidate generation:** buat kandidat segmen yang relevan dengan intent.
5. **Narrative planning:** susun opening, body, dan closing.
6. **Duration fitting:** kurangi kandidat sampai mencapai target durasi.
7. **Timeline planning:** ubah susunan menjadi EditPlan.
8. **Local validation:** periksa semua precondition.
9. **Human approval:** tampilkan ringkasan.
10. **Atomic apply:** jalankan sebagai transaction.

Prioritas seleksi default:

1. clip yang dikunci pengguna;
2. informasi wajib dan kesimpulan;
3. dialog jelas dan relevan;
4. visual kuat untuk opening/B-roll;
5. variasi framing;
6. durasi target;
7. hindari silence, blur berat, duplikat, dan salah bicara.

## 15. UX requirements

### 15.1 AI panel

Panel minimum berisi:

- status koneksi ChatGPT/MCP;
- privacy mode aktif;
- indexing completeness;
- prompt input;
- tombol mention media;
- pilihan target duration dan aspect ratio;
- plan summary;
- Apply, Revise, Cancel;
- Undo last AI edit.

### 15.2 Plan review

Plan review harus menjawab:

- hasil akan berdurasi berapa;
- clip mana yang dipakai;
- clip mana yang dibuang;
- apakah ada clip locked yang dipertahankan;
- apakah subtitle/audio/aspect ratio berubah;
- data apa yang belum lengkap;
- risiko atau warning apa yang ditemukan.

### 15.3 Error UX

Error harus memberi tindakan berikutnya, misalnya:

- `Media missing — Relink file`;
- `Project changed — Regenerate plan`;
- `Transcript incomplete — Retry indexing or continue without transcript`;
- `Device offline — Reconnect companion`;
- `Insufficient disk space — Choose another cache directory`.

## 16. Privacy dan threat model

### Assets yang dilindungi

- footage asli;
- transcript;
- local paths;
- project timeline;
- identity/device token;
- output render.

### Ancaman utama

- prompt injection dari teks di footage/transcript;
- model mengarang media ID atau timestamp;
- MCP token bocor;
- ChatGPT meminta operasi di luar proyek;
- stale plan menimpa edit manual terbaru;
- remote gateway menyimpan payload sensitif;
- path traversal melalui nama file;
- render command injection.

### Mitigasi

- transcript adalah data, bukan instruction;
- allowlist tool dan strict schema;
- opaque IDs;
- revision guard;
- approval untuk write;
- local validation;
- no-shell design;
- path resolution hanya dilakukan local companion dari ID yang sudah terdaftar;
- short-lived scoped tokens;
- audit log;
- payload retention minimum;
- test injection adversarial.

## 17. Dependency dan operational requirements

### Local runtime

- Bun sesuai versi repository fork;
- FFmpeg dan ffprobe;
- local speech-to-text runtime;
- database/project storage lokal;
- keychain integration;
- cukup disk untuk proxy/cache;
- browser/desktop runtime OpenCut.

### Remote runtime

- MCP HTTPS endpoint;
- device session broker;
- minimal persistent store untuk device registration dan revocation;
- TLS certificate;
- request logging tanpa media content;
- health check dan uptime monitor.

### Feature gate wajib sebelum mengandalkan ChatGPT Plus

Saat onboarding, produk harus memverifikasi bahwa akun pengguna dapat menambahkan custom MCP/app. Jika tidak tersedia, tampilkan opsi:

- local MCP client yang kompatibel;
- local model;
- embedded OpenAI API dengan billing terpisah.

## 18. Delivery plan

### Milestone 0 — Foundation dan keputusan arsitektur

**Tujuan:** fork dapat dijalankan dan domain AI terisolasi.

Deliverables:

- fork `opencut-classic` dalam repository proyek terpisah;
- documented upstream commit;
- local development berhasil;
- sample project dapat import, edit manual, preview, save, reopen, dan export;
- package `ai-contracts` untuk schema Zod;
- interface `EditorAdapter`;
- feature flags `AI_PANEL`, `MCP_LOCAL`, `MCP_REMOTE`, `LOCAL_TRANSCRIPTION`.

Exit criteria:

- baseline smoke test direkam;
- tidak ada perubahan AI langsung ke Zustand store di luar adapter.

### Milestone 1 — Deterministic editor API

**Tujuan:** timeline dapat dimanipulasi aman tanpa AI.

Deliverables:

- project snapshot;
- plan validator;
- batch command;
- idempotency;
- revision guard;
- atomic rollback;
- undo transaction;
- test fixture project.

Exit criteria:

- 200-operation synthetic plan berhasil;
- invalid plan tidak mengubah timeline hash;
- apply + undo kembali ke hash awal.

### Milestone 2 — Local media intelligence

**Tujuan:** footage dapat dicari dan dinilai tanpa cloud.

Deliverables:

- job queue;
- ffprobe inventory;
- proxies/thumbnails;
- waveform;
- silence/scene detection;
- local transcript;
- transcript search;
- indexing UI.

Exit criteria:

- fixture 60 menit dapat diindeks dan di-resume setelah restart;
- transcript search mengarah ke timestamp benar.

### Milestone 3 — Local MCP server

**Tujuan:** tool contract dapat diuji tanpa remote hosting.

Deliverables:

- read tools;
- dry-run validation;
- submit/apply flow;
- approval queue;
- tool contract tests;
- MCP inspector test.

Exit criteria:

- MCP client dapat membaca project, mengajukan plan, menunggu approval, apply, dan undo.

### Milestone 4 — ChatGPT Plus remote MCP bridge

**Tujuan:** ChatGPT dapat mengontrol perangkat lokal tanpa raw filesystem access.

Deliverables:

- remote MCP gateway;
- device pairing;
- outbound local companion session;
- scoped token;
- timeout/reconnect;
- Plus feature availability check;
- end-to-end security test.

Exit criteria:

- prompt dari ChatGPT menghasilkan plan pada perangkat;
- UI lokal meminta approval;
- setelah approval timeline berubah;
- request dari project/token lain ditolak.

### Milestone 5 — AI rough-cut workflow

**Tujuan:** banyak footage menjadi satu rough cut.

Deliverables:

- prompt templates;
- candidate selection;
- narrative planning;
- duration fitting;
- decision explanations;
- revision prompts;
- captions;
- simple audio ducking.

Exit criteria:

- tiga fixture berbeda menghasilkan timeline valid;
- target duration berada dalam tolerance 10%;
- clip locked selalu dipertahankan;
- pengguna dapat revise dan undo.

### Milestone 6 — Hardening dan personal release

**Tujuan:** aplikasi cukup stabil untuk penggunaan nyata.

Deliverables:

- render preflight;
- recovery tests;
- missing-media flow;
- disk-space guard;
- diagnostic bundle;
- privacy review;
- installer/runbook;
- backup dan restore proyek.

Exit criteria:

- end-to-end test footage nyata lulus;
- tidak ada critical data-loss bug;
- recovery setelah forced quit terverifikasi.

## 19. Prioritized backlog

### P0 — Wajib sebelum dipakai

- jalankan fork classic secara lokal;
- tetapkan fixture footage yang legal digunakan;
- verifikasi import/save/reopen/export baseline;
- implement EditorAdapter;
- implement schema EditPlan;
- project revision dan timeline hash;
- plan validator;
- atomic batch apply;
- undo transaction;
- ffprobe inventory;
- local transcript;
- scene/silence indexing;
- read MCP tools;
- write approval flow;
- local MCP integration test;
- remote gateway pairing;
- ChatGPT Plus E2E test;
- render MP4;
- recovery dan backup.

### P1 — Penting setelah MVP

- visual quality scoring;
- duplicate detection;
- speaker diarization;
- better B-roll selection;
- transcript correction UI;
- reusable prompt presets;
- side-by-side plan comparison;
- render preset library;
- per-project privacy policy;
- local model fallback.

### P2 — Lanjutan

- multi-cam sync;
- semantic visual search;
- music beat alignment;
- color matching;
- social platform publish;
- multi-user review;
- migration ke OpenCut rewrite/Rust Editor API;
- plugin packaging untuk upstream ecosystem.

## 20. Test strategy

### Unit tests

- schema validation;
- time-range math;
- duration calculation;
- revision guard;
- lock rules;
- operation ordering;
- idempotency;
- transcript search;
- privacy redaction.

### Integration tests

- EditPlan ke OpenCut commands;
- partial failure rollback;
- apply/undo hash equality;
- MCP request ke local adapter;
- pairing dan token revocation;
- indexing restart;
- render cancellation.

### End-to-end fixtures

1. **Talking head:** salah bicara, silence, dan subtitle.
2. **Event highlight:** banyak clip, B-roll, dialog, dan target tiga menit.
3. **Vertical social:** target 60 detik, 9:16, caption, dan audio ducking.

Untuk setiap fixture simpan:

- expected mandatory segments;
- forbidden segments;
- target duration range;
- expected transcript phrases;
- expected timeline invariants;
- human review rubric.

### Adversarial tests

- transcript berisi instruksi palsu;
- forged media ID;
- out-of-range timestamp;
- stale project revision;
- duplicate apply request;
- offline device;
- disk penuh;
- file hilang;
- corrupted media;
- gateway timeout saat approval.

## 21. Release acceptance criteria

Personal MVP dinyatakan selesai hanya jika seluruh kondisi berikut terpenuhi:

- pengguna dapat memasukkan minimal 20 footage nyata;
- indexing selesai atau kegagalan ditampilkan per file;
- pengguna dapat memberi prompt Bahasa Indonesia;
- sistem menghasilkan structured EditPlan;
- plan dapat dilihat sebelum apply;
- clip locked tidak pernah hilang;
- plan invalid atau stale ditolak;
- apply bersifat atomic;
- undo mengembalikan state semula;
- rough cut dapat diputar di preview;
- subtitle memiliki timing yang dapat diedit;
- MP4 berhasil dirender dan diputar;
- file sumber tidak berubah;
- ChatGPT tidak mendapat arbitrary filesystem access;
- device token dapat dicabut;
- restart aplikasi tidak kehilangan project state;
- hasil diuji dengan footage nyata, bukan hanya synthetic fixture.

## 22. Risks dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---:|---|
| OpenCut classic diarsipkan | Tinggi | Fork terkunci, adapter, test baseline, migration path |
| Rewrite belum memiliki editor | Tinggi | Jangan jadikan rewrite dependency MVP |
| Custom MCP tidak tersedia pada akun/region | Tinggi | Feature gate dan fallback local MCP/model/API |
| ChatGPT tidak dapat mengakses localhost | Tinggi | Remote gateway + outbound device session |
| Model memilih segmen salah | Sedang | Plan review, explanations, clip lock, undo |
| Transcript kurang akurat | Sedang | Confidence, correction UI, fallback manual |
| Banyak thumbnail/transcript membesar | Sedang | Pagination, summary, retrieval, payload budget |
| Footage sensitif terkirim | Tinggi | Local-first, privacy mode, redaction, opt-in keyframes |
| Stale plan menimpa edit manual | Tinggi | Revision guard dan timeline hash |
| Render gagal atau disk penuh | Sedang | Preflight, temp-space estimate, resumable workflow |
| Scope membesar menjadi editor baru | Tinggi | Gunakan classic, batasi operasi dan codec MVP |

## 23. Open decisions sebelum coding besar

Keputusan berikut harus dikunci pada Milestone 0:

1. Apakah personal MVP hanya macOS Apple Silicon?
2. Apakah UI utama menggunakan web app classic atau wrapper desktop?
3. Engine transkripsi lokal yang dipilih dan ukuran model default.
4. Lokasi cache/proxy dan batas pemakaian disk.
5. Hosting MCP gateway dan metode pairing.
6. Apakah thumbnail boleh dikirim ke ChatGPT atau transcript-only dulu?
7. Format project snapshot dan strategi migration.
8. Render pipeline yang dipertahankan dari classic.
9. Apakah upstream changes akan diikuti atau fork diperlakukan independen?

Rekomendasi default:

- macOS Apple Silicon dahulu;
- gunakan web app classic sebagai editor awal;
- transcript dan analysis lokal;
- privacy mode `transcript`;
- thumbnail cloud upload dinonaktifkan pada rilis pertama;
- remote gateway sangat tipis dan tidak menyimpan media payload;
- fork independen dengan pencatatan upstream commit;
- migrasi ke rewrite setelah Editor API dan timeline core benar-benar tersedia.

## 24. Definition of done per feature

Sebuah feature dianggap selesai hanya jika:

- perilaku pengguna dan error state sudah ada;
- schema dan migration tersedia bila data berubah;
- unit/integration test relevan lulus;
- tidak melewati EditorAdapter;
- audit dan privacy impact ditinjau;
- aksesibilitas dasar keyboard/label tersedia;
- dokumentasi penggunaan diperbarui;
- diuji pada proyek nyata;
- hasil runtime, bukan hanya build, telah diverifikasi.

## 25. Urutan pekerjaan pertama

Urutan ini adalah starting point konkret:

1. Buat repository fork baru dari `opencut-classic`.
2. Catat upstream commit dan jangan mencampur fork dengan workspace `rwi-automation`.
3. Jalankan baseline secara lokal dan verifikasi import, timeline, save/reopen, preview, serta export.
4. Buat fixture footage kecil yang boleh digunakan berulang untuk test.
5. Tambahkan package `ai-contracts` berisi `EditPlan`, operations, errors, dan MCP schemas.
6. Implementasikan `EditorAdapter` di atas command pattern classic.
7. Tambahkan revision guard, timeline hash, batch transaction, dan undo.
8. Baru setelah operasi deterministik lulus test, tambahkan media indexing.
9. Setelah indexing stabil, tambahkan local MCP server.
10. Setelah local MCP lulus E2E, bangun remote gateway untuk ChatGPT Plus.
11. Terakhir, tambahkan prompt orchestration dan selection quality improvements.

## 26. Non-goals yang harus dijaga

- AI tidak menjadi satu-satunya cara menggunakan editor.
- ChatGPT tidak diberi akses shell.
- MCP tidak diberi akses ke seluruh home directory.
- Raw footage tidak otomatis diunggah.
- Render tidak otomatis dimulai tanpa approval.
- Model output tidak dianggap valid sebelum local validation.
- Build sukses tidak dianggap bukti workflow end-to-end.

## 27. Lampiran — contoh acceptance prompt

### Prompt A — Talking head

> Buat video maksimal lima menit. Hapus silence lebih dari 1,5 detik, take yang diulang, dan salah bicara. Pertahankan pembukaan, tiga poin utama, dan kesimpulan. Tambahkan subtitle Bahasa Indonesia. Jangan export sebelum saya menyetujui preview.

### Prompt B — Event highlight

> Dari semua footage acara, buat highlight tiga menit dengan pembuka paling energik, lalu susun kronologis dari kedatangan sampai penutupan. Pertahankan sambutan direktur, gunakan B-roll untuk menutup jump cut, dan kecilkan musik saat ada dialog.

### Prompt C — Vertical social

> Buat versi 9:16 maksimal 60 detik. Gunakan hook terkuat dalam tiga detik pertama, tampilkan subtitle, pertahankan ajakan bertindak terakhir, dan hindari clip blur atau duplikat.

### Expected behavior untuk seluruh prompt

- AI membuat plan, bukan langsung render.
- Plan menyebut expected duration dan warnings.
- Local validator memeriksa plan.
- UI meminta approval.
- Apply menghasilkan satu transaction.
- Undo tersedia.
- Export membutuhkan approval terpisah.
