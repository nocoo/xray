#!/usr/bin/env python3
"""
Resize logo.png (transparent background) into all derived assets.

Single source of truth: <root>/logo.png

Outputs:
  public/logo-24.png          24x24   Sidebar branding
  public/logo-80.png          80x80   Login page / loading screen
  src/app/icon.png             32x32   Next.js file-convention favicon
  src/app/apple-icon.png      180x180  Next.js file-convention apple touch icon
  src/app/favicon.ico          multi   Next.js file-convention ICO (16+32)
  src/app/opengraph-image.png 1200x630 Next.js file-convention OG image
"""

from PIL import Image
from pathlib import Path


def resize_square(img: Image.Image, size: int) -> Image.Image:
    """Resize square image to target size with LANCZOS resampling."""
    return img.resize((size, size), Image.Resampling.LANCZOS)


def create_og_image(logo: Image.Image, bg_color: str = "#09090b") -> Image.Image:
    """Create a 1200x630 OG image with the logo centered on a solid background."""
    from PIL import ImageColor

    width, height = 1200, 630
    bg = Image.new("RGBA", (width, height), ImageColor.getrgb(bg_color) + (255,))

    # Scale logo to fit comfortably (40% of canvas height)
    logo_size = int(height * 0.4)
    scaled = resize_square(logo, logo_size)

    # Center the logo
    x = (width - logo_size) // 2
    y = (height - logo_size) // 2
    bg.paste(scaled, (x, y), scaled)  # use alpha mask

    return bg.convert("RGB")


def main():
    root = Path(__file__).parent.parent
    public = root / "public"
    app = root / "src" / "app"
    public.mkdir(exist_ok=True)
    app.mkdir(parents=True, exist_ok=True)

    # Load single source image (transparent background)
    logo = Image.open(root / "logo.png").convert("RGBA")
    print(f"Source logo: {logo.size}")

    # --- public/ assets (referenced by <img> tags) ---

    sidebar = resize_square(logo, 24)
    sidebar.save(public / "logo-24.png")
    print(f"  public/logo-24.png        {sidebar.size}")

    login = resize_square(logo, 80)
    login.save(public / "logo-80.png")
    print(f"  public/logo-80.png        {login.size}")

    # --- src/app/ assets (Next.js file-based metadata convention) ---

    # icon.png → <link rel="icon"> (32x32)
    icon = resize_square(logo, 32)
    icon.save(app / "icon.png")
    print(f"  src/app/icon.png          {icon.size}")

    # apple-icon.png → Apple touch icon (180x180)
    apple = resize_square(logo, 180)
    apple.save(app / "apple-icon.png")
    print(f"  src/app/apple-icon.png    {apple.size}")

    # favicon.ico → multi-size ICO (16 + 32)
    favicon_16 = resize_square(logo, 16)
    favicon_32 = resize_square(logo, 32)
    favicon_32.save(
        app / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32)],
        append_images=[favicon_16],
    )
    print(f"  src/app/favicon.ico       16x16 + 32x32")

    # opengraph-image.png → OG image (1200x630)
    og = create_og_image(logo)
    og.save(app / "opengraph-image.png", quality=90)
    print(f"  src/app/opengraph-image.png {og.size}")

    print("\nDone! All assets generated from logo.png")


if __name__ == "__main__":
    main()
