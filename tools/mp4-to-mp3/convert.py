#!/usr/bin/env python3
"""
批量将 MP4 文件转换为 MP3 音频文件
- 使用 FFmpeg 进行高质量转码（320kbps）
- 使用多进程并发处理，适合几百个文件的批量转换
- 按原文件名生成对应的 .mp3 文件
"""

import os
import sys
import argparse
import subprocess
import shutil
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Optional


def check_ffmpeg() -> str:
    """检查 ffmpeg 是否可用，返回 ffmpeg 路径"""
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        print("错误: 未找到 ffmpeg，请先安装 ffmpeg")
        print("  macOS:   brew install ffmpeg")
        print("  Ubuntu:  sudo apt install ffmpeg")
        print("  Windows: https://ffmpeg.org/download.html")
        sys.exit(1)
    return ffmpeg_path


def convert_single(
    input_path: str,
    output_path: str,
    bitrate: str = "320k",
    sample_rate: int = 44100,
    ffmpeg_path: str = "ffmpeg",
) -> dict:
    """
    转换单个 MP4 文件为 MP3

    Args:
        input_path: 输入 MP4 文件路径
        output_path: 输出 MP3 文件路径
        bitrate: 音频比特率，默认 320k（最高质量）
        sample_rate: 采样率，默认 44100Hz（CD 质量）
        ffmpeg_path: ffmpeg 可执行文件路径

    Returns:
        包含转换结果的字典
    """
    try:
        cmd = [
            ffmpeg_path,
            "-i", input_path,
            "-vn",                  # 不处理视频流
            "-acodec", "libmp3lame",  # 使用 LAME 编码器
            "-ab", bitrate,         # 音频比特率
            "-ar", str(sample_rate),  # 采样率
            "-ac", "2",             # 双声道（立体声）
            "-y",                   # 覆盖已存在的文件
            output_path,
        ]

        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=600,  # 单文件最长 10 分钟超时
        )

        if result.returncode == 0:
            input_size = os.path.getsize(input_path)
            output_size = os.path.getsize(output_path)
            return {
                "status": "success",
                "input": input_path,
                "output": output_path,
                "input_size_mb": round(input_size / 1024 / 1024, 2),
                "output_size_mb": round(output_size / 1024 / 1024, 2),
            }
        else:
            return {
                "status": "failed",
                "input": input_path,
                "error": result.stderr.decode("utf-8", errors="replace")[-500:],
            }

    except subprocess.TimeoutExpired:
        return {
            "status": "failed",
            "input": input_path,
            "error": "转换超时（超过10分钟）",
        }
    except Exception as e:
        return {
            "status": "failed",
            "input": input_path,
            "error": str(e),
        }


def find_mp4_files(input_dir: str, recursive: bool = False) -> list[str]:
    """查找目录中的所有 MP4 文件"""
    input_path = Path(input_dir)
    if recursive:
        files = list(input_path.rglob("*.mp4")) + list(input_path.rglob("*.MP4"))
    else:
        files = list(input_path.glob("*.mp4")) + list(input_path.glob("*.MP4"))

    # 去重（处理大小写问题）
    seen = set()
    unique_files = []
    for f in files:
        if f.resolve() not in seen:
            seen.add(f.resolve())
            unique_files.append(str(f))

    return sorted(unique_files)


def batch_convert(
    input_dir: str,
    output_dir: Optional[str] = None,
    bitrate: str = "320k",
    sample_rate: int = 44100,
    workers: int = 0,
    recursive: bool = False,
    skip_existing: bool = True,
) -> None:
    """
    批量转换目录中的 MP4 文件为 MP3

    Args:
        input_dir: 输入目录
        output_dir: 输出目录（默认与输入目录相同）
        bitrate: 音频比特率
        sample_rate: 采样率
        workers: 并发进程数（0 为自动，使用 CPU 核心数）
        recursive: 是否递归子目录
        skip_existing: 是否跳过已存在的 MP3 文件
    """
    ffmpeg_path = check_ffmpeg()

    if output_dir is None:
        output_dir = input_dir

    # 查找所有 MP4 文件
    mp4_files = find_mp4_files(input_dir, recursive)

    if not mp4_files:
        print(f"在 '{input_dir}' 中未找到 MP4 文件")
        return

    print(f"找到 {len(mp4_files)} 个 MP4 文件")

    # 准备转换任务
    tasks = []
    for mp4_file in mp4_files:
        # 计算输出路径，保持相对目录结构
        rel_path = os.path.relpath(mp4_file, input_dir)
        mp3_name = os.path.splitext(rel_path)[0] + ".mp3"
        mp3_path = os.path.join(output_dir, mp3_name)

        # 确保输出目录存在
        os.makedirs(os.path.dirname(mp3_path), exist_ok=True)

        # 检查是否跳过
        if skip_existing and os.path.exists(mp3_path):
            print(f"  跳过（已存在）: {mp3_name}")
            continue

        tasks.append((mp4_file, mp3_path))

    if not tasks:
        print("所有文件已转换完成，无需处理")
        return

    print(f"待转换: {len(tasks)} 个文件")

    # 确定并发数
    if workers <= 0:
        workers = min(os.cpu_count() or 4, len(tasks), 8)

    print(f"使用 {workers} 个并发进程进行转换...")
    print(f"音质设置: {bitrate} / {sample_rate}Hz / 立体声")
    print("-" * 60)

    # 并发执行
    success_count = 0
    fail_count = 0

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                convert_single, inp, out, bitrate, sample_rate, ffmpeg_path
            ): (inp, out)
            for inp, out in tasks
        }

        for i, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if result["status"] == "success":
                success_count += 1
                print(
                    f"  [{i}/{len(tasks)}] ✓ {os.path.basename(result['input'])} "
                    f"({result['input_size_mb']}MB → {result['output_size_mb']}MB)"
                )
            else:
                fail_count += 1
                print(
                    f"  [{i}/{len(tasks)}] ✗ {os.path.basename(result['input'])} "
                    f"- {result['error'][:100]}"
                )

    # 汇总
    print("-" * 60)
    print(f"转换完成: 成功 {success_count}, 失败 {fail_count}, 总计 {len(tasks)}")


def main():
    parser = argparse.ArgumentParser(
        description="批量将 MP4 文件转换为高质量 MP3 音频",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 转换当前目录下的所有 MP4 文件
  python convert.py .

  # 指定输入和输出目录
  python convert.py /path/to/mp4s -o /path/to/output

  # 递归处理子目录，使用 6 个进程
  python convert.py /videos -r -w 6

  # 使用 256k 比特率（文件更小，质量略低）
  python convert.py /videos -b 256k
        """,
    )

    parser.add_argument("input_dir", help="包含 MP4 文件的输入目录")
    parser.add_argument("-o", "--output-dir", help="输出目录（默认与输入目录相同）")
    parser.add_argument(
        "-b", "--bitrate", default="320k",
        help="音频比特率，默认 320k（可选: 128k, 192k, 256k, 320k）"
    )
    parser.add_argument(
        "-s", "--sample-rate", type=int, default=44100,
        help="采样率，默认 44100Hz"
    )
    parser.add_argument(
        "-w", "--workers", type=int, default=0,
        help="并发进程数，默认自动（CPU 核心数，最多 8）"
    )
    parser.add_argument(
        "-r", "--recursive", action="store_true",
        help="递归处理子目录"
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="覆盖已存在的 MP3 文件"
    )

    args = parser.parse_args()

    if not os.path.isdir(args.input_dir):
        print(f"错误: 目录不存在 '{args.input_dir}'")
        sys.exit(1)

    batch_convert(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        bitrate=args.bitrate,
        sample_rate=args.sample_rate,
        workers=args.workers,
        recursive=args.recursive,
        skip_existing=not args.overwrite,
    )


if __name__ == "__main__":
    main()
