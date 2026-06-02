# 数字人对口型效果验证方案：MuseTalk vs LivePortrait

## 一、整体思路

**目标**：输入一段音频（或视频中的音频）+ 一张/一段人脸图像/视频，输出对口型的数字人视频。分别用 MuseTalk 和 LivePortrait 两个方案验证效果，对比质量、延迟、资源占用。

## 二、方案对比概览

| 维度 | MuseTalk | LivePortrait |
|------|----------|--------------|
| 驱动方式 | 音频驱动口型（Audio2Lip） | 视频/关键点驱动表情+口型 |
| 输入 | 音频 + 参考人脸图 | 驱动视频/音频 + 源人脸图 |
| 实时性 | 支持流式推理，延迟较低 | 单帧推理快，可做实时 |
| 口型精度 | 针对中英文口型优化 | 整体表情迁移，口型为附带 |
| 适合场景 | 纯语音驱动数字人播报 | 表情+口型联合驱动、换脸 |

## 三、MuseTalk 验证方案

### 3.1 环境准备

**硬件要求**：NVIDIA GPU（建议 RTX 3060 及以上，显存 ≥ 8GB）

**软件环境**：

- Python 3.10+
- CUDA 11.8 / 12.x
- PyTorch 2.0+
- ffmpeg

**安装步骤**：

```bash
git clone https://github.com/TMElyralab/MuseTalk.git
cd MuseTalk
conda create -n musetalk python=3.10 -y
conda activate musetalk
pip install -r requirements.txt
# 下载预训练模型（按 README 指引）
python -m scripts.download_models
```

### 3.2 准备素材

- **参考人脸图/视频**：一段正脸、光线均匀的人脸视频或高清照片（512x512 以上）
- **驱动音频**：一段清晰的中文或英文语音（WAV 格式，16kHz 采样率）

### 3.3 推理流程

```bash
# 基本推理命令
python inference.py \
  --video_path ./inputs/source_video.mp4 \
  --audio_path ./inputs/driving_audio.wav \
  --output_path ./outputs/result.mp4
```

**技术逻辑**：

1. **人脸检测与对齐**：使用 face detection 提取人脸区域，做 landmark 对齐
2. **音频特征提取**：将音频通过 Whisper/HuBERT 等模型提取逐帧语音特征
3. **口型生成网络**：将音频特征输入 diffusion/VAE 模型，生成逐帧口型区域图像
4. **人脸融合**：将生成的口型区域贴回原图/视频，做边缘融合（blending）
5. **视频编码**：逐帧拼装输出最终视频

### 3.4 评估指标

- **LSD (Lip Sync Distance)**：音频与口型的同步度
- **FID**：生成质量
- **主观评价**：肉眼观察自然度、闪烁、边缘伪影

## 四、LivePortrait 验证方案

### 4.1 环境准备

```bash
git clone https://github.com/KwaiVGI/LivePortrait.git
cd LivePortrait
conda create -n liveportrait python=3.10 -y
conda activate liveportrait
pip install -r requirements.txt
# 下载预训练权重
bash scripts/download_weights.sh
```

### 4.2 准备素材

- **源人脸图**：一张高清正脸照片（作为数字人形象）
- **驱动视频**：一段真人说话的视频（提供表情+口型驱动信号）
- 或：**驱动音频** → 先用 Audio2Motion 模型生成关键点序列，再驱动

### 4.3 推理流程

**方式一：视频驱动视频**

```bash
python inference.py \
  --source ./inputs/source_face.jpg \
  --driving ./inputs/driving_video.mp4 \
  --output ./outputs/result.mp4
```

**方式二：音频驱动（需额外模块）**

```bash
# Step 1: 音频 → Motion 序列
python audio2motion.py \
  --audio ./inputs/audio.wav \
  --output ./inputs/motion.pkl

# Step 2: Motion 序列驱动人脸
python inference.py \
  --source ./inputs/source_face.jpg \
  --driving_motion ./inputs/motion.pkl \
  --output ./outputs/result.mp4
```

**技术逻辑**：

1. **源图像编码**：通过 Appearance Encoder 提取源人脸外观特征
2. **驱动信号提取**：从驱动视频提取 3DMM 参数 / 关键点序列（表情、头部姿态、口型）
3. **运动迁移**：将驱动信号映射到源人脸的 canonical space
4. **解码渲染**：通过 Generator 网络生成最终帧图像
5. **后处理**：超分、去抖动、音视频对齐

### 4.4 评估指标

- 同 MuseTalk 的 LSD、FID
- 额外关注：**表情保真度**、**头部运动自然度**、**身份保持度 (ArcFace cosine similarity)**

## 五、对口型效果优化思路

1. **音频预处理**：降噪、静音段裁剪、重采样到模型要求格式
2. **人脸素材质量**：正脸、均匀光线、无遮挡、高分辨率
3. **后处理融合**：
   - 使用 Poisson Blending 或 learned blending mask 减少边缘伪影
   - 对输出视频做时序平滑，减少帧间闪烁
4. **音视频同步校准**：检查生成视频的 fps 与音频采样率是否匹配，必要时做偏移补偿

## 六、验证流程建议

| 步骤 | 内容 | 产出 |
|------|------|------|
| 1 | 搭建两套环境，跑通 demo | 确认环境可用 |
| 2 | 用同一组素材（同一人脸+同一音频）分别生成 | 对比视频 |
| 3 | 主观评分（5人打分）+ 客观指标计算 | 评估报告 |
| 4 | 测试不同场景（中文/英文/不同人脸/不同音频长度） | 鲁棒性分析 |
| 5 | 测试推理速度、显存占用 | 性能报告 |
| 6 | 决定最终方案，做工程化集成 | 技术选型结论 |

## 七、评估脚本

以下 Python 脚本可用于自动化评估两个方案的输出质量：

```python
"""
evaluate_lipsync.py
数字人对口型效果评估脚本
用法: python evaluate_lipsync.py --video result.mp4 --audio source_audio.wav
"""

import argparse
import subprocess
import json
from pathlib import Path


def extract_audio_from_video(video_path: str, output_audio: str) -> None:
    """从视频中提取音频轨道"""
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
         "-ar", "16000", "-ac", "1", output_audio],
        check=True, capture_output=True
    )


def compute_lip_sync_distance(video_path: str, audio_path: str) -> float:
    """
    计算 Lip Sync Distance (LSD)
    使用 SyncNet 模型评估音视频同步度
    返回值越低表示同步越好
    """
    # 实际使用时需安装 syncnet 相关依赖
    # pip install syncnet-python
    try:
        from syncnet import SyncNetEvaluator
        evaluator = SyncNetEvaluator()
        score = evaluator.evaluate(video_path, audio_path)
        return score
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
            dims=2048
        )
        return score
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
        import insightface
        import numpy as np
        from PIL import Image

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
        for frame_path in sorted(generated_dir.glob("*.png"))[:100]:  # 取前100帧
            frame_img = np.array(Image.open(frame_path))
            faces = app.get(frame_img)
            if faces:
                sim = np.dot(source_embedding, faces[0].embedding) / (
                    np.linalg.norm(source_embedding) * np.linalg.norm(faces[0].embedding)
                )
                similarities.append(sim)

        return float(np.mean(similarities)) if similarities else -1.0
    except ImportError:
        print("Warning: insightface not installed, skipping identity similarity")
        print("Install with: pip install insightface onnxruntime-gpu")
        return -1.0


def extract_frames(video_path: str, output_dir: str, fps: int = 25) -> None:
    """从视频提取帧图像"""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps}",
         f"{output_dir}/frame_%05d.png"],
        check=True, capture_output=True
    )


def measure_inference_performance(command: list[str], num_runs: int = 3) -> dict:
    """
    测量推理性能
    返回平均耗时和 GPU 显存占用
    """
    import time

    times = []
    for i in range(num_runs):
        start = time.time()
        subprocess.run(command, check=True, capture_output=True)
        elapsed = time.time() - start
        times.append(elapsed)
        print(f"  Run {i+1}/{num_runs}: {elapsed:.2f}s")

    # 获取 GPU 显存信息
    gpu_info = subprocess.run(
        ["nvidia-smi", "--query-gpu=memory.used,memory.total",
         "--format=csv,noheader,nounits"],
        capture_output=True, text=True
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
    report = {
        "evaluation_results": results,
        "summary": {
            "best_lip_sync": min(results.items(),
                                  key=lambda x: x[1].get("lsd", float("inf")))[0]
            if all("lsd" in v for v in results.values()) else "N/A",
            "best_quality": min(results.items(),
                                 key=lambda x: x[1].get("fid", float("inf")))[0]
            if all("fid" in v for v in results.values()) else "N/A",
            "best_identity": max(results.items(),
                                  key=lambda x: x[1].get("identity_sim", -1))[0]
            if all("identity_sim" in v for v in results.values()) else "N/A",
        }
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\nEvaluation report saved to: {output_path}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="数字人对口型效果评估")
    parser.add_argument("--musetalk_video", type=str, help="MuseTalk 生成的视频路径")
    parser.add_argument("--liveportrait_video", type=str, help="LivePortrait 生成的视频路径")
    parser.add_argument("--source_audio", type=str, required=True, help="原始驱动音频路径")
    parser.add_argument("--source_image", type=str, help="源人脸图像（用于身份保持度评估）")
    parser.add_argument("--output", type=str, default="./evaluation_report.json", help="评估报告输出路径")
    args = parser.parse_args()

    results = {}
    tmp_dir = Path("/tmp/lipsync_eval")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for name, video_path in [("musetalk", args.musetalk_video),
                              ("liveportrait", args.liveportrait_video)]:
        if not video_path:
            continue

        print(f"\n{'='*50}")
        print(f"Evaluating: {name}")
        print(f"{'='*50}")

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
```

## 八、进阶：实时数字人对话架构

如果验证效果满意，后续可扩展为实时对话数字人：

```
用户语音输入
    │
    ▼
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────────────┐
│   ASR   │ ──► │   LLM   │ ──► │   TTS   │ ──► │ MuseTalk/        │
│(语音识别)│     │(大模型)  │     │(语音合成)│     │ LivePortrait     │
└─────────┘     └─────────┘     └─────────┘     │ (口型生成)        │
                                                  └──────────────────┘
                                                           │
                                                           ▼
                                                    数字人视频输出
```

**关键技术点**：

1. 流式架构：音频流 → chunk 级推理 → 逐 chunk 输出视频帧
2. 延迟优化：模型量化（INT8/FP16）、TensorRT 加速、pipeline 并行
3. 端到端延迟目标：< 500ms（首帧）

## 九、总结建议

- 如果需求是**纯音频驱动口型**（如 TTS 配数字人），优先验证 **MuseTalk**
- 如果需要**完整的表情+口型+头部运动**驱动，优先验证 **LivePortrait**
- 建议两个都跑一遍 demo，用相同素材对比，再做决策
