# Template execution contract

## Reference

- Source: `C:\Users\legen\Documents\arknights_2\docs\enemy-statistics-guide.docx`
- SHA-256: `4D946B110F1A1DA51B7BF95EE845998A50D51C425FBBDD661A68D182FB8B0A8C`
- Rendered page count: 5
- Sections: 1
- Evidence: visual review of all five pages; `section_audit.py`; `style_lint.py`
- Output must not replace or modify the source document.

## Page system

- US Letter portrait, 8.5 x 11 inches.
- Margins: 1.0 inch on all sides; usable width 6.5 inches / 9360 DXA.
- One section, no different first page, no odd/even split.
- Keep the reference header and footer relationships intact. Header text is
  `ARKNIGHTS ANALYZE TOOL / REFERENCE GUIDE`; footer contains the page field.
- The new guide targets three pages and may use explicit page breaks while
  retaining the reference section properties.

## Typography and components

- Body: Calibri 11 pt with Yu Gothic for East Asian text, #222222, 1.25 line
  spacing, 6 pt after.
- Title: 28 pt bold #0B2545. Kicker: 9.5 pt bold #2E74B5. Subtitle: 13.5 pt
  #5B6570. Metadata: 9.5 pt muted gray.
- Heading 1: 16 pt bold #2E74B5, 18 pt before / 10 pt after, keep with next.
- Heading 2: 13 pt bold #2E74B5, 14 pt before / 7 pt after, keep with next.
- Code/formulas: Consolas; Japanese fallback Yu Gothic.
- Callout: one-cell, fixed-width 9360 DXA table, #F4F6F9 fill, blue left rule,
  generous cell margins.
- Data tables: fixed 9360 DXA width, 120 DXA indent, explicit grids and cell
  widths, repeating header, pale #D6DEE8 borders. Main mapping table uses a
  #1F4D78 header with white text. Comparison tables use #E8EEF5 headers.
- Lists reuse the reference numbering definitions: numId 10 for bullets and
  numId 11 for decimals, both level 0 with 540 DXA left and 270 DXA hanging.

## Content flow and slot map

1. Title block: rewrite title, subtitle, and metadata for the DEF/RES guide.
2. Lead callout: state that ranks are ranges and DEF/RES use different damage
   mechanisms.
3. Page 1: meaning of the ten ranks and the exact app conversion table.
4. Page 2: physical versus Arts formulas, a same-rank worked example, and the
   UI reading workflow.
5. Page 3: base-value limitations, Sp./stage exceptions, terminology warning,
   checklist, and sources.
6. Existing statistical-guide body content is not retained in the new file;
   only its design system, recurring header/footer, styles, numbering, and
   section geometry are retained.

## Package preservation

- Preserve every reference package part byte-for-byte except:
  - `word/document.xml` (new body; original `sectPr` retained),
  - `word/_rels/document.xml.rels` (append external hyperlink relationships),
  - `docProps/core.xml` (title/subject/modified metadata only).
- Preserve styles, numbering, headers, footers, theme, settings, font table,
  relationships other than added hyperlinks, and all opaque parts.
- The builder must verify the reference SHA before authoring and write a
  part-level hash comparison report.

## Fidelity gates

- Reference file hash is unchanged after authoring.
- Only the three allowed package parts differ.
- Page geometry, header/footer, type hierarchy, colors, list geometry, table
  geometry, and callout treatment remain recognizably source-derived.
- Render all final pages and inspect for Japanese glyphs, clipping, overlap,
  table wrapping, and page-break defects.

