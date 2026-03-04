"""Text extraction from book engines for TTS — per-format strategies."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from tts_engine_base import TtsBlock

if TYPE_CHECKING:
    from engine_epub import EpubEngine
    from engine_pdf import PdfEngine
    from engine_txt import TxtEngine

# Sentence boundary regex: split after .!? followed by whitespace
_SENTENCE_RE = re.compile(r'(?<=[.!?])\s+')

# Minimum text length to be considered a valid block
_MIN_BLOCK_LEN = 3


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    parts = _SENTENCE_RE.split(text.strip())
    return [s.strip() for s in parts if len(s.strip()) >= _MIN_BLOCK_LEN]


def _split_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs on blank lines."""
    paras = re.split(r'\n\s*\n', text.strip())
    return [p.strip() for p in paras if len(p.strip()) >= _MIN_BLOCK_LEN]


def extract_txt(engine: TxtEngine) -> list[TtsBlock]:
    """Extract text blocks from a TXT engine (QTextBrowser)."""
    try:
        raw = engine._browser.toPlainText()
    except Exception:
        return []

    blocks: list[TtsBlock] = []
    idx = 0
    for para in _split_paragraphs(raw):
        for sentence in _split_sentences(para):
            blocks.append(TtsBlock(index=idx, text=sentence))
            idx += 1
        # If no sentences found (short paragraph), use whole paragraph
        if not _split_sentences(para):
            blocks.append(TtsBlock(index=idx, text=para))
            idx += 1
    return blocks


def extract_pdf(engine: PdfEngine) -> list[TtsBlock]:
    """Extract text blocks from current PDF page via pymupdf."""
    try:
        doc = engine._doc
        page_idx = engine._current_page_index()
        if page_idx < 0 or page_idx >= len(doc):
            return []
        page = doc[page_idx]
        raw = page.get_text("text")
    except Exception:
        return []

    blocks: list[TtsBlock] = []
    idx = 0
    for para in _split_paragraphs(raw):
        for sentence in _split_sentences(para):
            blocks.append(TtsBlock(index=idx, text=sentence, page=page_idx))
            idx += 1
        if not _split_sentences(para):
            blocks.append(TtsBlock(index=idx, text=para, page=page_idx))
            idx += 1
    return blocks


# JavaScript to extract text from EPUB DOM
_EPUB_EXTRACT_JS = """
(function() {
    var blocks = [];
    var walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        { acceptNode: function(node) {
            var tag = node.tagName.toLowerCase();
            if (['p','div','h1','h2','h3','h4','h5','h6','li','blockquote','td','th','figcaption','dt','dd'].indexOf(tag) >= 0) {
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        }}
    );
    var node;
    while (node = walker.nextNode()) {
        var text = node.textContent.trim();
        if (text.length > 2) {
            blocks.push(text);
        }
    }
    return JSON.stringify(blocks);
})();
"""


def extract_epub_js() -> str:
    """Return the JavaScript code to inject for EPUB text extraction."""
    return _EPUB_EXTRACT_JS


def parse_epub_result(json_str: str, href: str = "") -> list[TtsBlock]:
    """Parse the JSON result from EPUB JS extraction into TtsBlocks."""
    import json
    try:
        paragraphs = json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return []

    blocks: list[TtsBlock] = []
    idx = 0
    for para in paragraphs:
        for sentence in _split_sentences(para):
            blocks.append(TtsBlock(index=idx, text=sentence, href=href))
            idx += 1
        if not _split_sentences(para):
            blocks.append(TtsBlock(index=idx, text=para, href=href))
            idx += 1
    return blocks
