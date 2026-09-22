#!/usr/bin/env python3
"""
Generate brand assets from the master Rabbit logo.
Creates favicons, apple-touch-icon, and in-app logos.
"""

from PIL import Image
import os

# Paths
source_logo = "/home/ubuntu/.cursor/projects/workspace/uploads/rabbit-logo_97a1.png"
output_dir = "/workspace/web/public"

# Ensure output directory exists
os.makedirs(output_dir, exist_ok=True)

# Load the source image
img = Image.open(source_logo)
print(f"Source image size: {img.size}")
print(f"Source image mode: {img.mode}")

# For favicon, we want a tight crop on the bunny mascot to keep it readable
# The bunny appears to be centered in the image
# Let's create both a full version and a cropped version

# 1. Favicon 32×32 (cropped for better readability)
print("\nGenerating favicon-32x32.png...")
# Crop the center portion focusing on the bunny
width, height = img.size
crop_percentage = 0.7  # Keep 70% of the image centered on the mascot
crop_left = int(width * (1 - crop_percentage) / 2)
crop_top = int(height * (1 - crop_percentage) / 2)
crop_right = int(width * (1 + crop_percentage) / 2)
crop_bottom = int(height * (1 + crop_percentage) / 2)

cropped = img.crop((crop_left, crop_top, crop_right, crop_bottom))
favicon_32 = cropped.resize((32, 32), Image.Resampling.LANCZOS)
favicon_32.save(os.path.join(output_dir, "favicon-32x32.png"))

# 2. Favicon 48×48 (cropped)
print("Generating favicon-48x48.png...")
favicon_48 = cropped.resize((48, 48), Image.Resampling.LANCZOS)
favicon_48.save(os.path.join(output_dir, "favicon-48x48.png"))

# 3. Apple Touch Icon 180×180 (full logo)
print("Generating apple-touch-icon.png...")
apple_touch = img.resize((180, 180), Image.Resampling.LANCZOS)
apple_touch.save(os.path.join(output_dir, "apple-touch-icon.png"))

# 4. In-app logo 512×512 (full logo)
print("Generating logo-512.png...")
logo_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
logo_512.save(os.path.join(output_dir, "logo-512.png"))

# 5. Smaller in-app logo 256×256
print("Generating logo-256.png...")
logo_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
logo_256.save(os.path.join(output_dir, "logo-256.png"))

# 6. Header logo 120×120 (full logo for header display)
print("Generating logo-120.png...")
logo_120 = img.resize((120, 120), Image.Resampling.LANCZOS)
logo_120.save(os.path.join(output_dir, "logo-120.png"))

# 7. OG image 512×512 (full logo with padding for social media)
print("Generating og-image.png...")
og_image = img.resize((512, 512), Image.Resampling.LANCZOS)
og_image.save(os.path.join(output_dir, "og-image.png"))

# 8. Generate ICO file with multiple sizes
print("Generating favicon.ico...")
favicon_ico = Image.new('RGBA', (48, 48), (255, 255, 255, 0))
favicon_ico.paste(favicon_48, (0, 0))
favicon_ico.save(
    os.path.join(output_dir, "favicon.ico"),
    format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48)]
)

print("\n✓ All brand assets generated successfully!")
print(f"Output directory: {output_dir}")
print("\nGenerated files:")
for filename in sorted(os.listdir(output_dir)):
    if filename.endswith(('.png', '.ico')):
        filepath = os.path.join(output_dir, filename)
        size = os.path.getsize(filepath)
        print(f"  - {filename} ({size:,} bytes)")
