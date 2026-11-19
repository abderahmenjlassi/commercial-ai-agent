#!/bin/bash
# Final assembly: frames + soundtrack -> MP4 (H.264 + AAC)
cd "$(dirname "$0")"
ffmpeg -y -framerate 24 -i frames/f%05d.jpg -i out/audio.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest out/arduino_traffic_light_ar.mp4
