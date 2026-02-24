#!/usr/bin/env python3
"""
Resize logo.png (transparent background) for different use cases.

Generates:
- Sidebar logo (24x24)
- Login/loading page logo (80x80)
- Favicons (16x16, 32x32, apple-touch-icon 180x180, .ico)
"""

from PIL import Image
from pathlib import Path


def resize_square(img: Image.Image, size: int) -> Image.Image:
    """Resize square image to target size with LANCZOS resampling."""
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    root = Path(__file__).parent.parent
    public = root / "public"
    public.mkdir(exist_ok=True)

    # Load single source image (transparent background)
    logo = Image.open(root / "logo.png").convert("RGBA")
    print(f"Source logo: {logo.size}")

    # Sidebar logo (24x24)
    sidebar = resize_square(logo, 24)
    sidebar.save(public / "logo-24.png")
    print(f"Sidebar logo: {sidebar.size}")

    # Login/loading page logo (80x80)
    login = resize_square(logo, 80)
    login.save(public / "logo-80.png")
    print(f"Login logo: {login.size}")

    # Favicons
    favicon_16 = resize_square(logo, 16)
    favicon_32 = resize_square(logo, 32)
    apple_touch = resize_square(logo, 180)

    favicon_16.save(public / "favicon-16.png")
    favicon_32.save(public / "favicon-32.png")
    apple_touch.save(public / "apple-touch-icon.png")

    # .ico file (32x32)
    favicon_32.save(public / "favicon.ico", format="ICO")

    print("Favicons generated: 16x16, 32x32, 180x180, .ico")
    print("Done!")


if __name__ == "__main__":
    main()
