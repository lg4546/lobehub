#!/bin/bash
# LivePortrait 环境搭建脚本
# 使用前请确保已安装 conda 和 CUDA

set -e

echo "========================================="
echo "  LivePortrait 环境搭建"
echo "========================================="

# 克隆仓库
if [ ! -d "LivePortrait" ]; then
    echo "Cloning LivePortrait repository..."
    git clone https://github.com/KwaiVGI/LivePortrait.git
fi

cd LivePortrait

# 创建 conda 环境
echo "Creating conda environment..."
conda create -n liveportrait python=3.10 -y
eval "$(conda shell.bash hook)"
conda activate liveportrait

# 安装依赖
echo "Installing dependencies..."
pip install -r requirements.txt

# 下载预训练权重
echo "Downloading pretrained weights..."
bash scripts/download_weights.sh

echo ""
echo "========================================="
echo "  LivePortrait 环境搭建完成!"
echo "========================================="
echo ""
echo "使用方法:"
echo ""
echo "方式一：视频驱动"
echo "  conda activate liveportrait"
echo "  python inference.py \\"
echo "    --source ./inputs/source_face.jpg \\"
echo "    --driving ./inputs/driving_video.mp4 \\"
echo "    --output ./outputs/result.mp4"
echo ""
echo "方式二：音频驱动"
echo "  python audio2motion.py --audio ./inputs/audio.wav --output ./inputs/motion.pkl"
echo "  python inference.py \\"
echo "    --source ./inputs/source_face.jpg \\"
echo "    --driving_motion ./inputs/motion.pkl \\"
echo "    --output ./outputs/result.mp4"
