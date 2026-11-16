import io
from pathlib import Path

import pytest
from docx import Document
from fpdf import FPDF
from pypdf import PdfWriter

from app.extraction.errors import (
    EmptyDocument,
    FileCorrupted,
    PdfEncrypted,
    PdfNoTextLayer,
    UnsupportedType,
)
from app.extraction.extract import DOCX, PDF, TXT, extract_document
from app.extraction.segmentation import MAX_SEGMENT_TOKENS, segment_paragraphs
from app.extraction.tokens import count_tokens

SAMPLES = Path(__file__).resolve().parents[3] / "samples"


def sample(name: str) -> bytes:
    return (SAMPLES / name).read_bytes()


def make_pdf(pages: list[str]) -> bytes:
    pdf = FPDF()
    for text in pages:
        pdf.add_page()
        pdf.set_font("Helvetica", size=12)
        pdf.multi_cell(0, 8, text)
    return bytes(pdf.output())


def make_docx(paragraphs: list[str], table: list[list[str]] | None = None) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    if table:
        t = doc.add_table(rows=len(table), cols=len(table[0]))
        for r, row in enumerate(table):
            for c, cell in enumerate(row):
                t.cell(r, c).text = cell
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class TestSamples:
    def test_pdf_has_pages_and_page_numbers(self):
        r = extract_document(sample("01_clinicbook_requirements_en.pdf"), PDF)
        assert r.page_count == 2
        assert {s.page for s in r.segments} == {1, 2}
        assert "ClinicBook" in r.segments[0].text
        assert [s.index for s in r.segments] == list(range(len(r.segments)))
        assert r.token_count == sum(s.token_count for s in r.segments) > 0

    def test_docx_text_is_extracted_without_pages(self):
        r = extract_document(sample("02_meeting_notes_en.docx"), DOCX)
        assert r.page_count is None
        assert all(s.page is None for s in r.segments)
        assert "Meeting Notes" in r.segments[0].text

    def test_cp1251_text_is_decoded_to_real_cyrillic(self):
        r = extract_document(sample("03_client_email_ru_cp1251.txt"), TXT)
        assert r.encoding == "cp1251"
        assert "ClinicBook" in r.segments[0].text
        assert "Дмитрий Ковалев" in r.segments[0].text  # not mojibake

    def test_injection_document_is_just_text(self):
        # extraction never executes or filters content; later steps treat it strictly as data
        r = extract_document(sample("04_vendor_notes_with_injection.txt"), TXT)
        assert r.segments

    def test_scan_without_text_layer_gets_a_clear_error(self):
        with pytest.raises(PdfNoTextLayer):
            extract_document(sample("05_scanned_addendum_no_text.pdf"), PDF)

    def test_corrupted_pdf_is_reported_not_crashed(self):
        with pytest.raises(FileCorrupted):
            extract_document(sample("06_corrupted.pdf"), PDF)


class TestFormats:
    def test_generated_multi_page_pdf_keeps_page_numbers(self):
        pages = ["First page about billing.", "Second page about reports."]
        r = extract_document(make_pdf(pages), PDF)
        assert [s.page for s in r.segments] == [1, 2]

    def test_docx_tables_are_included_in_order(self):
        data = make_docx(["Intro paragraph"], [["Role", "Access"], ["Admin", "Full"]])
        text = " ".join(s.text for s in extract_document(data, DOCX).segments)
        assert (
            text.index("Intro paragraph") < text.index("Role | Access") < text.index("Admin | Full")
        )

    def test_utf8_with_bom_text(self):
        r = extract_document("﻿Привет, мир! Это тест.".encode(), TXT)
        assert r.segments[0].text.startswith("Привет")

    def test_encrypted_pdf(self):
        writer = PdfWriter()
        writer.add_blank_page(200, 200)
        writer.encrypt("secret")
        buf = io.BytesIO()
        writer.write(buf)
        with pytest.raises(PdfEncrypted):
            extract_document(buf.getvalue(), PDF)

    def test_empty_text_file_has_no_content(self):
        with pytest.raises(EmptyDocument):
            extract_document(b"   \n\n  ", TXT)

    def test_garbage_docx_is_corrupted(self):
        with pytest.raises(FileCorrupted):
            extract_document(b"PK\x03\x04 not really a zip", DOCX)

    def test_unknown_mime_is_unsupported(self):
        with pytest.raises(UnsupportedType):
            extract_document(b"x", "image/png")


class TestSegmentation:
    def test_segments_respect_the_token_limit(self):
        lines = [f"Sentence number {i} says something useful about the system." for i in range(200)]
        segments = segment_paragraphs(["\n".join(lines)], None, 0)
        assert len(segments) > 1
        assert all(s.token_count <= MAX_SEGMENT_TOKENS for s in segments)
        assert [s.index for s in segments] == list(range(len(segments)))

    def test_a_giant_unbroken_line_is_still_split(self):
        segments = segment_paragraphs(["word " * 5000], None, 0)
        assert len(segments) > 1
        assert all(count_tokens(s.text) <= MAX_SEGMENT_TOKENS for s in segments)

    def test_short_paragraphs_are_packed_together(self):
        segments = segment_paragraphs(["one", "two", "three"], 3, 10)
        assert len(segments) == 1
        assert segments[0].page == 3 and segments[0].index == 10

    def test_nul_bytes_and_blank_paragraphs_are_dropped(self):
        segments = segment_paragraphs(["a\x00b", "   ", ""], None, 0)
        assert [s.text for s in segments] == ["ab"]

    def test_no_text_means_no_segments(self):
        assert segment_paragraphs(["", " "], None, 0) == []
