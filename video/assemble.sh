#!/bin/bash
# Final assembly: frames + soundtrack -> MP4 (H.264 + AAC), 1920x1080 (16:9), 30 fps
cd "$(dirname "$0")"
ffmpeg -y -framerate 30 -i frames_social/f%05d.jpg -i out/audio.wav \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 160k -shortest out/arduino_traffic_light_social.mp4
