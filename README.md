# Panduan Implementasi Warning Pop-Up Kelengkapan Berkas
**Klinik Mata Jombang (KMJ) — Tim IT Invel / Khanza**

---

## Apa yang Harus Dibangun?

Ketika perawat klik tombol **Home** di halaman kunjungan, sistem harus mengecek apakah ada kelengkapan yang belum diisi. Jika ada, tampilkan pop-up warning. Jika sudah lengkap, langsung lanjut ke Home.

```
Perawat klik Home
       ↓
Sistem cek kelengkapan (fungsi dari file .js)
       ↓
Ada yang kurang? → Tampilkan pop-up warning
Sudah lengkap?  → Langsung ke Home
```

File logika sudah tersedia: **`validasiKelengkapanWarningPopUp.js`**  
Tugas IT: **ambil data dari form, panggil fungsi itu, tampilkan hasilnya.**

---

## File yang Diterima

| File | Isi | Tugas IT |
|------|-----|----------|
| `validasiKelengkapanWarningPopUp.js` | Fungsi logika validasi | Tidak perlu diubah |

---

## Langkah Implementasi

### Langkah 1 — Taruh file di project

Copy `validasiKelengkapanWarningPopUp.js` ke folder JavaScript project Invel.

```
/invel/assets/js/validasiKelengkapanWarningPopUp.js
```

---

### Langkah 2 — Include file di halaman kunjungan

Di file HTML/template halaman SOAP atau kunjungan poli, tambahkan sebelum `</body>`:

```html
<script src="/assets/js/validasiKelengkapanWarningPopUp.js"></script>
```

---

### Langkah 3 — Intercept tombol Home

Cari tombol Home di halaman kunjungan (biasanya berupa `<a>` atau `<button>`).  
Pasang event listener yang akan menjalankan validasi sebelum berpindah halaman.

```javascript
document.addEventListener('DOMContentLoaded', function () {

    var tombolHome = document.getElementById('ID_TOMBOL_HOME_INVEL');
    // Ganti 'ID_TOMBOL_HOME_INVEL' dengan id/selector tombol Home yang sebenarnya

    tombolHome.addEventListener('click', function (e) {
        e.preventDefault(); // tahan dulu, jangan langsung pindah

        // Kumpulkan data dari form
        var payload = ambilDataKunjungan();

        // Jalankan validasi
        var hasil = validasiKelengkapanPoliMata(payload);

        if (hasil.showWarningPopUp) {
            tampilkanPopUp(hasil.messages); // Langkah 4
        } else {
            window.location.href = '/home'; // atau url home yang sesuai
        }
    });

});
```

---

### Langkah 4 — Buat fungsi ambil data dari form

Fungsi ini menarik data dari form yang sudah ada di halaman Invel.  
**Sesuaikan selector dengan DOM aktual Invel.**

```javascript
function ambilDataKunjungan() {
    // --- Ambil kode ICD-10 yang sudah dipilih ---
    var icd10List = [];
    document.querySelectorAll('.icd10-kode').forEach(function (el) {
        if (el.value) icd10List.push(el.value.trim());
    });

    // --- Ambil kode ICD-9 / prosedur yang sudah dipilih ---
    var icd9List = [];
    document.querySelectorAll('.icd9-kode').forEach(function (el) {
        if (el.value) icd9List.push(el.value.trim());
    });

    // --- Cek apakah tindakan billing sudah diisi ---
    var isInputTindakan = icd9List.length > 0;

    // --- Cek apakah berkas/laporan sudah diupload ---
    // Sesuaikan kondisi ini: misal ada class 'berkas-uploaded' yang muncul setelah upload
    var isUploadBerkas = document.querySelectorAll('.berkas-uploaded').length > 0;

    // --- Cek apakah resume medis sudah diisi ---
    // Sesuaikan dengan textarea/field resume di Invel
    var resumeField = document.getElementById('textarea-resume');
    var isInputResume = resumeField && resumeField.value.trim().length > 10;

    return {
        icd10List:      icd10List,
        icd9List:       icd9List,
        isInputTindakan: isInputTindakan,
        isUploadBerkas:  isUploadBerkas,
        isInputResume:   isInputResume
    };
}
```

> **Catatan untuk IT:** Bagian yang paling penting untuk disesuaikan adalah selector `.icd10-kode`, `.icd9-kode`, `.berkas-uploaded`, dan `#textarea-resume`. Nama-nama ini harus disesuaikan dengan elemen HTML yang sudah ada di Invel.

---

### Langkah 5 — Buat fungsi tampilkan pop-up

Fungsi ini menerima list pesan warning dan menampilkan pop-up.  
Desain pop-up bebas disesuaikan dengan tampilan Invel yang sudah ada.

```javascript
function tampilkanPopUp(messages) {
    // Buat isi pesan dalam format list
    var isiPesan = messages.map(function (msg) {
        return '<li>❌ ' + msg + '</li>';
    }).join('');

    // Buat elemen overlay pop-up
    var overlay = document.createElement('div');
    overlay.id = 'kmj-warning-overlay';
    overlay.innerHTML =
        '<div class="kmj-popup-box">' +
            '<h3 style="color:red;">Warning!</h3>' +
            '<ul>' + isiPesan + '</ul>' +
            '<button id="kmj-kembali">Kembali</button>' +
            '<button id="kmj-skip">Skip</button>' +
        '</div>';

    // Style overlay (bisa dipindah ke CSS file)
    overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.5);z-index:9999;' +
        'display:flex;align-items:center;justify-content:center;';

    overlay.querySelector('.kmj-popup-box').style.cssText =
        'background:#fff;border:3px solid red;border-radius:10px;' +
        'padding:30px;max-width:420px;width:90%;text-align:center;';

    document.body.appendChild(overlay);

    // Tombol Kembali → tutup pop-up, tetap di halaman
    document.getElementById('kmj-kembali').onclick = function () {
        document.body.removeChild(overlay);
    };

    // Tombol Skip → tutup pop-up, lanjut ke Home
    document.getElementById('kmj-skip').onclick = function () {
        document.body.removeChild(overlay);
        window.location.href = '/home'; // sesuaikan URL
    };
}
```

---

## Hasil yang Diharapkan

### Contoh 1 — Pasien katarak, berkas belum upload

```
Input:
  ICD-10: H25.9 (Katarak Senile)
  ICD-9:  13.41 (PHACO) + 13.71 (IOL)
  Tindakan: ✅ sudah dipilih
  Berkas:   ❌ belum upload
  Resume:   ❌ belum diisi

Output pop-up:
  ┌────────────────────────────────┐
  │         Warning!               │
  │  ❌ Laporan / Berkas belum     │
  │     di upload                  │
  │  ❌ Resume belum di input      │
  │                                │
  │  [Kembali]        [Skip]       │
  └────────────────────────────────┘
```

### Contoh 2 — Pasien eksisi chalazion, resume tidak diwajibkan

```
Input:
  ICD-10: H00.1 (Chalazion)
  ICD-9:  08.21 (Eksisi Chalazion)
  Tindakan: ✅ sudah dipilih
  Berkas:   ❌ belum upload
  Resume:   ❌ belum diisi

Output pop-up:
  ┌────────────────────────────────┐
  │         Warning!               │
  │  ❌ Laporan / Berkas belum     │
  │     di upload                  │
  │                                │
  │  (resume TIDAK diwarning,      │
  │   karena bukan bedah mayor)    │
  │                                │
  │  [Kembali]        [Skip]       │
  └────────────────────────────────┘
```

### Contoh 3 — Kontrol biasa Z09.8, langsung lolos

```
Input:
  ICD-10: Z09.8 (Kontrol biasa)
  ICD-9:  (kosong)

Output: Tidak ada pop-up, langsung ke Home.
```

### Contoh 4 — Hanya slitlamp/visus (95.01), langsung lolos

```
Input:
  ICD-9: 95.01 (Slitlamp/Visus)

Output: Tidak ada pop-up, langsung ke Home.
```

---

## Tabel Kapan Warning Muncul

| Situasi | Tindakan | Berkas | Resume |
|---------|----------|--------|--------|
| Kontrol murni (Z09.8, Z96.1, dll) | — | — | — |
| Hanya slitlamp/visus (95.01) | — | — | — |
| Diagnosa biasa, ICD-9 belum dipilih | ⚠️ | — | — |
| Minor poli: chalazion, OCT, foto fundus | ⚠️ | ⚠️ | — |
| Bedah mayor: katarak, laser, anti-VEGF | ⚠️ | ⚠️ | ⚠️ |

---

## Checklist Sebelum Go Live

- [ ] File JS sudah di-include di halaman kunjungan
- [ ] Selector ICD-10 sudah disesuaikan dengan DOM Invel
- [ ] Selector ICD-9 sudah disesuaikan dengan DOM Invel
- [ ] Kondisi `isUploadBerkas` sudah sesuai dengan cara Invel menandai file terupload
- [ ] Kondisi `isInputResume` sudah sesuai dengan field resume di Invel
- [ ] Tombol Home sudah di-intercept (tidak langsung navigasi)
- [ ] Test 4 skenario di atas sudah dicoba dan hasilnya sesuai
- [ ] Tombol **Kembali** menutup pop-up dan tetap di halaman ✅
- [ ] Tombol **Skip** menutup pop-up dan lanjut ke Home ✅

---

## Bantuan & Kontak

Jika ada pertanyaan tentang logika ICD atau aturan BPJS:  
**inovasigardakesehatan@gmail.com**

Jika ada pertanyaan teknis integrasi Invel/Khanza, pastikan sudah dicek dulu:
1. Apakah file JS sudah ter-load? (buka DevTools → Console → ketik `typeof validasiKelengkapanPoliMata`, harus return `"function"`)
2. Apakah selector sudah benar? (buka DevTools → Console → jalankan `ambilDataKunjungan()` dan lihat hasilnya)
