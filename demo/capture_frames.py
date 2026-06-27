"""
Capture demo frames from a live Jellyfin instance using Playwright.

Usage:
    pip install playwright
    playwright install chromium
    python3 demo/capture_frames.py --url https://jellyfin.example.com

The script opens Chromium, navigates to the given Jellyfin URL, and
expects the user to already be logged in (session cookie / auto-login).
It then navigates through the demo flow and saves PNG frames to demo/.

Prerequisites on the Jellyfin server:
  - Jellyfin QuickDownload plugin installed
  - File Transformation companion plugin installed (required for script injection)

After capturing, run demo/assemble_video.py to produce the final MP4, then:
    ffmpeg -i ~/Desktop/jellyfin-demo.mp4 \
      -vf "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
      demo/jellyfin-demo.gif
"""
import argparse
import time
from pathlib import Path

OUT = Path(__file__).parent

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://jellyfin.philipscherer.de",
                        help="Base URL of the Jellyfin instance")
    parser.add_argument("--movie-id", default="4a2316651e586cb7a8503a67bfdb32ec",
                        help="Jellyfin item ID of the movie to use for the demo")
    parser.add_argument("--server-id", default="6565c957cda545d184b8a36f5924eaf8",
                        help="Jellyfin server ID")
    args = parser.parse_args()

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 1710, "height": 905})

        # 1. Home page — expect auto-login
        page.goto(f"{args.url}/web/#/home")
        time.sleep(3)
        print("If not logged in, log in now and press Enter to continue...")
        input()

        # 2. Movie detail page
        detail_url = (f"{args.url}/web/#/details"
                      f"?id={args.movie_id}&serverId={args.server_id}")
        page.goto(detail_url)
        time.sleep(3)
        page.screenshot(path=str(OUT / "frame_movie_detail.png"))
        print("Saved frame_movie_detail.png")

        # 3. Open More menu
        page.locator(".mainDetailButtons button", has_text="Mehr").first.click()
        time.sleep(1)
        page.screenshot(path=str(OUT / "frame_more_menu2.png"))
        print("Saved frame_more_menu2.png")

        # 4. Click Download (Transcode…) to open quality picker
        btns = page.locator(".actionSheetMenuItem").all()
        for btn in btns:
            if "Transcode" in btn.text_content():
                btn.click()
                break
        time.sleep(1)
        page.screenshot(path=str(OUT / "frame_quality_picker.png"))
        print("Saved frame_quality_picker.png")

        # 5. Select 720p · 4 Mbps to start download
        btns = page.locator(".actionSheetMenuItem").all()
        for btn in btns:
            if "720p" in btn.text_content() and "4 Mbps" in btn.text_content():
                btn.click()
                break
        time.sleep(2)
        page.screenshot(path=str(OUT / "frame_progress.png"))
        print("Saved frame_progress.png")

        time.sleep(2)
        page.screenshot(path=str(OUT / "frame_progress2.png"))
        print("Saved frame_progress2.png")

        # 6. Cancel
        page.locator("button", has_text="Cancel").click()
        time.sleep(1)
        page.screenshot(path=str(OUT / "frame_cancelled.png"))
        print("Saved frame_cancelled.png")

        browser.close()
        print("\nAll frames saved to demo/. Now run: python3 demo/assemble_video.py")

if __name__ == "__main__":
    main()
