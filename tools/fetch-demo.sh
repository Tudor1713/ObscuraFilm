#!/bin/bash
# 12 rolls x 8 frames of curated picsum ids; frame index 3 of every other roll is portrait
cd "$(dirname "$0")/../app/demo"
IDS=(152 282 122 269 317 133 153 165 248 98 158 128 318 274 15 288 216 222 87 64 320 141 100 198 214 130 116 134 322 124 94 61 101 104 112 131 323 242 49 29 14 249 110 120 324 244 16 185 201 191 45 177 325 266 114 13 72 68 65 137 336 54 276 272 211 199 96 155 337 99 166 231 235 10 223 55 338 268 200 11 103 217 108 283 339 171 178 50 225 136 81 117 340 143 83 277)
for i in "${!IDS[@]}"; do
  id=${IDS[$i]}; r=$((i/8)); f=$((i%8))
  if [ $f -eq 3 ] && [ $((r%2)) -eq 0 ]; then w=1000; h=1500; else w=1500; h=1000; fi
  out="p${id}.jpg"
  [ -s "$out" ] || curl -sL --retry 3 -m 60 -o "$out" "https://picsum.photos/id/${id}/${w}/${h}.jpg" &
  if (( i % 8 == 7 )); then wait; fi
done
wait
ls | wc -l; du -sh .
