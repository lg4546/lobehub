#!/bin/bash
# 数字人对口型效果验证 - 完整验证流程脚本
# 本脚本假设 MuseTalk 和 LivePortrait 环境已搭建完成

set -e

# ===== 配置区域 =====
SOURCE_VIDEO="./inputs/source_video.mp4"       # 源人脸视频
SOURCE_IMAGE="./inputs/source_face.jpg"         # 源人脸图片
DRIVING_AUDIO="./inputs/driving_audio.wav"      # 驱动音频
DRIVING_VIDEO="./inputs/driving_video.mp4"      # 驱动视频(LivePortrait用)
OUTPUT_DIR="./outputs"
MUSETALK_DIR="../MuseTalk"
LIVEPORTRAIT_DIR="../LivePortrait"
# ====================

mkdir -p "$OUTPUT_DIR"

echo "========================================="
echo "  数字人对口型效果验证流程"
echo "========================================="

# Step 1: MuseTalk 推理
echo ""
echo "[Step 1] Running MuseTalk inference..."
echo "-----------------------------------------"

eval "$(conda shell.bash hook)"
conda activate musetalk
cd "$MUSETALK_DIR"

MUSETALK_START=$(date +%s%N)
python inference.py \
    --video_path "$SOURCE_VIDEO" \
    --audio_path "$DRIVING_AUDIO" \
    --output_path "$OUTPUT_DIR/musetalk_result.mp4"
MUSETALK_END=$(date +%s%N)
MUSETALK_TIME=$(( (MUSETALK_END - MUSETALK_START) / 1000000 ))
echo "MuseTalk inference time: ${MUSETALK_TIME}ms"

cd -

# Step 2: LivePortrait 推理
echo ""
echo "[Step 2] Running LivePortrait inference..."
echo "-----------------------------------------"

conda activate liveportrait
cd "$LIVEPORTRAIT_DIR"

LIVEPORTRAIT_START=$(date +%s%N)
python inference.py \
    --source "$SOURCE_IMAGE" \
    --driving "$DRIVING_VIDEO" \
    --output "$OUTPUT_DIR/liveportrait_result.mp4"
LIVEPORTRAIT_END=$(date +%s%N)
LIVEPORTRAIT_TIME=$(( (LIVEPORTRAIT_END - LIVEPORTRAIT_START) / 1000000 ))
echo "LivePortrait inference time: ${LIVEPORTRAIT_TIME}ms"

cd -

# Step 3: 评估对比
echo ""
echo "[Step 3] Running evaluation..."
echo "-----------------------------------------"

python scripts/digital-human/evaluate_lipsync.py \
    --musetalk_video "$OUTPUT_DIR/musetalk_result.mp4" \
    --liveportrait_video "$OUTPUT_DIR/liveportrait_result.mp4" \
    --source_audio "$DRIVING_AUDIO" \
    --source_image "$SOURCE_IMAGE" \
    --output "$OUTPUT_DIR/evaluation_report.json"

echo ""
echo "========================================="
echo "  验证完成!"
echo "========================================="
echo ""
echo "结果文件:"
echo "  MuseTalk:     $OUTPUT_DIR/musetalk_result.mp4"
echo "  LivePortrait: $OUTPUT_DIR/liveportrait_result.mp4"
echo "  评估报告:      $OUTPUT_DIR/evaluation_report.json"
echo ""
echo "性能对比:"
echo "  MuseTalk:     ${MUSETALK_TIME}ms"
echo "  LivePortrait: ${LIVEPORTRAIT_TIME}ms"
