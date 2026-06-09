from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / ".vendor"
if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

import imageio_ffmpeg  # type: ignore
from faster_whisper import WhisperModel  # type: ignore
from PIL import Image, ImageChops, ImageStat  # type: ignore


@dataclass
class Segment:
    index: int
    start: float
    end: float
    text: str


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print(">", " ".join(f'"{part}"' if " " in part else part for part in command), flush=True)
    return subprocess.run(command, check=check, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def format_time(seconds: float, srt: bool = False) -> str:
    millis = int(round((seconds - int(seconds)) * 1000))
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    sep = "," if srt else "."
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{millis:03d}"


def plain_time(seconds: float) -> str:
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}-{m:02d}-{s:02d}"


def parse_metadata(stderr: str) -> dict[str, object]:
    duration_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", stderr)
    duration_seconds = None
    if duration_match:
        h, m, s = duration_match.groups()
        duration_seconds = int(h) * 3600 + int(m) * 60 + float(s)

    streams: list[dict[str, object]] = []
    for line in stderr.splitlines():
        stream_match = re.search(r"Stream #0:(\d+).*?:\s*([^:]+):\s*(.*)", line)
        if not stream_match:
            continue
        idx, kind, rest = stream_match.groups()
        streams.append({"index": int(idx), "kind": kind.strip(), "description": rest.strip()})

    return {"duration_seconds": duration_seconds, "streams": streams}


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def append_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(text)


def extract_audio(ffmpeg: str, video: Path, output: Path, audio_track: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and output.stat().st_size > 1024:
        print(f"Audio already exists: {output}")
        return
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-i",
        str(video),
        "-map",
        f"0:a:{audio_track}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output),
    ]
    result = run(command)
    write_text(output.with_suffix(".ffmpeg.log"), result.stderr)


def screenshot_timestamp(path: Path) -> float:
    match = re.search(r"shot_(\d{2})-(\d{2})-(\d{2})", path.name)
    if not match:
        return 0.0
    h, m, s = (int(value) for value in match.groups())
    return h * 3600 + m * 60 + s


def rms_image_delta(a: Image.Image, b: Image.Image) -> float:
    diff = ImageChops.difference(a, b)
    stat = ImageStat.Stat(diff)
    return sum(value**2 for value in stat.rms) ** 0.5


def dedupe_screenshots(raw_dir: Path, final_dir: Path, threshold: float) -> list[dict[str, object]]:
    final_dir.mkdir(parents=True, exist_ok=True)
    kept: list[dict[str, object]] = []
    last_thumb: Image.Image | None = None
    for raw in sorted(raw_dir.glob("shot_*.jpg")):
        with Image.open(raw) as img:
            thumb = img.convert("L").resize((96, 54))
            delta = None if last_thumb is None else rms_image_delta(thumb, last_thumb)
            if last_thumb is None or (delta is not None and delta >= threshold):
                target = final_dir / raw.name
                if not target.exists():
                    raw.replace(target)
                else:
                    raw.unlink(missing_ok=True)
                last_thumb = thumb.copy()
                kept.append(
                    {
                        "file": str(target),
                        "time_seconds": screenshot_timestamp(target),
                        "time": format_time(screenshot_timestamp(target)),
                        "delta": delta,
                    }
                )
            else:
                raw.unlink(missing_ok=True)
    return kept


def extract_screenshots(
    ffmpeg: str,
    video: Path,
    out_dir: Path,
    every_seconds: int,
    width: int,
    threshold: float,
) -> list[dict[str, object]]:
    raw_dir = out_dir / "screenshots_raw"
    final_dir = out_dir / "screenshots"
    raw_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(final_dir.glob("shot_*.jpg"))
    if existing:
        return [
            {"file": str(path), "time_seconds": screenshot_timestamp(path), "time": format_time(screenshot_timestamp(path))}
            for path in existing
        ]

    pattern = raw_dir / "shot_%02d.jpg"
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-i",
        str(video),
        "-vf",
        f"fps=1/{every_seconds},scale={width}:-2",
        "-q:v",
        "3",
        str(pattern),
    ]
    result = run(command)
    write_text(out_dir / "screenshots.ffmpeg.log", result.stderr)

    renamed: list[Path] = []
    for idx, path in enumerate(sorted(raw_dir.glob("shot_*.jpg"))):
        seconds = idx * every_seconds
        new_path = raw_dir / f"shot_{plain_time(seconds)}.jpg"
        path.rename(new_path)
        renamed.append(new_path)

    kept = dedupe_screenshots(raw_dir, final_dir, threshold)
    try:
        raw_dir.rmdir()
    except OSError:
        pass
    return kept


def transcribe(audio: Path, model_name: str, out_dir: Path, language: str) -> tuple[list[Segment], dict[str, object]]:
    segments_path = out_dir / "transcript_segments.json"
    info_path = out_dir / "transcription_info.json"
    progress_path = out_dir / "progress.log"
    if segments_path.exists() and info_path.exists():
        raw = json.loads(segments_path.read_text(encoding="utf-8"))
        return [Segment(**item) for item in raw], json.loads(info_path.read_text(encoding="utf-8"))

    os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
    os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    prompt = (
        "Reunión de trabajo en español sobre estructura de productos, jerarquización, familias, subfamilias, "
        "materiales, acabados, producto padre, producto hijo, BOM, ERP, producción, ingeniería, presupuestos, "
        "catálogo, portal, resúmenes de reunión, Pulycort, Rafael, Antonio, Carlos, Zulay y Ángel."
    )
    raw_segments, info = model.transcribe(
        str(audio),
        language=language,
        task="transcribe",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        initial_prompt=prompt,
        condition_on_previous_text=True,
    )

    segments: list[Segment] = []
    for idx, segment in enumerate(raw_segments, start=1):
        text = " ".join(segment.text.strip().split())
        if not text:
            continue
        segments.append(Segment(index=idx, start=float(segment.start), end=float(segment.end), text=text))
        line = f"[{format_time(segment.start)} -> {format_time(segment.end)}] {text}\n"
        print(line.rstrip(), flush=True)
        append_text(progress_path, line)

    info_dict = {
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "duration_after_vad": getattr(info, "duration_after_vad", None),
        "model": model_name,
    }
    segments_path.write_text(json.dumps([asdict(item) for item in segments], ensure_ascii=False, indent=2), encoding="utf-8")
    info_path.write_text(json.dumps(info_dict, ensure_ascii=False, indent=2), encoding="utf-8")
    return segments, info_dict


def write_transcript_outputs(segments: Iterable[Segment], out_dir: Path) -> None:
    segments = list(segments)
    md_lines = ["# Transcripción", ""]
    txt_lines: list[str] = []
    srt_lines: list[str] = []
    vtt_lines = ["WEBVTT", ""]

    for segment in segments:
        md_lines.append(f"**{format_time(segment.start)} - {format_time(segment.end)}**  ")
        md_lines.append(segment.text)
        md_lines.append("")
        txt_lines.append(f"[{format_time(segment.start)} - {format_time(segment.end)}] {segment.text}")
        srt_lines.extend(
            [
                str(segment.index),
                f"{format_time(segment.start, srt=True)} --> {format_time(segment.end, srt=True)}",
                segment.text,
                "",
            ]
        )
        vtt_lines.extend(
            [
                f"{format_time(segment.start)} --> {format_time(segment.end)}",
                segment.text,
                "",
            ]
        )

    write_text(out_dir / "transcript.md", "\n".join(md_lines))
    write_text(out_dir / "transcript.txt", "\n".join(txt_lines) + "\n")
    write_text(out_dir / "subtitles.srt", "\n".join(srt_lines))
    write_text(out_dir / "subtitles.vtt", "\n".join(vtt_lines))


def write_chunks(segments: Iterable[Segment], out_dir: Path, chunk_minutes: int) -> None:
    chunk_dir = out_dir / "chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)
    buckets: dict[int, list[Segment]] = {}
    chunk_seconds = chunk_minutes * 60
    for segment in segments:
        bucket = int(segment.start // chunk_seconds)
        buckets.setdefault(bucket, []).append(segment)

    for bucket, items in buckets.items():
        start = bucket * chunk_seconds
        end = start + chunk_seconds
        lines = [f"# Chunk {bucket + 1}: {format_time(start)} - {format_time(end)}", ""]
        for segment in items:
            lines.append(f"- **{format_time(segment.start)} - {format_time(segment.end)}** {segment.text}")
        write_text(chunk_dir / f"chunk_{bucket + 1:02d}_{plain_time(start)}.md", "\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--audio-track", type=int, default=1, help="Zero-based audio track among audio streams.")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="es")
    parser.add_argument("--screenshot-every", type=int, default=45)
    parser.add_argument("--screenshot-width", type=int, default=1600)
    parser.add_argument("--screenshot-threshold", type=float, default=10.0)
    parser.add_argument("--chunk-minutes", type=int, default=5)
    args = parser.parse_args()

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    write_text(out_dir / "progress.log", "")
    sys.stdout = (out_dir / "script_stdout.log").open("a", encoding="utf-8", buffering=1)
    sys.stderr = (out_dir / "script_stderr.log").open("a", encoding="utf-8", buffering=1)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    metadata_probe = run([ffmpeg, "-hide_banner", "-i", str(args.video)], check=False)
    metadata = parse_metadata(metadata_probe.stderr)
    metadata.update(
        {
            "source": str(args.video),
            "ffmpeg": ffmpeg,
            "selected_audio_track_zero_based": args.audio_track,
            "selected_audio_stream": f"0:a:{args.audio_track}",
        }
    )
    (out_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    write_text(out_dir / "metadata.ffmpeg.txt", metadata_probe.stderr)

    screenshots = extract_screenshots(
        ffmpeg,
        args.video,
        out_dir,
        args.screenshot_every,
        args.screenshot_width,
        args.screenshot_threshold,
    )
    (out_dir / "screenshots.json").write_text(json.dumps(screenshots, ensure_ascii=False, indent=2), encoding="utf-8")

    audio_path = out_dir / f"audio_track_{args.audio_track + 1}_16khz_mono.wav"
    extract_audio(ffmpeg, args.video, audio_path, args.audio_track)

    segments, info = transcribe(audio_path, args.model, out_dir, args.language)
    write_transcript_outputs(segments, out_dir)
    write_chunks(segments, out_dir, args.chunk_minutes)

    summary = {
        "source": str(args.video),
        "out_dir": str(out_dir),
        "segment_count": len(segments),
        "screenshot_count": len(screenshots),
        "transcription": info,
    }
    (out_dir / "run_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
