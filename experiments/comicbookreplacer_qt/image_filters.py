"""
Image filter pipeline for the comic reader canvas.

Applies brightness, contrast, saturation, sepia, hue-rotate,
invert, and grayscale to a QPixmap before drawing.
Results are cached per (pixmap-id, settings-hash) to avoid
re-processing every paint frame.
"""

from __future__ import annotations

import hashlib
import struct

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QImage, QPixmap


_filter_cache: dict[str, QPixmap] = {}
_FILTER_CACHE_MAX = 24


def _settings_hash(settings: dict) -> str:
    parts = (
        int(settings.get("image_brightness_pct", 100)),
        int(settings.get("image_contrast_pct", 100)),
        int(settings.get("image_saturate_pct", 100)),
        int(settings.get("image_sepia_pct", 0)),
        int(settings.get("image_hue_deg", 0)),
        int(settings.get("image_invert", 0)),
        int(settings.get("image_grayscale", 0)),
    )
    raw = struct.pack("7i", *parts)
    return hashlib.md5(raw).hexdigest()[:12]


def filters_are_default(settings: dict) -> bool:
    if int(settings.get("image_brightness_pct", 100)) != 100:
        return False
    if int(settings.get("image_contrast_pct", 100)) != 100:
        return False
    if int(settings.get("image_saturate_pct", 100)) != 100:
        return False
    if int(settings.get("image_sepia_pct", 0)) != 0:
        return False
    if int(settings.get("image_hue_deg", 0)) != 0:
        return False
    if int(settings.get("image_invert", 0)):
        return False
    if int(settings.get("image_grayscale", 0)):
        return False
    return True


def apply_filters(pixmap: QPixmap, settings: dict) -> QPixmap:
    if pixmap is None or pixmap.isNull():
        return pixmap
    if filters_are_default(settings):
        return pixmap

    cache_key = f"{id(pixmap)}_{pixmap.cacheKey()}_{_settings_hash(settings)}"
    cached = _filter_cache.get(cache_key)
    if cached is not None and not cached.isNull():
        return cached

    img = pixmap.toImage().convertToFormat(QImage.Format.Format_ARGB32)
    w = img.width()
    h = img.height()
    if w <= 0 or h <= 0:
        return pixmap

    brightness = int(settings.get("image_brightness_pct", 100))
    contrast = int(settings.get("image_contrast_pct", 100))
    saturate = int(settings.get("image_saturate_pct", 100))
    sepia_pct = int(settings.get("image_sepia_pct", 0))
    hue_deg = int(settings.get("image_hue_deg", 0)) % 360
    do_invert = bool(int(settings.get("image_invert", 0)))
    do_grayscale = bool(int(settings.get("image_grayscale", 0)))

    b_factor = max(0.0, brightness / 100.0)
    c_factor = max(0.0, contrast / 100.0)
    s_factor = max(0.0, saturate / 100.0)
    sepia_blend = max(0.0, min(1.0, sepia_pct / 100.0))

    # Build a lookup table for brightness + contrast (R, G, B each 0-255)
    lut = bytearray(256)
    for i in range(256):
        v = float(i)
        # brightness
        v *= b_factor
        # contrast: scale around 128
        v = (v - 128.0) * c_factor + 128.0
        lut[i] = max(0, min(255, int(v + 0.5)))

    # Process scanlines
    for row in range(h):
        line = img.scanLine(row)
        # PySide6 scanLine returns a memoryview
        buf = bytes(line)
        out = bytearray(len(buf))
        for col in range(w):
            off = col * 4
            b_val = buf[off]
            g_val = buf[off + 1]
            r_val = buf[off + 2]
            a_val = buf[off + 3]

            # Apply brightness + contrast via LUT
            r = lut[r_val]
            g = lut[g_val]
            b = lut[b_val]

            # Saturation: lerp toward luminance
            if s_factor != 1.0:
                lum = int(0.299 * r + 0.587 * g + 0.114 * b)
                r = max(0, min(255, int(lum + s_factor * (r - lum))))
                g = max(0, min(255, int(lum + s_factor * (g - lum))))
                b = max(0, min(255, int(lum + s_factor * (b - lum))))

            # Sepia
            if sepia_blend > 0.0:
                sr = min(255, int(r * 0.393 + g * 0.769 + b * 0.189))
                sg = min(255, int(r * 0.349 + g * 0.686 + b * 0.168))
                sb = min(255, int(r * 0.272 + g * 0.534 + b * 0.131))
                inv = 1.0 - sepia_blend
                r = max(0, min(255, int(r * inv + sr * sepia_blend)))
                g = max(0, min(255, int(g * inv + sg * sepia_blend)))
                b = max(0, min(255, int(b * inv + sb * sepia_blend)))

            # Hue rotate (via HSV)
            if hue_deg != 0:
                color = QColor(r, g, b)
                hue = color.hsvHue()
                sat = color.hsvSaturation()
                val = color.value()
                if hue >= 0:
                    hue = (hue + hue_deg) % 360
                    color.setHsv(hue, sat, val, a_val)
                    r = color.red()
                    g = color.green()
                    b = color.blue()

            # Grayscale
            if do_grayscale:
                gray = max(0, min(255, int(0.299 * r + 0.587 * g + 0.114 * b)))
                r = g = b = gray

            # Invert
            if do_invert:
                r = 255 - r
                g = 255 - g
                b = 255 - b

            out[off] = b
            out[off + 1] = g
            out[off + 2] = r
            out[off + 3] = a_val

        # Write back to the image scanline
        dest = img.scanLine(row)
        dest[:len(out)] = out

    result = QPixmap.fromImage(img)

    # Evict old entries if cache is full
    if len(_filter_cache) >= _FILTER_CACHE_MAX:
        keys = list(_filter_cache.keys())
        for k in keys[:len(keys) // 2]:
            del _filter_cache[k]

    _filter_cache[cache_key] = result
    return result


def clear_filter_cache():
    _filter_cache.clear()
