#!/bin/bash

# Optimize SVG files and generate icons
# Runs in-place optimization on all .svg files in wwwroot/images
# Generates favicons from mark.svg and PWA/apple-touch icons from happy-delta.svg

set -e

# Check if required tools are installed
if ! command -v svgo &> /dev/null; then
    echo "Error: svgo is not installed"
    echo "Install it with: npm install -g svgo"
    exit 1
fi

if ! command -v rsvg-convert &> /dev/null; then
    echo "Error: rsvg-convert is not installed"
    echo "Install it with: brew install librsvg (macOS) or apt-get install librsvg2-bin (Linux)"
    exit 1
fi

if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is not installed"
    echo "Install it with: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)"
    exit 1
fi

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WWWROOT="$PROJECT_ROOT/src/DeltaBoard.Server/wwwroot"
IMAGES_DIR="$WWWROOT/images"

# Check if the images directory exists
if [ ! -d "$IMAGES_DIR" ]; then
    echo "Error: Directory $IMAGES_DIR does not exist"
    exit 1
fi

echo "Optimizing SVG files in $IMAGES_DIR..."

# Run svgo on all SVG files in the directory
svgo --folder="$IMAGES_DIR" --multipass --pretty

echo "✓ SVG optimization complete"

# Generate favicons from mark.svg
MARK_SVG="$IMAGES_DIR/mark.svg"
HAPPY_SVG="$IMAGES_DIR/happy-delta.svg"

if [ -f "$MARK_SVG" ]; then
    echo ""
    echo "Generating favicons from mark.svg..."

    # Generate PNG favicons from mark.svg (simple logo works well at small sizes)
    rsvg-convert -w 16 -h 16 "$MARK_SVG" -o "$WWWROOT/favicon-16x16.png"
    rsvg-convert -w 32 -h 32 "$MARK_SVG" -o "$WWWROOT/favicon-32x32.png"

    # Generate multi-size favicon.ico
    magick "$WWWROOT/favicon-32x32.png" "$WWWROOT/favicon-16x16.png" "$WWWROOT/favicon.ico"

    # Copy mark.svg as favicon.svg for modern browsers
    cp "$MARK_SVG" "$WWWROOT/favicon.svg"

    echo "✓ Generated favicon-16x16.png (from mark.svg)"
    echo "✓ Generated favicon-32x32.png (from mark.svg)"
    echo "✓ Generated favicon.ico"
    echo "✓ Generated favicon.svg"

    # Generate PWA and apple-touch icons from happy-delta.svg (more detail at larger sizes)
    echo ""
    echo "Generating PWA icons from happy-delta.svg..."
    rsvg-convert -w 180 -h 180 "$HAPPY_SVG" -o "$WWWROOT/apple-touch-icon.png"
    rsvg-convert -w 192 -h 192 "$HAPPY_SVG" -o "$WWWROOT/android-chrome-192x192.png"
    rsvg-convert -w 512 -h 512 "$HAPPY_SVG" -o "$WWWROOT/android-chrome-512x512.png"

    echo "✓ Generated apple-touch-icon.png (from happy-delta.svg)"
    echo "✓ Generated android-chrome-192x192.png (from happy-delta.svg)"
    echo "✓ Generated android-chrome-512x512.png (from happy-delta.svg)"
else
    echo ""
    echo "Warning: mark.svg not found, skipping favicon generation"
fi

echo ""
echo "✓ All optimizations complete!"
