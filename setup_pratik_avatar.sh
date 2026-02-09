#!/bin/bash
# Pratik Avatar Setup Script
# Automates the complete workflow: Install Blender, create morph targets, merge animations

set -e  # Exit on error

echo "===================================="
echo "Pratik Avatar Setup Script"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AVATAR_DIR="/Users/harshui/Documents/FutureScape/VR Avatar"
MODELS_DIR="$AVATAR_DIR/receptionist-react/public/models"
INPUT_AVATAR="$MODELS_DIR/pratik_avatar.glb"
MORPH_AVATAR="$MODELS_DIR/pratik_avatar_with_morphs.glb"
FINAL_AVATAR="$MODELS_DIR/pratik_final.glb"

# Step 1: Check/Install Blender
echo "Step 1: Checking Blender installation..."
if command -v blender &> /dev/null; then
    echo -e "${GREEN}✓${NC} Blender is installed: $(blender --version | head -1)"
else
    echo -e "${YELLOW}⚠${NC} Blender not found. Installing via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew not found. Please install from https://brew.sh"
        exit 1
    fi
    
    echo "Installing Blender (this may take 5-10 minutes)..."
    brew install --cask blender
    echo -e "${GREEN}✓${NC} Blender installed"
fi

# Find Blender executable
if command -v blender &> /dev/null; then
    BLENDER_CMD="blender"
elif [ -f "/Applications/Blender.app/Contents/MacOS/Blender" ]; then
    BLENDER_CMD="/Applications/Blender.app/Contents/MacOS/Blender"
else
    echo "❌ Cannot find Blender executable"
    exit 1
fi

echo ""

# Step 2: Create Morph Targets
echo "Step 2: Creating morph targets (eyeBlink, visemes, expressions)..."
if [ -f "$MORPH_AVATAR" ]; then
    echo -e "${YELLOW}⚠${NC} $MORPH_AVATAR already exists"
    read -p "Overwrite? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping morph target creation"
        SKIP_MORPH=true
    fi
fi

if [ "$SKIP_MORPH" != "true" ]; then
    echo "Running Blender script (this will take 1-2 minutes)..."
    cd "$AVATAR_DIR"
    "$BLENDER_CMD" -b "$INPUT_AVATAR" --python blender_auto_morph_targets.py
    
    if [ -f "$MORPH_AVATAR" ]; then
        echo -e "${GREEN}✓${NC} Morph targets created: $MORPH_AVATAR"
        echo "   File size: $(du -h "$MORPH_AVATAR" | cut -f1)"
    else
        echo "❌ Failed to create morph targets"
        exit 1
    fi
fi

echo ""

# Step 3: Merge Mixamo Animations
echo "Step 3: Merging Mixamo animations..."
if [ -f "$FINAL_AVATAR" ]; then
    echo -e "${YELLOW}⚠${NC} $FINAL_AVATAR already exists"
    read -p "Overwrite? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping animation merge"
        SKIP_ANIM=true
    fi
fi

if [ "$SKIP_ANIM" != "true" ]; then
    echo "Running Blender animation merger (this will take 2-3 minutes)..."
    cd "$AVATAR_DIR"
    "$BLENDER_CMD" -b "$MORPH_AVATAR" --python blender_merge_animations.py
    
    if [ -f "$FINAL_AVATAR" ]; then
        echo -e "${GREEN}✓${NC} Final avatar created: $FINAL_AVATAR"
        echo "   File size: $(du -h "$FINAL_AVATAR" | cut -f1)"
    else
        echo "❌ Failed to merge animations"
        exit 1
    fi
fi

echo ""

# Step 4: Verify Output
echo "Step 4: Verification..."
echo "Checking file sizes:"
echo "  Original:     $(du -h "$INPUT_AVATAR" | cut -f1)    $INPUT_AVATAR"
if [ -f "$MORPH_AVATAR" ]; then
    echo "  With morphs:  $(du -h "$MORPH_AVATAR" | cut -f1)    $MORPH_AVATAR"
fi
if [ -f "$FINAL_AVATAR" ]; then
    echo "  Final:        $(du -h "$FINAL_AVATAR" | cut -f1)    $FINAL_AVATAR"
fi

echo ""
echo -e "${GREEN}✅ SETUP COMPLETE!${NC}"
echo ""
echo "Next steps:"
echo "1. Open Blender to verify:"
echo "   blender $FINAL_AVATAR"
echo ""
echo "2. Check Shape Keys panel (should show 17 morph targets)"
echo "3. Check Action Editor (should show 6 animations: Idle, Wave, Talking, Nod, Point, Bow)"
echo ""
echo "Ready to update React code!"
