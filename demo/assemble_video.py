"""
Assemble jellyfin-demo.mp4 from captured frames.

Usage:
    pip install opencv-python
    python3 demo/assemble_video.py

To re-capture frames, run demo/capture_frames.py first (requires the
Playwright MCP browser session to be active and logged in to Jellyfin).

- Blurs top nav bar (user avatar / domain visible there)
- Draws an arrow cursor with click ripple at each interaction point
- Frame source: demo/frame_*.png  (committed alongside this script)
"""
import cv2
import numpy as np
from pathlib import Path

FRAMES_DIR = Path(__file__).parent
OUTPUT = Path.home() / "Desktop" / "jellyfin-demo.mp4"
FPS = 25

# Image is 1710 x 905 px (CSS px = image px; Playwright saves at CSS resolution)
# Cursor positions measured via getBoundingClientRect() on live elements.
# cursor=(x,y), click=True adds a ripple ring to signal a click
SEQUENCE = [
    # (filename, hold_seconds, cursor_xy, click)
    ("frame_movie_detail.png",   3.5, (1627, 308), True),   # clicking ⋯ "Mehr" button
    ("frame_more_menu2.png",     3.0, (1538, 204), True),   # clicking "Download (Transcode…)"
    ("frame_quality_picker.png", 3.5, (855,  700), True),   # clicking "720p · 4 Mbps"
    ("frame_progress.png",       2.5, (1413, 864), False),  # watching progress
    ("frame_progress2.png",      2.5, (1413, 864), True),   # clicking ✕ Cancel
    ("frame_cancelled.png",      2.0, (1413, 864), False),  # cancelled
]

def blur_region(img, x, y, w, h, ksize=61):
    roi = img[y:y+h, x:x+w]
    img[y:y+h, x:x+w] = cv2.GaussianBlur(roi, (ksize, ksize), 0)

def draw_cursor(img, cx, cy, clicking=False):
    """Draw a clean arrow cursor + click ripple."""
    # Arrow cursor polygon (pointing top-left)
    pts = np.array([
        [cx,      cy],
        [cx,      cy + 28],
        [cx + 8,  cy + 21],
        [cx + 14, cy + 33],
        [cx + 18, cy + 31],
        [cx + 12, cy + 19],
        [cx + 22, cy + 19],
    ], dtype=np.int32)

    # Shadow (slightly offset dark outline for visibility on both light/dark BG)
    shadow = pts + np.array([2, 2])
    cv2.fillPoly(img, [shadow], (30, 30, 30))
    # White fill
    cv2.fillPoly(img, [pts], (255, 255, 255))
    # Dark border
    cv2.polylines(img, [pts], True, (40, 40, 40), 1, cv2.LINE_AA)

    if clicking:
        # Ripple ring
        cv2.circle(img, (cx, cy), 22, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.circle(img, (cx, cy), 14, (200, 200, 200), 1, cv2.LINE_AA)

def process_frame(path, cursor_xy, clicking):
    img = cv2.imread(str(path))
    H, W = img.shape[:2]

    # Blur full top nav bar (covers domain hint + user avatar)
    blur_region(img, 0, 0, W, 55)

    draw_cursor(img, cursor_xy[0], cursor_xy[1], clicking)
    return img

def main():
    first = cv2.imread(str(FRAMES_DIR / SEQUENCE[0][0]))
    H, W = first.shape[:2]

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(OUTPUT), fourcc, FPS, (W, H))

    for fname, seconds, cursor, clicking in SEQUENCE:
        img = process_frame(FRAMES_DIR / fname, cursor, clicking)
        for _ in range(int(seconds * FPS)):
            out.write(img)

    out.release()
    size_kb = OUTPUT.stat().st_size // 1024
    print(f"Written: {OUTPUT}  ({size_kb} KB)")

if __name__ == "__main__":
    main()
