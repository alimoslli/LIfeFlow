set -e
S=$1; A=$2
B=/usr/share/fonts/opentype/inter/Inter-Bold.otf
M=/usr/share/fonts/opentype/inter/Inter-Medium.otf
N="fps=30,format=yuv420p,setsar=1"
# a clip from a source, trimmed and scaled to 1080x1920, with a quick punch-in at the start so the cut is visible
rec() { ffmpeg -v error -y -ss $2 -t $3 -i $1 -an -t $3 -vf "fps=30,scale=1080:1920,zoompan=z='if(lte(on,4),1.06-0.015*on,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,$N" $4; }
still() { ffmpeg -v error -y -loop 1 -t $2 -i $1 -t $2 -vf "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,$N" $3; }
cap() { printf '%s' "$2" > cap.txt; ffmpeg -v error -y -i $1 -vf "drawtext=fontfile=$B:textfile=cap.txt:fontsize=78:fontcolor=white:borderw=0:box=1:boxcolor=black@0.45:boxborderw=28:x=(w-text_w)/2:y=h*0.14" -an $3; }
card() { ffmpeg -v error -y -f lavfi -t 3 -i "color=c=#152643:s=1080x1920:r=30" -vf "drawtext=fontfile=$B:text='$1':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=h*0.42,drawtext=fontfile=$M:text='$2':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=h*0.42+100,drawtext=fontfile=$B:text='LifeFlow':fontsize=64:fontcolor=#ffcf5a:x=(w-text_w)/2:y=h*0.62,drawtext=fontfile=$M:text='lifeflowweb.com':fontsize=40:fontcolor=white@0.8:x=(w-text_w)/2:y=h*0.62+90,$N" $3; }
join() { out=$1; shift; printf "file '%s'\n" "$@" > list.txt; ffmpeg -v error -y -f concat -safe 0 -i list.txt -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart -an $out; }

# Reel 1: "11:48 PM. Blank page."
ffmpeg -v error -y -t 3 -i $A/m1.mp4 -an -vf "scale=1080:1920,$N" r1a0.mp4; cap r1a0.mp4 "11:48 PM. Blank page." r1a.mp4
rec $S/rec1.webm 3.6 3 r1b.mp4; rec $S/rec1.webm 7.1 2.6 r1c.mp4; rec $S/rec1.webm 10.1 2.4 r1d.mp4; rec $S/rec1.webm 13.2 2.6 r1e.mp4; rec $S/rec1.webm 16.1 2.8 r1f.mp4
still $A/1b.jpg 2 r1g.mp4; card "For when starting" "is the hardest part." r1h.mp4
join reel-1-blank-page.mp4 r1a.mp4 r1b.mp4 r1c.mp4 r1d.mp4 r1e.mp4 r1f.mp4 r1g.mp4 r1h.mp4

# Reel 2: "Back after a rough week."
still $A/2a.jpg 3 r2a0.mp4; cap r2a0.mp4 "Back after a rough week." r2a.mp4
rec $S/rec2.webm 2.2 2.8 r2b.mp4; rec $S/rec2.webm 5.1 5 r2c.mp4
card "No pile." "Just the next thing." r2d.mp4
join reel-2-back-on-track.mp4 r2a.mp4 r2b.mp4 r2c.mp4 r2d.mp4

# Reel 3: "Deep in it."
ffmpeg -v error -y -t 3.5 -i $A/m3.mp4 -an -vf "scale=1080:1920,$N" r3a0.mp4; cap r3a0.mp4 "Deep in it." r3a.mp4
still $A/3b.jpg 2 r3b.mp4; rec $S/rec3.webm 6.1 3.6 r3c.mp4; rec $S/rec3.webm 10.1 3 r3d.mp4
card "A heads-up, at the" "minutes you pick." r3e.mp4
join reel-3-deep-in-it.mp4 r3a.mp4 r3b.mp4 r3c.mp4 r3d.mp4 r3e.mp4
