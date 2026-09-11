"""
Image cleanup only — never anything that could alter legibility content
(no cropping based on guessed regions, no text-aware edits). Purely:
orientation, contrast, denoise. Uses OpenCV + Pillow.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


def preprocess_image(input_path: Path, output_path: Path) -> Path:
    """Deskew, denoise, and normalize contrast. Writes a new file; never
    overwrites the original (the raw upload should always remain
    retrievable for audit/debugging).
    """
    import cv2

    img = cv2.imread(str(input_path))
    if img is None:
        # Fall back to Pillow for formats OpenCV occasionally chokes on (e.g. some WEBP)
        pil_img = Image.open(input_path).convert("RGB")
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Deskew: estimate skew angle from text-like contours, rotate to correct
    deskewed = _deskew(denoised)

    # Contrast normalization (CLAHE — adaptive, avoids blowing out faint pencil/pen strokes)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrasted = clahe.apply(deskewed)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), contrasted)
    return output_path


def _deskew(gray_img) -> "np.ndarray":
    import cv2

    inverted = cv2.bitwise_not(gray_img)
    coords = np.column_stack(np.where(inverted > 0))
    if coords.shape[0] < 50:
        # not enough foreground pixels to estimate a reliable angle — skip rather than guess
        return gray_img

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    # Small-angle guard: don't "correct" noise as if it were real skew
    if abs(angle) < 0.5 or abs(angle) > 15:
        return gray_img

    (h, w) = gray_img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        gray_img, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
