#!/bin/bash
# MuseTalk 环境搭建脚本
# 使用前请确保已安装 conda 和 CUDA

set -e

echo "========================================="
echo "  MuseTalk 环境搭建"
echo "========================================="

# 克隆仓库
if [ ! -d "MuseTalk" ]; then
    echo "Cloning MuseTalk repository..."
    git clone https://github.com/TMElyralab/MuseTalk.git
fi

cd MuseTalk

# 创建 conda 环境
echo "Creating conda environment..."
conda create -n musetalk python=3.10 -y
eval "$(conda shell.bash hook)"
conda activate musetalk

# 安装依赖
echo "Installing dependencies..."
pip install -r requirements.txt

# 下载预训练模型
echo "Downloading pretrained models..."
python -m scripts.download_models

echo ""
echo "========================================="
echo "  MuseTalk 环境搭建完成!"
echo "========================================="
echo ""
echo "使用方法:"
echo "  conda activate musetalk"
echo "  python inference.py \\"
echo "    --video_path ./inputs/source_video.mp4 \\"
echo "    --audio_path ./inputs/driving_audio.wav \\"
echo "    --output_path ./outputs/result.mp4"
