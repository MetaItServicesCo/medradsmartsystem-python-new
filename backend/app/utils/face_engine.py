"""Enterprise face-recognition engine (OpenCV YuNet detector + SFace recognizer).

Thread-safe, lazily-loaded model singletons. Produces 128-d, L2-normalized
SFace embeddings from landmark-aligned face crops, plus detector-quality and an
advisory liveness signal used by the attendance pipeline.

The models are committed under ``app/ml/models`` and loaded from disk once per
process. Compared with the previous 32x32 grayscale-pixel approach, SFace gives
a real identity embedding whose cosine similarity is stable across lighting and
pose, so the same person actually matches across enrollment and the camera.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import Any, Optional

# Bump when the models or preprocessing change so stored embeddings can be
# invalidated / re-generated rather than silently mismatched.
ENGINE_VERSION = "yunet-2023mar+sface-2021dec:v1"
EMBEDDING_DIM = 128

_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml", "models")
_YUNET_PATH = os.path.join(_MODELS_DIR, "face_detection_yunet_2023mar.onnx")
_SFACE_PATH = os.path.join(_MODELS_DIR, "face_recognition_sface_2021dec.onnx")

_lock = threading.Lock()
_detector = None
_recognizer = None


class FaceEngineUnavailable(RuntimeError):
    """Raised when the face models or OpenCV are not available."""


@dataclass
class DetectedFace:
    row: Any  # 1x15 detection row (used by SFace.alignCrop for landmark alignment)
    x: int
    y: int
    width: int
    height: int
    score: float
    landmarks: list[tuple[int, int]]

    def as_region(self) -> dict[str, Any]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "confidence": round(float(self.score), 3),
        }


def _cv2():
    try:
        import cv2  # noqa: F401
    except Exception as exc:  # pragma: no cover - environment guard
        raise FaceEngineUnavailable("OpenCV is not installed") from exc
    return cv2


def is_ready() -> bool:
    """True when both model files are present on disk."""
    return os.path.exists(_YUNET_PATH) and os.path.exists(_SFACE_PATH)


def _ensure_loaded():
    global _detector, _recognizer
    if _detector is not None and _recognizer is not None:
        return _detector, _recognizer
    with _lock:
        if _detector is None or _recognizer is None:
            cv2 = _cv2()
            if not is_ready():
                raise FaceEngineUnavailable(
                    "Face model files are missing on the server (app/ml/models)"
                )
            # Permissive detection recall (score 0.6); identity is decided later by
            # the SFace match threshold, and enrollment applies its own stricter
            # quality gate. nms 0.3, top_k 5000; input size is set per image.
            _detector = cv2.FaceDetectorYN.create(_YUNET_PATH, "", (320, 320), 0.6, 0.3, 5000)
            _recognizer = cv2.FaceRecognizerSF.create(_SFACE_PATH, "")
    return _detector, _recognizer


def warmup() -> None:
    """Load the models eagerly (called at app startup) so the first request is fast."""
    try:
        _ensure_loaded()
    except FaceEngineUnavailable:
        # Startup must not crash if models are absent; endpoints report the error.
        pass


def detect(image) -> list[DetectedFace]:
    """Detect faces, largest first. Returns [] when none are found."""
    detector, _ = _ensure_loaded()
    height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _num, faces = detector.detect(image)
    results: list[DetectedFace] = []
    if faces is None:
        return results
    for row in faces:
        x, y, box_w, box_h = (int(row[0]), int(row[1]), int(row[2]), int(row[3]))
        landmarks = [(int(row[4 + 2 * i]), int(row[5 + 2 * i])) for i in range(5)]
        results.append(
            DetectedFace(
                row=row.reshape(1, -1),
                x=max(0, x),
                y=max(0, y),
                width=max(1, box_w),
                height=max(1, box_h),
                score=float(row[14]),
                landmarks=landmarks,
            )
        )
    results.sort(key=lambda face: face.width * face.height, reverse=True)
    return results


def embed(image, face: DetectedFace) -> list[float]:
    """Landmark-align the face and return its 128-d L2-normalized SFace embedding."""
    import numpy as np

    _, recognizer = _ensure_loaded()
    aligned = recognizer.alignCrop(image, face.row)
    feature = recognizer.feature(aligned)
    vector = np.asarray(feature, dtype="float32").flatten()
    norm = float(np.linalg.norm(vector)) or 1.0
    vector = vector / norm
    return [round(float(value), 7) for value in vector.tolist()]


def similarity(first: list[float], second: list[float]) -> float:
    """Cosine similarity of two L2-normalized embeddings (higher = more similar)."""
    import numpy as np

    if not first or not second or len(first) != len(second):
        return 0.0
    a = np.asarray(first, dtype="float32")
    b = np.asarray(second, dtype="float32")
    return round(float(np.dot(a, b)), 5)


def sharpness(image, face: Optional[DetectedFace] = None) -> float:
    """Focus measure (variance of Laplacian) over the face crop, used for quality."""
    cv2 = _cv2()
    import numpy as np

    crop = image
    if face is not None:
        crop = image[face.y : face.y + face.height, face.x : face.x + face.width]
    if crop is None or crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(np.var(cv2.Laplacian(gray, cv2.CV_64F)))


def liveness(image, face: DetectedFace) -> float:
    """Advisory liveness score in [0, 1]; higher = more likely a live capture.

    INTERIM heuristic for the advisory phase: normalized crop sharpness (screen
    re-captures and printed photos tend to be softer / show moire). It is only
    used to *flag* attempts for review, never to reject them, and is fully
    superseded by a dedicated anti-spoofing model in the next phase.
    """
    focus = sharpness(image, face)
    # Map focus measure to [0, 1] with a gentle curve; ~120+ reads as clearly live.
    return round(float(min(1.0, focus / 120.0)), 4)
