"""
evaluate_lipsync.py
数字人对口型效果评估脚本

用法:
  python evaluate_lipsync.py \
    --musetalk_video ./outputs/musetalk_result.mp4 \
    --liveportrait_video ./outputs/liveportrait_result.mp4 \
    --source_audio ./inputs/driving_audio.wav \
    --source_image ./inputs/source_face.jpg \
    --output ./evaluation_report.json

依赖安装:
  pip install numpy Pillow
  pip install syncnet-python        # LSD 评估
  pip install pytorch-fid           # FID 评估
  pip install insightface onnxruntime-gpu  # 身份保持度评估
"""

import argparse
import json
import subprocess
import time
from pathlib import Path


def extract_audio_from_video(video_path: str, output_audio: str) -> None:
    """从视频中提取音频轨道"""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            output_audio,
        ],
        check=True,
        capture_output=True,
    )


def compute_lip_sync_distance(video_path: str, audio_path: str) -> float:
    """
    计算 Lip Sync Distance (LSD)
    使用 SyncNet 模型评估音视频同步度
    返回值越低表示同步越好
    """
    try:
        from syncnet import SyncNetEvaluator

        evaluator = SyncNetEvaluator()
        score = evaluator.evaluate(video_path, audio_path)
        return float(score)
    except ImportError:
        print("Warning: syncnet not installed, skipping LSD computation")
        print("Install with: pip install syncnet-python")
        return -1.0


def compute_fid(real_frames_dir: str, generated_frames_dir: str) -> float:
    """
    计算 FID (Fréchet Inception Distance)
    评估生成图像质量
    """
    try:
        from pytorch_fid import fid_score

        score = fid_score.calculate_fid_given_paths(
            [real_frames_dir, generated_frames_dir],
            batch_size=50,
            device="cuda",
            dims=2048,
        )
        return float(score)
    except ImportError:
        print("Warning: pytorch-fid not installed, skipping FID computation")
        print("Install with: pip install pytorch-fid")
        return -1.0


def compute_identity_similarity(source_image: str, generated_frames_dir: str) -> float:
    """
    计算身份保持度 (ArcFace Cosine Similarity)
    评估生成人脸与源人脸的身份一致性
    """
    try:
        import numpy as np
        from PIL import Image

        import insightface

        app = insightface.app.FaceAnalysis()
        app.prepare(ctx_id=0)

        # 提取源图像特征
        source_img = np.array(Image.open(source_image))
        source_faces = app.get(source_img)
        if not source_faces:
            print("Warning: No face detected in source image")
            return -1.0
        source_embedding = source_faces[0].embedding

        # 提取生成帧特征并计算平均相似度
        generated_dir = Path(generated_frames_dir)
        similarities = []
        for frame_path in sorted(generated_dir.glob("*.png"))[:100]:
            frame_img = np.array(Image.open(frame_path))
            faces = app.get(frame_img)
            if faces:
                sim = np.dot(source_embedding, faces[0].embedding) / (
                    np.linalg.norm(source_embedding) * np.linalg.norm(faces[0].embedding)
                )
                similarities.append(float(sim))

        return float(np.mean(similarities)) if similarities else -1.0
    except ImportError:
        print("Warning: insightface not installed, skipping identity similarity")
        print("Install with: pip install insightface onnxruntime-gpu")
        return -1.0


def extract_frames(video_path: str, output_dir: str, fps: int = 25) -> None:
    """从视频提取帧图像"""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", f"fps={fps}",
            f"{output_dir}/frame_%05d.png",
        ],
        check=True,
        capture_output=True,
    )


def measure_inference_performance(command: list[str], num_runs: int = 3) -> dict:
    """
    测量推理性能
    返回平均耗时和 GPU 显存占用
    """
    times = []
    for i in range(num_runs):
        start = time.time()
        subprocess.run(command, check=True, capture_output=True)
        elapsed = time.time() - start
        times.append(elapsed)
        print(f"  Run {i + 1}/{num_runs}: {elapsed:.2f}s")

    # 获取 GPU 显存信息
    gpu_info = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ],
        capture_output=True,
        text=True,
    )
    gpu_memory = gpu_info.stdout.strip() if gpu_info.returncode == 0 else "N/A"

    return {
        "avg_time_seconds": sum(times) / len(times),
        "min_time_seconds": min(times),
        "max_time_seconds": max(times),
        "gpu_memory_mb": gpu_memory,
    }


def generate_report(results: dict, output_path: str) -> None:
    """生成评估报告"""
    summary = {}

    lsd_results = {k: v["lsd"] for k, v in results.items() if v.get("lsd", -1) >= 0}
    if lsd_results:
        summary["best_lip_sync"] = min(lsd_results, key=lsd_results.get)

    fid_results = {k: v["fid"] for k, v in results.items() if v.get("fid", -1) >= 0}
    if fid_results:
        summary["best_quality"] = min(fid_results, key=fid_results.get)

    id_results = {
        k: v["identity_sim"] for k, v in results.items() if v.get("identity_sim", -1) >= 0
    }
    if id_results:
        summary["best_identity"] = max(id_results, key=id_results.get)

    report = {
        "evaluation_results": results,
        "summary": summary,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\nEvaluation report saved to: {output_path}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="数字人对口型效果评估")
    parser.add_argument("--musetalk_video", type=str, help="MuseTalk 生成的视频路径")
    parser.add_argument("--liveportrait_video", type=str, help="LivePortrait 生成的视频路径")
    parser.add_argument("--source_audio", type=str, required=True, help="原始驱动音频路径")
    parser.add_argument("--source_image", type=str, help="源人脸图像（用于身份保持度评估）")
    parser.add_argument(
        "--output", type=str, default="./evaluation_report.json", help="评估报告输出路径"
    )
    args = parser.parse_args()

    results = {}
    tmp_dir = Path("/tmp/lipsync_eval")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for name, video_path in [
        ("musetalk", args.musetalk_video),
        ("liveportrait", args.liveportrait_video),
    ]:
        if not video_path:
            continue

        print(f"\n{'=' * 50}")
        print(f"Evaluating: {name}")
        print(f"{'=' * 50}")

        frames_dir = str(tmp_dir / f"{name}_frames")
        extract_frames(video_path, frames_dir)

        result = {}

        # LSD
        print("\nComputing Lip Sync Distance...")
        result["lsd"] = compute_lip_sync_distance(video_path, args.source_audio)

        # Identity Similarity
        if args.source_image:
            print("\nComputing Identity Similarity...")
            result["identity_sim"] = compute_identity_similarity(
                args.source_image, frames_dir
            )

        results[name] = result

    generate_report(results, args.output)


if __name__ == "__main__":
    main()
