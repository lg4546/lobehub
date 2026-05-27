# MP4 批量转 MP3 工具

高效批量将 MP4 视频文件转换为高质量 MP3 音频文件。

## 特性

- 🚀 **多进程并发** - 自动利用多核 CPU，几百个文件也能快速完成
- 🎵 **高音质** - 默认 320kbps + 44100Hz 采样率 + 立体声
- 📁 **保持目录结构** - 支持递归处理子目录
- ⏭️ **断点续传** - 跳过已转换的文件，中断后可继续
- 🛡️ **容错处理** - 单文件失败不影响其他文件

## 环境要求

- Python 3.9+
- FFmpeg（系统安装）

### 安装 FFmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (使用 Chocolatey)
choco install ffmpeg
```

## 使用方法

### 基本用法

```bash
# 转换当前目录下所有 MP4 文件（MP3 生成在同目录）
python convert.py .

# 指定输入目录和输出目录
python convert.py /path/to/videos -o /path/to/audio
```

### 高级用法

```bash
# 递归处理子目录
python convert.py /videos -r

# 指定并发进程数（适合文件特别多时手动调整）
python convert.py /videos -w 6

# 使用 256k 比特率（文件更小）
python convert.py /videos -b 256k

# 覆盖已存在的文件
python convert.py /videos --overwrite
```

### 完整参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `input_dir` | MP4 文件所在目录 | （必填） |
| `-o, --output-dir` | 输出目录 | 与输入目录相同 |
| `-b, --bitrate` | 比特率 | 320k |
| `-s, --sample-rate` | 采样率 | 44100 |
| `-w, --workers` | 并发进程数 | 自动（CPU核心数，最多8） |
| `-r, --recursive` | 递归子目录 | 否 |
| `--overwrite` | 覆盖已有文件 | 否 |

## 音质建议

| 比特率 | 质量 | 适用场景 |
|--------|------|----------|
| 320k | 极高（接近无损） | 音乐收藏、高品质需求 |
| 256k | 高 | 日常听歌 |
| 192k | 中等 | 播客、有声书 |
| 128k | 一般 | 语音内容、节省空间 |

## 性能参考

- 100 个普通 MP4 文件（每个 5 分钟）：约 2-5 分钟完成
- 使用 SSD 和多核 CPU 效果更佳
- 瓶颈通常在 CPU 编码，建议不超过 CPU 核心数的并发
