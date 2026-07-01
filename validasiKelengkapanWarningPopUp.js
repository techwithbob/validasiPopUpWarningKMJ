/**
 * BPJS Casemix Verifikator Module — Klinik Mata Jombang (KMJ)
 * Versi: 2.4.0
 *
 * PERUBAHAN v2.4.0:
 *  - Tambah parameter `laporanInputList` (array nama laporan yang sudah diisi)
 *  - Tambah `ICD9_TO_LAPORAN` mapping: ICD-9 → nama template laporan tindakan di Invel
 *  - Warning baru: laporan tindakan yang belum diisi (skip)
 *  - Fix: Laser PRP (14.24) & Laser Barrage (14.34) tidak memerlukan pre-op lab (005)
 *    → sesuai masukan nakes, laser masuk kategori "tindakan + laporan, tanpa berkas"
 *  - Fix: berkas 005 hanya untuk pemeriksaan penunjang (OCT/USG/Perimetri/dll) & pre-op OK besar
 *
 * PERUBAHAN v2.3.0:
 *  - Hapus '006' (Berkas INA/Lembar INA) dari semua validasi berkas
 *    → 006 adalah urusan unit klaim, bukan pelayanan poli
 *  - Hapus ICD-9 98.21 (Corpus Alienum) dari trigger berkas
 *    → CA hanya perlu warning tindakan billing, tidak perlu berkas
 *  - Berkas yang divalidasi sekarang hanya '005' (Hasil Penunjang/Lab)
 *
 * PERUBAHAN v2.2.0:
 *  - Tambah parameter `kodePenjamin` ('BPJS' | 'UMUM')
 *    Pasien UMUM → bypass semua warning (tidak ada kewajiban BPJS casemix)
 *  - Hapus '001' (SEP) dan '004' (Kartu Pasien) dari daftar berkas wajib warning
 *    → hanya '005' dan '006' yang relevan untuk validasi klinis
 *  - Pisah logika berkas: '005' untuk diagnostik penunjang & pre-op lab,
 *    '006' untuk Berkas INA / Lembar INA
 *  - BUGFIX: ICD10_WAJIB_BERKAS_LAB sebelumnya berisi kode ICD-9 (salah variabel)
 *    → sudah dipisah menjadi ICD10_TRIGGER_LAB dan ICD9_TRIGGER_005 dan ICD9_TRIGGER_006
 *
 * PERUBAHAN v2.1.0:
 *  - Tambah parameter `unitKode` di payload
 *  - BPJS0001 tidak diwajibkan di Ruang Operasi (U0025)
 *
 * PERUBAHAN v2.0.0:
 *  - isInputTindakan (boolean) → tindakanList (array kd_jenis_prw dari billing)
 *  - isUploadBerkas  (boolean) → berkasUploadedList (array kategori berkas yg diupload)
 *  - Logika auto-match: ICD-9 → billing code yang wajib ada (dari CSV jns_perawatan)
 *
 * KATEGORI BERKAS (referensi):
 *  '001' = Berkas SEP          ← tidak divalidasi (administrasi, bukan klinis)
 *  '002' = KTP                 ← tidak divalidasi
 *  '003' = Kartu Keluarga      ← tidak divalidasi
 *  '004' = Kartu Pasien        ← tidak divalidasi
 *  '005' = Berkas Hasil Penunjang / Lab  ← DIVALIDASI
 *  '006' = Berkas INA / Lembar INA  ← tidak divalidasi (urusan unit klaim)
 */

// ================================================================
// UNIT RUANG OPERASI — BPJS0001 tidak diwajibkan di unit ini
// karena BPJS0001 (Pemeriksaan Dokter) hanya terdaftar di Poli (U0115)
// ================================================================
const UNIT_RUANG_OPERASI = [
    'U0025',  // Ruang Operasi KMJ
    'OK',     // alias alternatif
];

// ================================================================
// TABEL KONTROL MURNI — bypass semua warning
// ================================================================
const ICD10_KONTROL_MURNI = [
    'Z09.8',  // Kontrol biasa
    'Z96.1',  // Kontrol pseudofakia 1 hari
    'Z45.8',  // Kontrol pseudofakia > 1 hari
    'Z48.0',  // Kontrol 1 hari post-op selain katarak
    'Z09.0',  // Kontrol > 1 hari post-op selain katarak
    'Z46.0',  // Kacamata
    'Z44',    // Protesa
];

// ================================================================
// TABEL PEMERIKSAAN DASAR — bypass semua warning
// ICD-9 ini tidak ada billing terpisah, cukup BPJS0001
// ================================================================
const ICD9_PEMERIKSAAN_DASAR = [
    '95.01',  // Slitlamp / Visus (EKSKLUSI UTAMA)
    '95.0',   // Prefix pemeriksaan mata dasar
    '95.03',  // Kontrol pemeriksaan lengkap
    '89.11',  // Tonometri standalone
];

// ================================================================
// MAPPING ICD-9 → kd_jenis_prw (billing code dari CSV)
//
// Aturan: jika ICD-9 dipilih, SALAH SATU dari kode billing ini
// harus ada di tindakanList. null = tidak ada billing terpisah.
//
// Sumber kode: jns_perawatan_202606251221.csv (KMJ)
// ================================================================
const ICD9_TO_TINDAKAN = {

    // --- PEMERIKSAAN (billing terpisah tapi bukan bedah) ---
    '95.02': ['BPJS002', 'BPJS002_S', 'RJ00864'],          // Biometri
    '16.21': ['BPJS011', 'BPJS011_S', 'RJ24582', 'RJ24582_S', 'RJ24571', 'RJ24668', 'RJ24668_S'], // TMG/Funduskopi

    // --- KATARAK ---
    '13.3':  ['BPJS026', 'BPJS026_S'],                     // Aspirasi / ECCE
    '13.11': ['BPJS004', 'BPJS004_S'],                     // ICCE
    '13.2':  ['BPJS026', 'BPJS026_S'],                     // ECCE
    '13.19': ['BPJS026', 'BPJS026_S'],                     // Cryoextraction
    '13.41': ['BPJS001', 'RJ24577', 'RJ24580', 'RJ24583', 'RJ24584',
              'RJ24588', 'RJ24589', 'RJ24590', 'RJ24591', 'RJ24599'], // PHACO (semua varian)
    '13.42': ['BPJS001', 'RJ24577'],                        // Phacofragmentation posterior
    '13.43': ['BPJS001', 'RJ24577'],                        // Phacofragmentation
    '13.59': ['BPJS030', 'BPJS030_S'],                     // SICS
    '13.64': ['BPJS005', 'BPJS005_S', 'RJ24578', 'RJ24578_S', 'RJ24579', 'RJ24579_S'], // YAG Laser
    '13.65': ['BPJS020', 'BPJS020_S'],                     // Eksisi Membran / Capsulectomy
    '13.69': ['BPJS014', 'BPJS014_S', 'RJ24620'],          // Exchange IOL
    '13.71': null,                                           // Insert IOL — bundled, no separate billing
    '13.72': ['BPJS057', 'RJ24626', 'RJ24627', 'RJ24628', 'RJ24629'], // Secondary IOL
    '13.9':  ['BPJS026', 'BPJS026_S'],                     // Ekstraksi lensa lainnya

    // --- KORNEA ---
    '11.32': ['BPJS003', 'BPJS003_S', 'RJ24581'],          // Eksisi Pterigium + Graft
    '11.39': ['BPJS038', 'BPJS038_S'],                     // Eksisi Pterigium
    '11.51': ['BPJS044', 'BPJS044_S', 'RJ24659', 'RJ24659_S', 'RJ24576', 'RJ24576_S'], // Hecting/Jahit Kornea
    '11.53': ['BPJS049', 'BPJS049_S', 'RJ24630'],          // Flap Konjungtiva (trauma)
    '11.59': ['BPJS051', 'BPJS051_S', 'BPJS049', 'BPJS049_S',
              'RJ24674', 'RJ24674_S', 'RJ24687', 'RJ24687_S', 'RJ24657'], // Amnion / Repair Kornea
    '11.63': ['BPJS050', 'BPJS050_S'],                     // Keratoplasty
    '11.79': ['BPJS050', 'BPJS050_S'],                     // Cross Linking
    '11.99': ['BPJS050', 'BPJS050_S'],                     // Flap Konjungtiva (infeksi)

    // --- GLAUKOMA ---
    '12.12': ['BPJS024', 'BPJS024_S', 'RJ24661', 'RJ24661_S'],        // Laser Iridotomy
    '12.14': ['BPJS028', 'BPJS028_S', 'RJ24606'],                     // Iridektomi
    '12.32': ['BPJS050', 'BPJS050_S'],                                 // Synechiotomy anterior
    '12.33': ['BPJS050', 'BPJS050_S'],                                 // Synechiotomy posterior
    '12.35': ['BPJS050', 'BPJS050_S'],                                 // Coreoplasty
    '12.39': ['BPJS050', 'BPJS050_S'],                                 // Iridoplasty
    '12.54': ['RJ24595'],                                              // Trabekulotomi
    '12.64': ['BPJS008'],                                              // Trabekulektomi
    '12.81': ['BPJS050', 'BPJS050_S'],                                // Jahit Sclera
    '12.82': ['BPJS035', 'BPJS035_S'],                                // Repair Scleral Fistula
    '12.85': ['BPJS050', 'BPJS050_S'],                                // Scleral Patch Graft
    '12.91': ['RJ24677'],                                              // Parasintesa/Irigasi AC
    '12.92': ['BPJS062', 'BPJS062_S', 'RJ24669'],                    // Injeksi Anti-VEGF Intra Cameral
    '12.97': ['BPJS061', 'BPJS061_S', 'RJ24666'],                    // Reposisi IOL

    // --- VITREORETINAL + LASER ---
    '14.24': ['BPJS010', 'BPJS010_S', 'RJ24596', 'RJ24596_S', 'RJ24642', 'RJ24642_S'], // Laser PRP/Sektoral
    '14.34': ['BPJS012', 'BPJS012_S', 'BPJS052', 'BPJS052_S',
              'RJ24597', 'RJ24597_S', 'RJ24642', 'RJ24642_S'],        // Laser Barrage/Sektoral
    '14.74': ['BPJS050', 'BPJS050_S'],                                // Vitrektomi
    '14.75': ['BPJS031', 'BPJS031_S', 'RJ24670'],                    // Injeksi Anti-VEGF Intravitreal
    '14.79': ['BPJS029', 'BPJS029_S', 'RJ24605', 'RJ24678', 'RJ24679'], // Injeksi Anti-VEGF

    // --- DIAGNOSTIK DENGAN HASIL CETAK ---
    '09.19': ['BPJS046', 'BPJS046_S', 'RJ24619', 'RJ24619_S'],       // Dry Eye Test
    '95.11': ['BPJS019', 'BPJS019_S', 'RJ24604', 'RJ24604_S'],       // Foto Fundus
    '95.12': ['BPJS034', 'BPJS034_S', 'RJ24684', 'RJ24684_S'],       // Fluorescein Test
    '95.13': ['BPJS007', 'BPJS007_S', 'RJ00866', 'RJ00866_S', 'RJ24566', 'RJ24566_S'], // USG Mata
    '95.16': ['BPJS016', 'BPJS016_S', 'RJ24603', 'RJ24603_S', 'RJ24609', 'RJ24609_S'], // OCT
    '95.26': ['RJ24572', 'RJ24572_S', 'RJ24573', 'RJ24573_S'],        // Perimetri

    // --- PALPEBRA MINOR (poli) ---
    '08.09': ['BPJS015', 'BPJS015_S', 'RJ24592', 'RJ24592_S',
              'BPJS065', 'BPJS065_S', 'BPJS066', 'BPJS066_S'],       // Hordeolum / Abses Palpebra
    '08.20': ['BPJS017', 'BPJS017_S', 'BPJS032', 'BPJS032_S', 'RJ24621', 'RJ24621_S'], // Lithiasis / Aff Jahitan OK
    '08.21': ['BPJS009', 'BPJS009_S', 'RJ24574', 'RJ24574_S', 'BPJS025', 'BPJS025_S'], // Chalazion / Kista Palpebra
    '08.22': ['BPJS006', 'BPJS006_S', 'BPJS018', 'BPJS018_S', 'BPJS021', 'BPJS021_S',
              'BPJS027', 'BPJS027_S', 'BPJS056', 'BPJS056_S',
              'RJ24622', 'RJ24641', 'RJ24641_S', 'RJ24646', 'RJ24646_S',
              'RJ24652', 'RJ24652_S'],                                 // Granuloma / Papiloma / MGD
    '08.23': ['BPJS042', 'BPJS042_S', 'BPJS043', 'BPJS043_S',
              'BPJS063', 'BPJS063_S', 'BPJS064', 'BPJS064_S',
              'RJ24623', 'RJ24623_S', 'RJ24624', 'RJ24624_S',
              'RJ24653', 'RJ24654', 'RJ24655'],                        // Wide Eksisi / Melanoma / Tumor Palpebra
    '08.38': ['BPJS022', 'BPJS022_S', 'BPJS053', 'BPJS053_S',
              'RJ24593', 'RJ24614', 'RJ24614_S'],                     // Entropion (suture)
    '08.44': ['BPJS055', 'BPJS055_S', 'RJ24615', 'RJ24615_S'],       // Entropion (lid reconstruction)
    '08.93': ['BPJS036', 'BPJS036_S', 'RJ24644', 'RJ24644_S', 'RJ24645'], // Epilasi

    // --- KONJUNGTIVA ---
    '10.1':  ['BPJS050', 'BPJS050_S'],                                // Peritomy
    '10.21': ['BPJS050', 'BPJS050_S'],                                // Biopsy konjungtiva
    '10.29': ['BPJS050', 'BPJS050_S'],                                // Scarification
    '10.31': ['BPJS040', 'BPJS040_S', 'RJ24598'],                    // Kista Konjungtiva
    '10.42': ['BPJS068', 'BPJS068_S'],                                // Eksisi Tumor Konjungtiva
    '10.44': ['BPJS067', 'BPJS067_S'],                                // Tumor Konjungtiva + Graft
    '10.49': ['BPJS050', 'BPJS050_S'],                                // Conjunctivoplasty
    '10.5':  ['BPJS050', 'BPJS050_S'],                                // Symblepharon
    '10.6':  ['BPJS058', 'BPJS058_S'],                                // Hecting Konjungtiva
    '10.91': ['BPJS059', 'BPJS059_S', 'J000803', 'J000803_S'],       // Injeksi Subkonjungtiva

    // --- LAIN-LAIN ---
    '16.91': ['BPJS039', 'BPJS039_S', 'RJ24613', 'RJ24613_S'],       // Injeksi Subtenon
    '16.39': ['BPJS050', 'BPJS050_S'],                                // Eviserasi
    '83.39': ['BPJS037', 'BPJS037_S'],                                // Tumor Soft Tissue
    '98.21': ['BPJS013', 'BPJS013_S', 'J000823', 'J000823_S', 'RJ24662', 'RJ24662_S'], // Corpus Alienum
    '97.89': ['BPJS041', 'BPJS041_S', 'RJ00858', 'RJ00858_S'],       // Aff Jahitan RJ
    '96.51': ['BPJS054', 'BPJS054_S', 'RJ00862', 'RJ00862_S', 'RJ24664'], // Irigasi Mata
};

// Label untuk pesan warning (nama prosedur yang dibaca manusia)
const ICD9_LABEL = {
    '95.02': 'Biometri',
    '16.21': 'TMG / Funduskopi',
    '13.3':  'Aspirasi Katarak',
    '13.11': 'ICCE',
    '13.2':  'ECCE',
    '13.41': 'Katarak PHACO',
    '13.59': 'SICS',
    '13.64': 'YAG Laser',
    '13.65': 'Eksisi Membran',
    '13.69': 'Exchange IOL',
    '13.72': 'Secondary IOL',
    '11.32': 'Eksisi Pterigium + Graft',
    '11.39': 'Eksisi Pterigium',
    '11.51': 'Jahit Kornea',
    '11.59': 'Amnion Graft / Repair Kornea',
    '11.63': 'Keratoplasty',
    '12.12': 'Laser Iridotomy',
    '12.14': 'Iridektomi',
    '12.54': 'Trabekulotomi',
    '12.64': 'Trabekulektomi',
    '12.82': 'Repair Scleral Fistula',
    '12.91': 'Parasintesa / Irigasi AC',
    '12.92': 'Injeksi Anti-VEGF Intra Cameral',
    '12.97': 'Reposisi IOL',
    '14.24': 'Laser PRP / Sektoral',
    '14.34': 'Laser Barrage',
    '14.74': 'Vitrektomi',
    '14.75': 'Injeksi Anti-VEGF Intravitreal',
    '14.79': 'Injeksi Anti-VEGF',
    '09.19': 'Dry Eye Test',
    '95.11': 'Foto Fundus',
    '95.12': 'Fluorescein Test',
    '95.13': 'USG Mata',
    '95.16': 'OCT',
    '95.26': 'Perimetri',
    '08.09': 'Hordeolum',
    '08.20': 'Lithiasis / Aff Jahitan OK',
    '08.21': 'Eksisi Chalazion',
    '08.22': 'Granuloma / Papiloma / MGD',
    '08.23': 'Wide Eksisi / Tumor Palpebra',
    '08.38': 'Repair Entropion (suture)',
    '08.44': 'Repair Entropion (lid reconstruction)',
    '08.93': 'Epilasi',
    '10.31': 'Eksisi Kista Konjungtiva',
    '10.42': 'Eksisi Tumor Konjungtiva',
    '10.44': 'Tumor Konjungtiva + Graft',
    '10.6':  'Hecting Konjungtiva',
    '10.91': 'Injeksi Subkonjungtiva',
    '16.91': 'Injeksi Subtenon',
    '16.39': 'Eviserasi',
    '83.39': 'Tumor Soft Tissue',
    '98.21': 'Corpus Alienum Removal',
    '97.89': 'Aff Jahitan RJ',
    '96.51': 'Irigasi Mata',
};

// ================================================================
// BERKAS — menentukan kategori berkas yang wajib diupload
//
// Hanya 2 kategori yang divalidasi:
//   '005' = Berkas Hasil Penunjang / Lab
//   '006' = Berkas INA / Lembar INA
//
// '001','002','003','004' = administrasi → tidak divalidasi lewat pop-up
// ================================================================

// ICD-10 yang memicu wajib '005' (Lab/Hasil Penunjang)
// Murni kode ICD-10 saja — DM + komplikasi mata
const ICD10_TRIGGER_LAB = new Set([
    'E10.3', 'E10.35', 'E11.3', 'E11.35', 'E14.3',  // DM + retinopati/komplikasi mata
]);

// ICD-9 diagnostik penunjang yang menghasilkan printout → wajib upload '005'
// (OCT, Perimetri, USG, Foto Fundus, Fluorescein, Dry Eye Test)
const ICD9_TRIGGER_005 = new Set([
    '09.19',  // Dry Eye Test / Schirmer
    '95.11',  // Foto Fundus
    '95.12',  // Fluorescein Test
    '95.13',  // USG Mata
    '95.16',  // OCT
    '95.26',  // Perimetri / Visual Field
    '16.21',  // Funduskopi / TMG
    '95.02',  // Biometri
]);

// ICD9_TRIGGER_006 dihapus — Berkas INA/Lembar INA (006) bukan urusan poli
// '006' hanya diisi oleh unit klaim saat generate PDF INA-CBG

// ================================================================
// MAPPING ICD-9 → NAMA LAPORAN TINDAKAN
//
// Nama harus PERSIS sama dengan nama template laporan di sistem Invel
// agar IT bisa match string dari `laporanInputList`
//
// null = tidak ada template laporan (hanya butuh tindakan billing)
// ================================================================
const ICD9_TO_LAPORAN = {
    // Tindakan minor poli — laporan WAJIB, berkas 005 TIDAK diperlukan
    '08.09': 'Tindakan Operasi Eksisi Kalazion',       // Hordeolum
    '08.20': 'Tindakan Lithiasis',
    '08.21': 'Tindakan Operasi Eksisi Kalazion',       // Eksisi Chalazion
    '08.22': 'Tindakan Ekspresi Kelenjar Meibom',      // Granuloma / MGD
    '08.93': 'Tindakan Epilasi (Mencabut Bulu Mata)',
    '13.64': 'Tindakan YAG Laser',
    '14.24': 'Tindakan Laser',                         // Laser PRP
    '14.34': 'Tindakan Laser',                         // Laser Barrage

    // Tindakan / bedah yang juga butuh pre-op lab (berkas 005) + laporan
    '08.23': 'Operasi Eksisi Tumor Palpebra',
    '08.38': 'Operasi Entropion',
    '08.44': 'Operasi Entropion',
    '10.31': 'Operasi Eksisi Kista Konjungtiva',
    '10.42': 'Operasi Eksisi Tumor Palpebra',
    '11.32': 'Operasi Eksisi Pterigium + Graft',
    '11.39': 'Tindakan Eksisi Pterigium',
    '11.53': 'Operasi AMT Graft',
    '11.59': 'Operasi AMT Graft',
    '12.14': 'Tindakan Iridektomi',
    '13.11': 'Operasi ICCE',
    '13.3':  'Operasi ICCE',
    '13.2':  'Operasi ICCE',
    '13.41': 'Operasi Fokoemulsifikasi',
    '13.42': 'Operasi Fokoemulsifikasi',
    '13.43': 'Operasi Fokoemulsifikasi',
    '13.59': 'Operasi SICS',
    '13.69': 'Tindakan Exchange IOL',
    '13.72': 'Tindakan Secondary Implant',
    '14.75': 'Tindakan Injeksi Intravitreal',
    '14.79': 'Tindakan Injeksi Intravitreal',

    // Tindakan tanpa template laporan — tidak ada warning laporan
    '96.51': null,  // Irigasi Mata
    '97.89': null,  // Aff Jahitan RJ
    '98.21': null,  // Corpus Alienum
    '10.91': null,  // Injeksi Subkonjungtiva
    '10.6':  null,  // Hecting Konjungtiva
    '16.91': null,  // Injeksi Subtenon
};

// ICD-9 bedah mayor → wajib pre-op lab (berkas 005) + resume
// CATATAN: laser (14.24, 14.34) TIDAK masuk sini — tidak perlu pre-op lab
const ICD9_BEDAH_MAYOR = new Set([
    // Katarak OK
    '13.41', '13.11', '13.2',  '13.59', '13.3',  '13.19', '13.42', '13.43',
    '13.65', '13.69', '13.72', '13.9',
    // Kornea
    '11.32', '11.39', '11.51', '11.53', '11.59', '11.63', '11.79', '11.99',
    // Glaukoma bedah
    '12.54', '12.64',
    // Vitreoretinal / Injeksi OK
    '14.74', '14.75', '14.79',
    // Lain-lain OK
    '16.39', '08.23', '08.38', '08.44',
    // Laser tidak masuk sini (poli, tidak perlu pre-op lab / resume)
]);

// ================================================================
// FUNGSI UTAMA
// ================================================================

/**
 * Validasi kelengkapan berkas kunjungan poli mata.
 *
 * @param {Object}   payload
 * @param {string}   payload.kodePenjamin       - 'BPJS' atau 'UMUM'
 *                                                UMUM → bypass semua warning
 * @param {string[]} payload.icd10List          - Kode ICD-10 diagnosa
 * @param {string[]} payload.icd9List           - Kode ICD-9 prosedur
 * @param {string[]} payload.tindakanList       - kd_jenis_prw yang diinput di billing
 * @param {string[]} payload.berkasUploadedList - Kategori berkas yang sudah diupload
 *                                                ['005'=Hasil Penunjang/Lab]
 * @param {string[]} payload.laporanInputList   - Nama laporan tindakan yang sudah diisi di Invel
 *                                                Contoh: ['Operasi Fokoemulsifikasi', 'Tindakan YAG Laser']
 *                                                Nama harus PERSIS sama dengan template laporan Invel
 * @param {boolean}  payload.isInputResume      - Resume medis sudah diisi?
 * @param {string}   payload.unitKode           - Kode unit registrasi (opsional)
 *                                                Contoh: 'U0115'=Poli Mata, 'U0025'=Ruang OK
 *                                                BPJS0001 tidak diwajibkan di Ruang Operasi
 *
 * @returns {{ isValid, showWarningPopUp, messages, _debug }}
 */
function validasiKelengkapanPoliMata(payload) {
    const {
        kodePenjamin        = 'BPJS', // 'BPJS' atau 'UMUM'
        icd10List           = [],
        icd9List            = [],
        tindakanList        = [],     // array kd_jenis_prw (billing codes)
        berkasUploadedList  = [],     // array kategori berkas yang diupload
        laporanInputList    = [],     // array nama laporan tindakan yang sudah diisi
        isInputResume,
        unitKode            = '',     // kode unit registrasi pasien (opsional)
    } = payload;

    // Pasien UMUM tidak ada kewajiban casemix BPJS — bypass semua
    if (kodePenjamin === 'UMUM') {
        return { isValid: true, showWarningPopUp: false, messages: [] };
    }

    // Unit Ruang Operasi tidak bisa input BPJS0001 (hanya ada di Poli)
    const isRuangOperasi = UNIT_RUANG_OPERASI.includes(unitKode);

    const messages = [];

    // ----------------------------------------------------------------
    // STEP 1: ICD-10 Kontrol Murni → bypass semua
    // ----------------------------------------------------------------
    if (icd10List.some(k => ICD10_KONTROL_MURNI.includes(k))) {
        return { isValid: true, showWarningPopUp: false, messages: [] };
    }

    // ----------------------------------------------------------------
    // STEP 2: ICD-9 hanya pemeriksaan dasar → bypass semua
    // ----------------------------------------------------------------
    if (
        icd9List.length > 0 &&
        icd9List.every(k =>
            ICD9_PEMERIKSAAN_DASAR.includes(k) || k.startsWith('95.0')
        )
    ) {
        return { isValid: true, showWarningPopUp: false, messages: [] };
    }

    // ----------------------------------------------------------------
    // STEP 3: VALIDASI TINDAKAN BILLING
    //
    // 3a. BPJS0001 (Pemeriksaan Dokter) SELALU wajib ada
    // 3b. Untuk tiap ICD-9 non-eksklusi, cek apakah billing-nya ada
    // ----------------------------------------------------------------
    const adaBPJS0001 = tindakanList.includes('BPJS0001') ||
                        tindakanList.includes('BPJS0001_S') ||
                        tindakanList.includes('J000810') ||
                        tindakanList.includes('J000810_S') ||
                        tindakanList.includes('J000816') ||
                        tindakanList.includes('J000816_S') ||
                        tindakanList.includes('RJ24567');

    // BPJS0001 hanya diwajibkan di unit Poli — bukan di Ruang Operasi
    // karena kode billing BPJS0001 hanya terdaftar di unit U0115 (Poli Mata)
    if (!isRuangOperasi && !adaBPJS0001) {
        messages.push('Pemeriksaan Dokter (BPJS0001) belum diinput di billing');
    }

    // Cek tiap ICD-9 apakah billing-nya sudah ada
    const icd9TidakTerbilling = [];

    icd9List.forEach(function (icd9) {
        // Skip pemeriksaan dasar
        if (ICD9_PEMERIKSAAN_DASAR.includes(icd9) || icd9.startsWith('95.0')) return;

        const expectedBilling = ICD9_TO_TINDAKAN[icd9];

        // null = tidak ada billing terpisah (13.71, dst) → skip
        if (expectedBilling === null) return;

        // Tidak ada di mapping → warning generik
        if (expectedBilling === undefined) {
            icd9TidakTerbilling.push(icd9);
            return;
        }

        // Cek apakah salah satu billing yang diharapkan sudah ada
        const sudahAda = expectedBilling.some(k => tindakanList.includes(k));
        if (!sudahAda) {
            icd9TidakTerbilling.push(icd9);
        }
    });

    icd9TidakTerbilling.forEach(function (icd9) {
        const label = ICD9_LABEL[icd9] || icd9;
        messages.push('Tindakan billing "' + label + '" (ICD-9: ' + icd9 + ') belum diinput');
    });

    // Jika ICD-9 kosong dan bukan kontrol → mungkin lupa input prosedur
    if (icd9List.length === 0) {
        messages.push('ICD-9 / prosedur belum dipilih — tindakan billing mungkin belum lengkap');
    }

    // ----------------------------------------------------------------
    // STEP 4: VALIDASI BERKAS
    //
    // Tentukan berkas apa yang wajib, lalu cek yang sudah diupload
    // ----------------------------------------------------------------
    const berkasWajib = tentukanBerkasWajib(icd10List, icd9List);
    const berkasKurang = berkasWajib.filter(k => !berkasUploadedList.includes(k));

    const BERKAS_LABEL = {
        '005': 'Berkas Hasil Penunjang (005)',
    };

    berkasKurang.forEach(function (kode) {
        messages.push((BERKAS_LABEL[kode] || 'Berkas (' + kode + ')') + ' belum diupload');
    });

    // ----------------------------------------------------------------
    // STEP 5: VALIDASI LAPORAN TINDAKAN
    //
    // Cek tiap ICD-9: apakah laporan tindakannya sudah diisi?
    // Laporan dicocokkan berdasarkan nama template (string match)
    // ----------------------------------------------------------------
    const laporanKurang = [];

    icd9List.forEach(function (icd9) {
        if (ICD9_PEMERIKSAAN_DASAR.includes(icd9) || icd9.startsWith('95.0')) return;
        if (ICD9_TRIGGER_005.has(icd9)) return; // penunjang → tidak butuh laporan

        const namaLaporan = ICD9_TO_LAPORAN[icd9];
        if (!namaLaporan) return; // null atau tidak ada mapping → skip

        // Cek apakah laporan ini sudah ada di laporanInputList (case-insensitive)
        const sudahDiisi = laporanInputList.some(function (l) {
            return l.trim().toLowerCase() === namaLaporan.toLowerCase();
        });

        // Hindari duplikat pesan jika 2 ICD-9 mapping ke nama laporan yang sama
        if (!sudahDiisi && !laporanKurang.includes(namaLaporan)) {
            laporanKurang.push(namaLaporan);
        }
    });

    laporanKurang.forEach(function (nama) {
        messages.push('Laporan "' + nama + '" belum diisi');
    });

    // ----------------------------------------------------------------
    // STEP 6: VALIDASI RESUME
    // Wajib untuk bedah mayor (OK) — bukan tindakan poli
    // ----------------------------------------------------------------
    const adaBedahMayor = icd9List.some(k => ICD9_BEDAH_MAYOR.has(k));

    if (adaBedahMayor && !isInputResume) {
        messages.push('Resume belum di input');
    }

    return {
        isValid:          messages.length === 0,
        showWarningPopUp: messages.length > 0,
        messages,
        _debug: {
            kodePenjamin,
            unitKode,
            isRuangOperasi,
            berkasWajib,
            berkasUploaded:   berkasUploadedList,
            berkasKurang,
            laporanDiisi:     laporanInputList,
            laporanKurang,
            adaBedahMayor,
            adaBPJS0001,
            icd9TidakTerbilling,
        }
    };
}

// ================================================================
// HELPER: Tentukan kategori berkas yang wajib ada
//
// Hanya '005' (Berkas Hasil Penunjang / Lab) yang divalidasi.
// '006' (Berkas INA/Lembar INA) tidak divalidasi — urusan unit klaim.
// ================================================================
function tentukanBerkasWajib(icd10List, icd9List) {
    const wajib = new Set();

    // ICD-9 diagnostik penunjang (OCT, Perimetri, USG, Foto Fundus, dll)
    // → wajib '005' (upload hasil print penunjang)
    if (icd9List.some(k => ICD9_TRIGGER_005.has(k))) {
        wajib.add('005');
    }

    // ICD-10 DM + komplikasi mata → wajib '005' (hasil lab HbA1c, GDS, dll)
    if (icd10List.some(k => ICD10_TRIGGER_LAB.has(k))) {
        wajib.add('005');
    }

    // Bedah mayor → wajib '005' (pre-op lab)
    if (icd9List.some(k => ICD9_BEDAH_MAYOR.has(k))) {
        wajib.add('005');
    }

    return Array.from(wajib);
}

// ================================================================
// CONTOH PENGGUNAAN (dokumentasi untuk IT)
// ================================================================
/*

// ── KASUS 1: Pasien UMUM → bypass semua ──
validasiKelengkapanPoliMata({
    kodePenjamin:       'UMUM',
    icd10List:          ['H25.9'],
    icd9List:           ['13.41'],
    tindakanList:       [],
    berkasUploadedList: [],
    isInputResume:      false,
});
// → { isValid: true, showWarningPopUp: false, messages: [] }

// ── KASUS 2: OCT + Perimetri BPJS, belum upload berkas penunjang ──
validasiKelengkapanPoliMata({
    kodePenjamin:       'BPJS',
    icd10List:          ['H40.1'],
    icd9List:           ['95.16', '95.26'],
    tindakanList:       ['BPJS0001', 'BPJS016', 'RJ24572'],
    berkasUploadedList: [],               // ❌ belum upload hasil OCT/Perimetri
    isInputResume:      false,
});
// → messages: ['Berkas Hasil Penunjang (005) belum diupload']

// ── KASUS 3: PHACO BPJS, hanya KTP diupload ──
validasiKelengkapanPoliMata({
    kodePenjamin:       'BPJS',
    icd10List:          ['H25.9'],
    icd9List:           ['13.41', '13.71'],
    tindakanList:       ['BPJS0001', 'BPJS001'],
    berkasUploadedList: ['002'],          // ❌ hanya KTP — 005 & 006 belum
    isInputResume:      false,
});
// → messages:
//   'Berkas Hasil Penunjang (005) belum diupload'  ← pre-op lab
//   'Berkas INA / Lembar INA (006) belum diupload'
//   'Resume belum di input'

// ── KASUS 4: PHACO di Ruang OK (U0025), BPJS0001 tidak bisa diinput ──
validasiKelengkapanPoliMata({
    kodePenjamin:       'BPJS',
    icd10List:          ['H25.9'],
    icd9List:           ['13.41'],
    tindakanList:       ['BPJS001'],      // tidak ada BPJS0001 (wajar, ini OK)
    berkasUploadedList: ['005', '006'],
    isInputResume:      true,
    unitKode:           'U0025',
});
// → { isValid: true, showWarningPopUp: false, messages: [] }

// ── KASUS 5: Kontrol post-op Z09.8 → bypass semua ──
validasiKelengkapanPoliMata({
    kodePenjamin:       'BPJS',
    icd10List:          ['Z09.8'],
    icd9List:           [],
    tindakanList:       [],
    berkasUploadedList: [],
    isInputResume:      false,
});
// → { isValid: true, showWarningPopUp: false, messages: [] }

// ── KASUS 5: Slitlamp/Visus saja → bypass semua ──
validasiKelengkapanPoliMata({
    icd10List:          ['H52.1'],
    icd9List:           ['95.01'],
    tindakanList:       ['BPJS0001'],
    berkasUploadedList: [],
    isInputResume:      false,
});
// → { isValid: true, showWarningPopUp: false, messages: [] }

// ── KASUS 6: ICD-9 dipilih tapi billing tidak cocok ──
validasiKelengkapanPoliMata({
    icd10List:          ['H40.1'],
    icd9List:           ['12.64'],               // Trabekulektomi
    tindakanList:       ['BPJS0001', 'BPJS007'], // ❌ BPJS007 = USG, bukan trabekulektomi
    berkasUploadedList: ['001', '004', '006'],
    isInputResume:      false,
});
// → messages:
//   'Tindakan billing "Trabekulektomi" (ICD-9: 12.64) belum diinput'
//   'Resume belum di input'

// ── KASUS 7: OCT + Foto Fundus, KTP saja yang diupload ──
validasiKelengkapanPoliMata({
    icd10List:          ['H35.3'],
    icd9List:           ['95.16', '95.11'],      // OCT + Foto Fundus
    tindakanList:       ['BPJS0001', 'BPJS016', 'BPJS019'],
    berkasUploadedList: ['002'],                  // ❌ hanya KTP
    isInputResume:      false,
});
// → messages:
//   'Berkas SEP (001) belum diupload'
//   'Kartu Pasien (004) belum diupload'
//   'Berkas INA / Lembar INA (006) belum diupload'

*/

module.exports = { validasiKelengkapanPoliMata, tentukanBerkasWajib };
