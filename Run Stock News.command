#!/bin/bash
cd /Users/yrc/Downloads/project-01-news || exit 1

./run.sh &
SERVER_PID=$!

for i in {1..30}; do
  if curl -s http://localhost:3000 >/dev/null; then
    open http://localhost:3000
    wait $SERVER_PID
    exit 0
  fi
  sleep 1
done

open http://localhost:3000
wait $SERVER_PID

