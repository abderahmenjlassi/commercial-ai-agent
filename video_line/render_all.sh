#!/bin/bash
# Renders all frames in restart-safe chunks.
cd "$(dirname "$0")"
TOTAL=$(node -e "import('./src/timeline.js').then(m=>console.log(Math.ceil(m.VTOTAL*m.FPS)))")
FPS=30; CH=500; OUT=${OUT:-frames_h}
mkdir -p $OUT
for ((s=0; s<TOTAL; s+=CH)); do
  e=$((s+CH)); [ $e -gt $TOTAL ] && e=$TOTAL
  for try in 1 2 3; do
    node render.mjs $s $e $OUT $FPS 8124 2>&1 | grep -v "GL Driver" && break
  done
  echo "chunk $s-$e done $(date +%T)"
done
echo ALLDONE
