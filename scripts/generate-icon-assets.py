"""Generate Finance Flow AI icon raster assets from the vector master spec.

Draws the pure-icon mark (dark rounded square, indigo border, white flow
line, green trend + node dot) directly with PIL so no SVG rasterizer or new
dependency is required. Geometry mirrors assets/icon.svg (512 viewBox).

Outputs (all under assets/):
  icon.png      512x512 master raster (BrowserWindow icon at runtime)
  icon.ico      multi-size Windows bundle (16/32/48/256, for electron-builder)
"""
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 512
MARK_SCALE = 432 / 372
MARK_CENTER = SIZE / 2
DARK = (37, 37, 38, 255)
INDIGO = (99, 102, 241, 255)
WHITE = (248, 250, 252, 255)
GREEN = (74, 222, 128, 255)

ASSETS = Path(__file__).resolve().parent.parent / "assets"
# Renderer favicon copy (Vite serves src/renderer/public/ at dev and build,
# so the link icon resolves both live and packaged).
PUBLIC_ICON = (
    Path(__file__).resolve().parent.parent / "src" / "renderer" / "public" / "icon.png"
)


def draw_mark(draw: ImageDraw.ImageDraw, s: float) -> None:
    def coordinate(value: float) -> float:
        return (MARK_CENTER + (value - MARK_CENTER) * MARK_SCALE) * s

    def point(x: float, y: float) -> tuple[float, float]:
        return coordinate(x), coordinate(y)

    # Rounded-square body with indigo border.
    draw.rounded_rectangle(
        [coordinate(70), coordinate(70), coordinate(442), coordinate(442)],
        radius=111 * MARK_SCALE * s,
        fill=DARK,
        outline=INDIGO,
        width=max(1, round(22 * MARK_SCALE * s)),
    )
    # White flow line rising to the top-right.
    draw.line(
        [point(119, 350), point(205, 273), point(256, 303), point(393, 179)],
        fill=WHITE,
        width=max(1, round(34 * MARK_SCALE * s)),
        joint="curve",
    )
    # Green trend echo + node dot.
    draw.line(
        [point(119, 384), point(213, 307), point(265, 337), point(393, 213)],
        fill=GREEN[:3] + (230,),
        width=max(1, round(21 * MARK_SCALE * s)),
        joint="curve",
    )
    r = 26 * MARK_SCALE * s
    node_x, node_y = point(393, 179)
    draw.ellipse(
        [node_x - r, node_y - r, node_x + r, node_y + r],
        fill=GREEN,
    )


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), size / SIZE)
    return img


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    master = render(SIZE)
    master.save(ASSETS / "icon.png")
    print(f"wrote {ASSETS / 'icon.png'}")
    ico_sizes = [(16, 16), (32, 32), (48, 48), (256, 256)]
    master.save(ASSETS / "icon.ico", sizes=ico_sizes)
    print(f"wrote {ASSETS / 'icon.ico'}")
    PUBLIC_ICON.parent.mkdir(parents=True, exist_ok=True)
    master.save(PUBLIC_ICON)
    print(f"wrote {PUBLIC_ICON}")


if __name__ == "__main__":
    main()
