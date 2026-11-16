class ExtractionError(Exception):
    """A document that cannot be turned into text. `code` is shown to users (see contracts)."""

    http_status = 422
    code = "EXTRACTION_FAILED"


class UnsupportedType(ExtractionError):
    http_status = 415
    code = "UNSUPPORTED_TYPE"


class FileCorrupted(ExtractionError):
    code = "FILE_CORRUPTED"


class PdfNoTextLayer(ExtractionError):
    """A scanned PDF: pages are images. OCR is out of scope for the MVP."""

    code = "PDF_NO_TEXT_LAYER"


class PdfEncrypted(ExtractionError):
    code = "PDF_ENCRYPTED"


class EmptyDocument(ExtractionError):
    code = "EMPTY_DOCUMENT"
