# SPDX-FileCopyrightText: 2026 mothue
# SPDX-License-Identifier: GPL-3.0-only

"""Download the configured OCR models and verify detection and recognition."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from .engine import OcrEngine


def prepare_models(size, model_dir):
    engine = OcrEngine(size, model_dir)
    image = Image.new('RGB', (480, 120), 'white')
    ImageDraw.Draw(image).text(
        (20, 25), 'RYOSHOKU', font=ImageFont.load_default(size=48), fill='black',
    )
    # RapidOCR loads models lazily; nonempty OCR output proves both were loaded.
    if not engine.read(image):
        raise RuntimeError('OCR smoke test did not recognize any text')
    return engine.name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-size', choices=['small', 'medium'], default='medium')
    parser.add_argument('--model-dir', type=Path, required=True)
    args = parser.parse_args()
    name = prepare_models(args.model_size, args.model_dir)
    print(f'OCR models ready: {name}', flush=True)


if __name__ == '__main__':
    main()
