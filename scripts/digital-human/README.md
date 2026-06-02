# 数字人对口型效果验证工具

本目录包含使用 MuseTalk 和 LivePortrait 进行数字人对口型效果验证的工具脚本。

## 文件说明

| 文件 | 说明 |
|------|------|
| `setup_musetalk.sh` | MuseTalk 环境一键搭建脚本 |
| `setup_liveportrait.sh` | LivePortrait 环境一键搭建脚本 |
| `run_verification.sh` | 完整验证流程（推理 + 评估） |
| `evaluate_lipsync.py` | 效果评估脚本（LSD / FID / 身份保持度） |

## 快速开始

### 1. 搭建环境

```bash
# 搭建 MuseTalk
bash setup_musetalk.sh

# 搭建 LivePortrait
bash setup_liveportrait.sh
```

### 2. 准备素材

在 `./inputs/` 目录下准备：

- `source_video.mp4` - 源人脸视频（正脸、光线均匀）
- `source_face.jpg` - 源人脸照片（512x512 以上）
- `driving_audio.wav` - 驱动音频（16kHz, WAV 格式）
- `driving_video.mp4` - 驱动视频（LivePortrait 用）

### 3. 运行验证

```bash
bash run_verification.sh
```

### 4. 单独运行评估

```bash
python evaluate_lipsync.py \
  --musetalk_video ./outputs/musetalk_result.mp4 \
  --liveportrait_video ./outputs/liveportrait_result.mp4 \
  --source_audio ./inputs/driving_audio.wav \
  --source_image ./inputs/source_face.jpg \
  --output ./outputs/evaluation_report.json
```

## 评估指标

- **LSD (Lip Sync Distance)**: 音视频同步度，越低越好
- **FID**: 生成图像质量，越低越好
- **Identity Similarity**: 身份保持度（ArcFace），越高越好

## 详细文档

完整方案请参考：[docs/digital-human-lipsync-verification.md](../../docs/digital-human-lipsync-verification.md)
