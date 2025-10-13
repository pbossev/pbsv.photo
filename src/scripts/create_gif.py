#!/usr/bin/env python3
"""
Efficient GIF maker with automatic downscaling & optimization.

Usage:
    python create_gif.py input_folder output.gif [--fps FPS] [--max_width MAX_WIDTH] [--webp]
"""
import os, sys, argparse
from PIL import Image, UnidentifiedImageError

def find_images(folder):
    exts = (".png", ".jpg", ".jpeg", ".bmp", ".tiff")
    files = sorted(f for f in os.listdir(folder)
                   if f.lower().endswith(exts) and os.path.isfile(os.path.join(folder, f)))
    return [os.path.join(folder, f) for f in files]

def resize_auto(im, max_width):
    w, h = im.size
    if w > max_width:
        ratio = max_width / w
        im = im.resize((max_width, int(h * ratio)), Image.LANCZOS)
    return im

def load_frames(paths, max_width, bg_color=(255,255,255)):
    frames = []
    for p in paths:
        try:
            with Image.open(p) as im:
                im = im.convert("RGB")
                im = resize_auto(im, max_width)
                frames.append(im)
        except UnidentifiedImageError:
            print(f"⚠️ Skipping unreadable file: {p}", file=sys.stderr)
    return frames

def create_gif(input_folder, output_file, fps, max_width, webp=False):
    files = find_images(input_folder)
    if not files:
        raise FileNotFoundError("No images found")

    print(f"🖼  Found {len(files)} images. Resizing to ≤{max_width}px wide...")
    frames = load_frames(files, max_width)
    if not frames:
        raise RuntimeError("No valid frames loaded")

    duration = int(1000 / fps)

    # choose format
    fmt = "WEBP" if webp else "GIF"
    ext = ".webp" if webp else ".gif"
    if not output_file.lower().endswith(ext):
        output_file += ext

    print(f"💾 Saving {fmt} ({len(frames)} frames, {fps} FPS)...")
    save_kwargs = dict(save_all=True, append_images=frames[1:], duration=duration, loop=0)
    if not webp:
        save_kwargs.update(dict(optimize=True, disposal=2))
    else:
        save_kwargs.update(dict(quality=80, method=6))
    frames[0].save(output_file, **save_kwargs)

    size = os.path.getsize(output_file) / 1_000_000
    print(f"✅ Done: {output_file} ({size:.1f} MB)")

def main():
    parser = argparse.ArgumentParser(description="Create optimized GIF or WebP animation.")
    parser.add_argument("input_folder")
    parser.add_argument("output_file")
    parser.add_argument("--fps", type=int, default=10)
    parser.add_argument("--max_width", type=int, default=720)
    parser.add_argument("--webp", action="store_true", help="Output animated WebP instead of GIF (smaller & better quality)")
    args = parser.parse_args()

    try:
        create_gif(args.input_folder, args.output_file, args.fps, args.max_width, args.webp)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
