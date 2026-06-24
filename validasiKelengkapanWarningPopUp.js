/**
 * BPJS Casemix Verifikator Module — Klinik Mata Jombang (KMJ)
 * Versi: 1.1.0
 * Target: Invel Frontend / Khanza Node.js Backend
 *
 * LOGIKA 3 TIER:
 *  TIER 0 → bypass semua warning (kontrol murni / hanya pemeriksaan dasar)
 *  TIER 1 → warning tindakan saja (diagnosa biasa belum input ICD-9)
 *  TIER 2 → warning tindakan + berkas (tindakan minor: chalazion, foto fundus, OCT, dll)
 *  TIER 3 → warning tindakan + berkas + resume (bedah mayor, laser, injeksi intravitreal)
 *
 * Alasan pembedaan tier: jika warning berkas/resume selalu muncul untuk kasus ringan,
 * perawat akan selalu klik "Skip" dan sistem kehilangan fungsi peringatannya.
 */

function validasiKelengkapanPoliMata(payload) {
    const {
        icd10List = [],       // Array kode ICD-10 diagnosa
        icd9List  = [],       // Array kode ICD-9 prosedur
        isInputTindakan,      // Boolean: ICD-9 billing sudah dipilih?
        isUploadBerkas,       // Boolean: Laporan/PDF sudah diupload?
        isInputResume         // Boolean: Resume medis sudah diisi?
    } = payload;

    // ================================================================
    // TIER 0-A: ICD-10 Kontrol Murni → bypass SEMUA warning
    // (kunjungan ini tidak perlu tindakan, berkas, maupun resume)
    // ================================================================
    const icd10KontrolMurni = [
        'Z09.8',   // Kontrol biasa
        'Z96.1',   // Kontrol pseudofakia 1 hari
        'Z45.8',   // Kontrol pseudofakia > 1 hari
        'Z48.0',   // Kontrol 1 hari post-op selain katarak
        'Z09.0',   // Kontrol > 1 hari post-op selain katarak
        'Z46.0',   // Kacamata
        'Z44',     // Protesa
    ];

    const isKontrolMurni = icd10List.some(kode => icd10KontrolMurni.includes(kode));
    if (isKontrolMurni) {
        return { isValid: true, showWarningPopUp: false, messages: [] };
    }

    // ================================================================
    // TIER 0-B: ICD-9 hanya pemeriksaan dasar → bypass semua warning
    // (slitlamp/visus, biometri, kontrol lengkap — tidak ada tindakan billing terpisah)
    // ================================================================
    const icd9PemeriksaanDasar = [
        '95.01',  // Slitlamp / Visus (EKSKLUSI UTAMA — konfirmasi casemix)
        '95.0',   // Prefix pemeriksaan mata dasar
        '95.02',  // Biometri / px baru pemeriksaan lengkap
        '95.03',  // Kontrol pemeriksaan lengkap
        '89.11',  // Tonometri standalone
        '16.21',  // Funduscopy / Ophthalmoscopy / TMG
    ];

    const isHanyaPemeriksaanDasar =
        icd9List.length > 0 &&
        icd9List.every(kode =>
            icd9PemeriksaanDasar.some(ekskl => kode === ekskl || kode.startsWith('95.0'))
        );

    if (isHanyaPemeriksaanDasar) {
        return { isValid: true, showWarningPopUp: false, messages: [] };
    }

    // ================================================================
    // TIER 3: ICD-9 Bedah Mayor / Laser / Injeksi Invasif
    // → wajib TINDAKAN + BERKAS + RESUME
    // ================================================================
    const icd9BedahMayor = [
        // Operasi Katarak (OK)
        '13.3',  '13.11', '13.2',  '13.19', '13.41', '13.42',
        '13.43', '13.59', '13.64', '13.65', '13.69', '13.71', '13.72', '13.9',
        // Kornea Mayor
        '11.32', '11.39', '11.51', '11.53', '11.59', '11.63', '11.79', '11.99',
        // Glaukoma Bedah
        '12.12', '12.14', '12.32', '12.33', '12.35', '12.39',
        '12.54', '12.64', '12.81', '12.82', '12.85', '12.91', '12.92', '12.97',
        // Vitreoretinal + Laser
        '14.24', '14.34', '14.74', '14.75', '14.79',
        // Injeksi Subtenon & Eviserasi (invasif di OK)
        '16.91', '16.39',
        // Palpebra Mayor
        '08.23', '08.38', '08.44',
    ];

    // ================================================================
    // TIER 2: ICD-9 Tindakan Minor (poli, bukan OK)
    // → wajib TINDAKAN + BERKAS, tidak wajib RESUME
    // ================================================================
    const icd9TindakanMinor = [
        // Diagnostik terdokumentasi (perlu upload hasil print)
        '09.19',  // Dry Eye Test / Schirmer
        '95.11',  // Foto Fundus
        '95.12',  // Fluorescein Test
        '95.13',  // USG Mata
        '95.16',  // OCT
        '95.26',  // Perimetri / Visual Field
        // Palpebra minor (dilakukan di poli, bukan OK)
        '08.09',  // Hordeolum incision
        '08.20',  // Aff jahitan / Lithiasis
        '08.21',  // Eksisi Chalazion
        '08.22',  // Granuloma / Papiloma / Ekspresi Kelenjar Meibom
        '08.93',  // Epilasi
        // Konjungtiva minor
        '10.31',  // Eksisi Kista Konjungtiva
        '10.6',   // Hecting Konjungtiva
        '10.91',  // Injeksi Subkonjungtiva
        // Lain-lain poli
        '97.89',  // Aff jahitan rawat jalan
        '98.21',  // Corpus Alienum (CA) removal
        '96.51',  // Irigasi Mata (kimia / post-CA)
    ];

    const adaBedahMayor  = icd9List.some(kode => icd9BedahMayor.includes(kode));
    const adaTindakanMinor = icd9List.some(kode => icd9TindakanMinor.includes(kode));

    // ================================================================
    // OVERRIDE BERKAS berdasarkan ICD-10 (fallback jika ICD-9 belum diisi)
    // Diagnosa berat ini SELALU wajib berkas meski ICD-9 belum dipilih
    // ================================================================
    const icd10WajibBerkas = [
        // Katarak (semua jenis)
        'H25.0', 'H25.1', 'H25.2', 'H25.9',
        'H26.0', 'H26.1', 'H26.2', 'H26.3', 'H26.4', 'H26.8', 'H26.9',
        'H27.0', 'H27.1', 'H27.11', 'H28.0',
        // Glaukoma
        'H40.0', 'H40.1', 'H40.2', 'H40.5', 'H40.8', 'H40.9', 'H44.5',
        // Kornea serius
        'H11.0', 'H16.0', 'H17.0', 'H17.8', 'H17.9', 'H18.6',
        // Retina
        'H33.2', 'H33.3', 'H34.1', 'H34.8', 'H34.83',
        'H35.3', 'H35.6', 'H43.1',
        // Inflamasi berat
        'H44.0', 'H44.1', 'H20.0', 'H20.1', 'H20.9',
        // Tumor
        'D23.1', 'D31.0',
        // Palpebra operatif
        'H02.0', 'H02.4',
        // DM + komplikasi mata
        'E11.3', 'E11.35', 'E10.3', 'E14.3',
        // Trauma
        'S05.0', 'S05.3', 'S05.9',
        'T15.0', 'T15.1', 'T15.8', 'T15.9',
        // Hifema
        'H21.0',
        // Pterigium (bila belum ada ICD-9 eksisi)
        'H11.0',
    ];

    const icd10MemicuBerkas = icd10List.some(kode => icd10WajibBerkas.includes(kode));

    // ================================================================
    // TENTUKAN KEWAJIBAN TIAP KOMPONEN
    // ================================================================
    const wajibTindakan = true; // selalu wajib kecuali sudah lolos di TIER 0 atas
    const wajibBerkas   = adaBedahMayor || adaTindakanMinor || icd10MemicuBerkas;
    const wajibResume   = adaBedahMayor;

    // ================================================================
    // SUSUN PESAN WARNING
    // ================================================================
    const popUpWarnings = [];

    // Tindakan: warning jika belum input ATAU ICD-9 masih kosong
    if (wajibTindakan && (!isInputTindakan || icd9List.length === 0)) {
        popUpWarnings.push('Tindakan belum di input');
    }

    if (wajibBerkas && !isUploadBerkas) {
        popUpWarnings.push('Laporan / Berkas belum di upload');
    }

    if (wajibResume && !isInputResume) {
        popUpWarnings.push('Resume belum di input');
    }

    return {
        isValid:          popUpWarnings.length === 0,
        showWarningPopUp: popUpWarnings.length > 0,
        messages:         popUpWarnings,
        // debug: berikan ke IT untuk troubleshoot, hapus di production
        _debug: {
            tier:            adaBedahMayor ? 3 : (adaTindakanMinor || icd10MemicuBerkas) ? 2 : 1,
            wajibTindakan,
            wajibBerkas,
            wajibResume,
        }
    };
}

// ================================================================
// CONTOH PENGGUNAAN (untuk dokumentasi IT)
// ================================================================
/*

// KASUS 1: Katarak + PHACO → perlu tindakan + berkas + resume (TIER 3)
validasiKelengkapanPoliMata({
    icd10List:      ['H25.9'],
    icd9List:       ['13.41', '13.71'],
    isInputTindakan: true,
    isUploadBerkas:  false,   // ← WARNING: berkas belum upload
    isInputResume:   false,   // ← WARNING: resume belum diisi
});
// → messages: ['Laporan / Berkas belum di upload', 'Resume belum di input']

// KASUS 2: Chalazion + Eksisi → perlu tindakan + berkas, TIDAK perlu resume (TIER 2)
validasiKelengkapanPoliMata({
    icd10List:      ['H00.1'],
    icd9List:       ['08.21'],
    isInputTindakan: true,
    isUploadBerkas:  false,   // ← WARNING: berkas belum upload
    isInputResume:   false,   // ← tidak diwarning (minor, bukan bedah mayor)
});
// → messages: ['Laporan / Berkas belum di upload']

// KASUS 3: Kontrol post-op (Z09.8) → bypass semua (TIER 0)
validasiKelengkapanPoliMata({
    icd10List:      ['Z09.8'],
    icd9List:       [],
    isInputTindakan: false,
    isUploadBerkas:  false,
    isInputResume:   false,
});
// → messages: [], showWarningPopUp: false

// KASUS 4: Slitlamp/Visus only → bypass semua (TIER 0)
validasiKelengkapanPoliMata({
    icd10List:      ['H52.1'],
    icd9List:       ['95.01'],
    isInputTindakan: false,
    isUploadBerkas:  false,
    isInputResume:   false,
});
// → messages: [], showWarningPopUp: false

// KASUS 5: Katarak belum ada ICD-9 (lupa pilih prosedur) → trigger berkas via ICD-10
validasiKelengkapanPoliMata({
    icd10List:      ['H25.9'],
    icd9List:       [],
    isInputTindakan: false,
    isUploadBerkas:  false,
    isInputResume:   false,
});
// → messages: ['Tindakan belum di input', 'Laporan / Berkas belum di upload']

*/

module.exports = { validasiKelengkapanPoliMata };
