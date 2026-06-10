from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / ".vendor"
if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

from PIL import Image, ImageDraw, ImageFont  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("screenshots_dir", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--rows", type=int, default=5)
    parser.add_argument("--width", type=int, default=320)
    parser.add_argument("--height", type=int, default=180)
    args = parser.parse_args()

    shots = sorted(args.screenshots_dir.glob("shot_*.jpg"))
    args.out.mkdir(parents=True, exist_ok=True)

    font = ImageFont.load_default()
    pad = 18
    label_h = 20
    per_page = args.cols * args.rows
    pages = math.ceil(len(shots) / per_page)

    for page in range(pages):
        subset = shots[page * per_page : (page + 1) * per_page]
        canvas = Image.new(
            "RGB",
            (args.cols * (args.width + pad) + pad, args.rows * (args.height + label_h + pad) + pad),
            "white",
        )
        draw = ImageDraw.Draw(canvas)
        for index, path in enumerate(subset):
            image = Image.open(path).convert("RGB")
            image.thumbnail((args.width, args.height))
            x = pad + (index % args.cols) * (args.width + pad)
            y = pad + (index // args.cols) * (args.height + label_h + pad)
            canvas.paste(image, (x, y))
            draw.text((x, y + args.height + 3), path.stem.replace("shot_", ""), fill=(0, 0, 0), font=font)
        canvas.save(args.out / f"contact_sheet_{page + 1:02d}.jpg", quality=88)

    print(f"{len(shots)} screenshots -> {pages} contact sheets")


if __name__ == "__main__":
    main()
