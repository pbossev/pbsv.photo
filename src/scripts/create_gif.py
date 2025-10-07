import os
from PIL import Image
import argparse

def create_gif(input_folder, output_file, fps=10):
    # Get all image files from the folder, sorted
    valid_extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif')
    images = [os.path.join(input_folder, f) for f in sorted(os.listdir(input_folder)) 
              if f.lower().endswith(valid_extensions)]

    if not images:
        print("No images found in the folder.")
        return

    # Open images
    frames = [Image.open(img) for img in images]

    # Calculate duration per frame in milliseconds
    duration = int(1000 / fps)

    # Save as GIF
    frames[0].save(output_file, format='GIF', append_images=frames[1:], save_all=True, duration=duration, loop=0)
    print(f"GIF saved as {output_file} at {fps} FPS.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a GIF from images in a folder.")
    parser.add_argument("input_folder", help="Path to input folder containing images")
    parser.add_argument("output_file", help="Output GIF file name")
    parser.add_argument("--fps", type=int, default=10, help="Frames per second for the GIF (default: 10)")
    args = parser.parse_args()

    create_gif(args.input_folder, args.output_file, args.fps)
