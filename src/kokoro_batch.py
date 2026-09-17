"""Synthesize many lines with one Kokoro voice, in one process.

Loading a 310 MB ONNX graph costs several seconds, so — exactly as with piper —
everything sharing a voice goes through a single invocation rather than one per
line. Reads lines from a file, writes <index>.wav per line into the output dir.

`voice` is either a voice name, or a blend written as "a*0.7+b*0.3" — Kokoro
takes a style vector as readily as a name, and mixing two gives a character
neither one has alone.

Usage: kokoro_batch.py <model_dir> <voice> <speed> <lang> <lines_file> <out_dir>
"""

import os
import sys

import espeakng_loader

# kokoro-onnx phonemizes through espeak-ng. The loader ships its own copy and
# these two variables are what points the phonemizer at it, so this has to be
# set before kokoro_onnx is imported.
os.environ["ESPEAK_DATA_PATH"] = espeakng_loader.get_data_path()
os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = str(espeakng_loader.get_library_path())

import soundfile as sf  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402


def resolve(kokoro, spec):
    """A voice name, or a weighted blend like "af_bella*0.7+af_nicole*0.3"."""
    if "+" not in spec and "*" not in spec:
        return spec
    style = None
    for part in spec.split("+"):
        name, _, weight = part.partition("*")
        vec = kokoro.get_voice_style(name.strip()) * float(weight or 1)
        style = vec if style is None else style + vec
    return style


def main() -> int:
    model_dir, voice, speed, lang, lines_file, out_dir = sys.argv[1:7]

    with open(lines_file, encoding="utf-8") as fh:
        lines = [ln.strip() for ln in fh if ln.strip()]

    kokoro = Kokoro(
        os.path.join(model_dir, "kokoro-v1.0.onnx"),
        os.path.join(model_dir, "voices-v1.0.bin"),
    )

    style = resolve(kokoro, voice)

    os.makedirs(out_dir, exist_ok=True)
    for i, line in enumerate(lines):
        samples, rate = kokoro.create(line, voice=style, speed=float(speed), lang=lang)
        path = os.path.join(out_dir, f"{i:04d}.wav")
        sf.write(path, samples, rate)
        # Node matches clips back up by index, and needs to know the rate to
        # resample from; printing it keeps that out of the filename.
        print(f"WROTE {i} {rate} {path}", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
