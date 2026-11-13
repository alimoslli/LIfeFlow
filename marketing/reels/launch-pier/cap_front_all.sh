cd /tmp/claude-0/-home-user/77458121-78bd-5404-8e7b-4f5218da6002/scratchpad/whatsnew
run() { pgrep -f "[n]ext-server" | xargs -r kill; sleep 2
  (nohup bash /home/user/LIfeFlow/marketing/reels/whats-new/serve_ai.sh "$1" none > ../launch/server_$2.log 2>&1 &); sleep 14
  AT="$3" timeout 300 node cap_front.cjs $2; }
run "2026-11-17 18:39:30" afternoon 2026-11-17T18:39:58Z
run "2026-11-17 21:19:30" golden 2026-11-17T21:19:58Z
run "2026-11-18 03:39:30" night 2026-11-18T03:39:58Z
pgrep -f "[n]ext-server" | xargs -r kill
echo ALLDONE
