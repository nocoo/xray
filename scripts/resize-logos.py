#!/usr/bin/env python3
"""Generate transparent app/browser marks and separate touch/social presentations."""

from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "packages/ui/public"


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    foreground = Image.open(ROOT / "logo.png").convert("RGBA")
    square = Image.open(ROOT / "assets/brand/icon.png").convert("RGBA")
    rounded = Image.open(ROOT / "assets/brand/icon-rounded.png").convert("RGBA")
    for size, name in [(24, "logo-24.png"), (80, "logo-80.png"), (32, "favicon.png")]:
        foreground.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name)
    foreground.save(PUBLIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    square.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB").save(PUBLIC / "apple-touch-icon.png")
    social = Image.new("RGB", (1200, 630), (24, 24, 27))
    mark = rounded.resize((252, 252), Image.Resampling.LANCZOS)
    social.paste(mark, (474, 189), mark)
    social.save(PUBLIC / "opengraph-image.png")
    shutil.copyfile(ROOT / "logo.png", PUBLIC / "logo.png")

    print("Generated transparent app/browser marks and touch/social presentations.")


if __name__ == "__main__":
    main()
