from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / ".vendor") not in sys.path:
    sys.path.insert(0, str(ROOT / ".vendor"))

from transcribe_video import (  # noqa: E402
    extract_audio,
    parse_metadata,
    run,
    transcribe,
    write_chunks,
    write_text,
    write_transcript_outputs,
)

import imageio_ffmpeg  # type: ignore  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--audio-track", type=int, default=0, help="Zero-based audio track among audio streams.")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="es")
    parser.add_argument("--chunk-minutes", type=int, default=5)
    args = parser.parse_args()

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    write_text(out_dir / "progress.log", "")
    sys.stdout = (out_dir / "script_stdout.log").open("a", encoding="utf-8", buffering=1)
    sys.stderr = (out_dir / "script_stderr.log").open("a", encoding="utf-8", buffering=1)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    metadata_probe = run([ffmpeg, "-hide_banner", "-i", str(args.audio)], check=False)
    metadata = parse_metadata(metadata_probe.stderr)
    metadata.update(
        {
            "source": str(args.audio),
            "ffmpeg": ffmpeg,
            "selected_audio_track_zero_based": args.audio_track,
            "selected_audio_stream": f"0:a:{args.audio_track}",
        }
    )
    (out_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    write_text(out_dir / "metadata.ffmpeg.txt", metadata_probe.stderr)

    audio_path = out_dir / f"audio_track_{args.audio_track + 1}_16khz_mono.wav"
    extract_audio(ffmpeg, args.audio, audio_path, args.audio_track)

    segments, info = transcribe(audio_path, args.model, out_dir, args.language)
    write_transcript_outputs(segments, out_dir)
    write_chunks(segments, out_dir, args.chunk_minutes)

    summary = {
        "source": str(args.audio),
        "out_dir": str(out_dir),
        "segment_count": len(segments),
        "transcription": info,
    }
    (out_dir / "run_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
