/* ============================================================
   xlsx.js — scriitor XLSX minimal, ZERO dependinte externe.
   Produce un fisier .xlsx valid (OOXML) pe care Excel / Google Sheets /
   Numbers il deschid nativ. Functioneaza 100% offline in PWA.

   Cum: un .xlsx e o arhiva ZIP cu fisiere XML. Scriem arhiva cu metoda
   STORE (fara compresie) => nu avem nevoie de zlib in browser, doar de
   CRC32, implementat mai jos.

   API:  XlsxLite.build([{ name, cols, rows, freeze, filter }]) -> Blob
   Celula: null | string | number | { v, s }   (s = index stil, vezi STYLES)
   ============================================================ */
'use strict';

var XlsxLite = (function () {

  /* ---------- stiluri disponibile (index folosit ca `s` in celule) ---------- */
  var S = {
    NORMAL: 0,
    HEADER: 1,   // bold alb pe fundal inchis
    BOLD:   2,
    TITLE:  3,   // bold mare
    ZI:     4,   // fundal portocaliu deschis
    NOAPTE: 5,   // fundal violet deschis
    CONC:   6,   // fundal verde deschis
    HOL:    7,   // text rosu bold
    MUTED:  8    // text gri
  };

  /* ---------- CRC32 ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- utilitare binare ---------- */
  function enc(str) { return new TextEncoder().encode(str); }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  /** Arhiva ZIP cu metoda STORE. files: [{ name, data:Uint8Array }] */
  function zipStore(files) {
    var now = new Date(), t = dosTime(now), dt = dosDate(now);
    var parts = [], central = [], offset = 0, i;

    for (i = 0; i < files.length; i++) {
      var nameBytes = enc(files[i].name), data = files[i].data, crc = crc32(data);
      var lh = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(t), u16(dt),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      parts.push(new Uint8Array(lh), nameBytes, data);

      central.push({
        name: nameBytes, crc: crc, size: data.length, off: offset
      });
      offset += lh.length + nameBytes.length + data.length;
    }

    var cdStart = offset, cdSize = 0;
    for (i = 0; i < central.length; i++) {
      var c = central[i];
      var ch = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(t), u16(dt),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off)
      );
      parts.push(new Uint8Array(ch), c.name);
      cdSize += ch.length + c.name.length;
    }

    parts.push(new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0)
    )));

    return parts;
  }

  /* ---------- XML ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');   // caractere invalide in XML
  }

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26; }
    return s;
  }

  var XMLNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var XMLNS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function contentTypes(n) {
    var o = '';
    for (var i = 1; i <= n; i++) {
      o += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      o + '</Types>';
  }

  function rootRels() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + XMLNS_R + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }

  function workbook(sheets) {
    var o = '';
    for (var i = 0; i < sheets.length; i++) {
      o += '<sheet name="' + esc(safeName(sheets[i].name)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="' + XMLNS + '" xmlns:r="' + XMLNS_R + '">' +
      '<sheets>' + o + '</sheets></workbook>';
  }

  function wbRels(n) {
    var o = '';
    for (var i = 1; i <= n; i++) {
      o += '<Relationship Id="rId' + i + '" Type="' + XMLNS_R + '/worksheet" Target="worksheets/sheet' + i + '.xml"/>';
    }
    o += '<Relationship Id="rId' + (n + 1) + '" Type="' + XMLNS_R + '/styles" Target="styles.xml"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + o + '</Relationships>';
  }

  /** Numele foii: max 31 caractere, fara : \ / ? * [ ] */
  function safeName(n) {
    return String(n || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, '-').slice(0, 31);
  }

  function styles() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="' + XMLNS + '">' +
      '<fonts count="6">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +                                        /* 0 */
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +                                    /* 1 */
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +             /* 2 */
        '<font><b/><sz val="14"/><name val="Calibri"/></font>' +                                    /* 3 */
        '<font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/></font>' +             /* 4 rosu */
        '<font><sz val="11"/><color rgb="FF808080"/><name val="Calibri"/></font>' +                 /* 5 gri  */
      '</fonts>' +
      '<fills count="6">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>' +  /* 2 header */
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE8C8"/><bgColor indexed="64"/></patternFill></fill>' +  /* 3 zi */
        '<fill><patternFill patternType="solid"><fgColor rgb="FFEBDDFB"/><bgColor indexed="64"/></patternFill></fill>' +  /* 4 noapte */
        '<fill><patternFill patternType="solid"><fgColor rgb="FFD6F5E0"/><bgColor indexed="64"/></patternFill></fill>' +  /* 5 concediu */
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB0B7C3"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="9">' +
        '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +                                                       /* 0 normal */
        '<xf xfId="0" numFmtId="0" fontId="2" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + /* 1 header */
        '<xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>' +                                          /* 2 bold */
        '<xf xfId="0" numFmtId="0" fontId="3" fillId="0" borderId="1" applyFont="1" applyBorder="1"/>' +                          /* 3 titlu */
        '<xf xfId="0" numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1"/>' +                                          /* 4 zi */
        '<xf xfId="0" numFmtId="0" fontId="0" fillId="4" borderId="0" applyFill="1"/>' +                                          /* 5 noapte */
        '<xf xfId="0" numFmtId="0" fontId="0" fillId="5" borderId="0" applyFill="1"/>' +                                          /* 6 concediu */
        '<xf xfId="0" numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1"/>' +                                          /* 7 sarbatoare */
        '<xf xfId="0" numFmtId="0" fontId="5" fillId="0" borderId="0" applyFont="1"/>' +                                          /* 8 gri */
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function sheetXml(sh) {
    var rows = sh.rows || [], maxCol = 0, i, j, o = '';

    for (i = 0; i < rows.length; i++) if (rows[i] && rows[i].length > maxCol) maxCol = rows[i].length;

    for (i = 0; i < rows.length; i++) {
      var row = rows[i] || [], cells = '';
      for (j = 0; j < row.length; j++) {
        var cell = row[j];
        if (cell === null || cell === undefined || cell === '') continue;

        var v = cell, st = 0;
        if (typeof cell === 'object') { v = cell.v; st = cell.s || 0; }
        if (v === null || v === undefined || v === '') {
          if (!st) continue;
          cells += '<c r="' + colName(j) + (i + 1) + '" s="' + st + '"/>';
          continue;
        }
        var ref = colName(j) + (i + 1), sAttr = st ? ' s="' + st + '"' : '';
        if (typeof v === 'number' && isFinite(v)) {
          cells += '<c r="' + ref + '"' + sAttr + '><v>' + v + '</v></c>';
        } else {
          cells += '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        }
      }
      o += '<row r="' + (i + 1) + '">' + cells + '</row>';
    }

    var cols = '';
    if (sh.cols && sh.cols.length) {
      cols = '<cols>';
      for (i = 0; i < sh.cols.length; i++) {
        cols += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + sh.cols[i] + '" customWidth="1"/>';
      }
      cols += '</cols>';
    }

    var views = '<sheetViews><sheetView workbookViewId="0">' +
      (sh.freeze ? '<pane ySplit="' + (sh.freeze) + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' : '') +
      '</sheetView></sheetViews>';

    var filter = '';
    if (sh.filter && rows.length > sh.filter && maxCol > 0) {
      filter = '<autoFilter ref="A' + sh.filter + ':' + colName(maxCol - 1) + rows.length + '"/>';
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="' + XMLNS + '">' + views + cols +
      '<sheetData>' + o + '</sheetData>' + filter + '</worksheet>';
  }

  /* ---------- API public ---------- */
  function build(sheets) {
    if (!sheets || !sheets.length) sheets = [{ name: 'Sheet1', rows: [] }];
    var files = [
      { name: '[Content_Types].xml',        data: enc(contentTypes(sheets.length)) },
      { name: '_rels/.rels',                data: enc(rootRels()) },
      { name: 'xl/workbook.xml',            data: enc(workbook(sheets)) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc(wbRels(sheets.length)) },
      { name: 'xl/styles.xml',              data: enc(styles()) }
    ];
    for (var i = 0; i < sheets.length; i++) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc(sheetXml(sheets[i])) });
    }
    return new Blob(zipStore(files), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ============================================================
     CITIRE: extrage datele de restaurare dintr-un .xlsx generat de noi.
     Permite ca ACELASI fisier Excel sa fie si backup-ul restaurabil.

     Suporta:
       - metoda STORE (fisierele generate de aplicatie)
       - metoda DEFLATE (daca fisierul a fost re-salvat din Excel),
         prin DecompressionStream('deflate-raw')
     ============================================================ */

  function unesc(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&amp;/g, '&');          // ultimul, ca sa nu dubleze decodarea
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no-inflate');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Listeaza intrarile din arhiva folosind central directory. */
  function zipEntries(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not-zip');

    const n = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const cSize  = dv.getUint32(off + 20, true);
      const nLen   = dv.getUint16(off + 28, true);
      const eLen   = dv.getUint16(off + 30, true);
      const cLen   = dv.getUint16(off + 32, true);
      const lho    = dv.getUint32(off + 42, true);
      const name   = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nLen));

      const lhNLen = dv.getUint16(lho + 26, true);
      const lhELen = dv.getUint16(lho + 28, true);
      const dStart = lho + 30 + lhNLen + lhELen;
      out.push({ name: name, method: method, data: u8.subarray(dStart, dStart + cSize) });
      off += 46 + nLen + eLen + cLen;
    }
    return out;
  }

  /**
   * Extrage obiectul JSON de restaurare dintr-un .xlsx.
   * @returns {Promise<string|null>} textul JSON, sau null daca nu exista
   */
  async function extractJson(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const entries = zipEntries(u8);
    // foile de calcul + sharedStrings (Excel poate muta textul acolo la re-salvare)
    const cand = entries.filter(function (e) {
      return /^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(e.name);
    });

    for (let i = 0; i < cand.length; i++) {
      let raw;
      try {
        raw = cand[i].method === 0 ? cand[i].data : await inflateRaw(cand[i].data);
      } catch (err) { continue; }

      const txt = new TextDecoder().decode(raw);
      // JSON-ul incepe cu {" ; Excel poate scrie ghilimelele literal sau ca &quot;
      const re = /<t[^>]*>(\{(?:&quot;|")[\s\S]*?)<\/t>/g;
      let m;
      while ((m = re.exec(txt)) !== null) {
        const json = unesc(m[1]);
        try { JSON.parse(json); return json; } catch (err) { /* incearca urmatorul */ }
      }
    }
    return null;
  }

  return { build: build, S: S, extractJson: extractJson };
})();
