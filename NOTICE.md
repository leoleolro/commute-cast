# Third-party components

The code in this repository is MIT licensed. It ships no models and no speech
engines — `pod setup` downloads them onto your machine at install time, and they
carry their own licences. Nothing here redistributes them.

| Component | Licence | Installed by |
|---|---|---|
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (model weights) | Apache-2.0 | `pod setup --kokoro` |
| [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | MIT | `pod setup --kokoro` |
| [onnxruntime](https://onnxruntime.ai/) | MIT | `pod setup --kokoro` |
| [phonemizer](https://github.com/bootphon/phonemizer) | **GPL-3.0** | `pod setup --kokoro` |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | **GPL-3.0** | bundled by `espeakng-loader` |
| [piper-tts](https://github.com/OHF-Voice/piper1-gpl) | **GPL-3.0-or-later** | `pod setup` |
| [Piper voice models](https://huggingface.co/rhasspy/piper-voices) | per-voice (MIT / CC-BY / CC0) | `pod setup` |
| [uv](https://github.com/astral-sh/uv) | MIT / Apache-2.0 | `pod setup --kokoro` |

Some of these are GPL-3.0. They are installed into a local virtual environment
under `~/.local/share/commute-cast` and invoked as separate processes; this
repository neither links against nor distributes them. If you intend to
redistribute a bundle that *includes* those components, the GPL terms apply to
that bundle and you should read them yourself.

Speech synthesis models can be used to imitate voices. The Kokoro voices are
synthetic and not clones of identifiable people; don't use this to impersonate
anyone.
