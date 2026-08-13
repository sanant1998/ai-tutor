#!/usr/bin/env bash
# Throwaway: drafts the Ganita Prakash chapter 1 topics that are not yet clean,
# retrying each until author:pack exits 0 (no blocking faults AND no
# second-reader doubts).
set -u

draft () {
  local no="$1" topic="$2" concept="$3"
  for attempt in 1 2 3 4 5; do
    out=$(npm run -s author:pack -- --book gp \
      --chapter-no 1 --chapter "A Square and A Cube" \
      --topic-no "$no" --topic "$topic" --concept "$concept" 2>&1)
    status=$?
    if [ $status -eq 0 ]; then
      echo "t0$no  CLEAN on attempt $attempt  — $topic"
      return 0
    fi
    echo "t0$no  attempt $attempt:"
    echo "$out" | grep -E "^  (BLOCK|2nd|ERROR)" | sed 's/^/      /' | head -6
  done
  echo "t0$no  STILL NOT CLEAN after 5 attempts — $topic"
  return 1
}

draft 1 "Square Numbers and Their Patterns" "What makes a number a perfect square"
draft 2 "Finding Square Roots" "How to find the square root of a perfect square"
draft 4 "Finding Cube Roots" "How to find the cube root of a perfect cube"
