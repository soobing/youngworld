#!/usr/bin/env bash
# =====================================================================
# build.sh — 「나의 꿈은」 이미지 → 영상 빌더 (ffmpeg 만 사용, 구독 0원)
#
#   사용법:  ./tools/dream-film/build.sh <사람슬러그>
#   예)      ./tools/dream-film/build.sh soobing
#
# 하는 일: 그림 5장을 받아 "슬라이드쇼"가 아니라 "영상"으로 만든다.
#   1) 컷 안에서 카메라가 천천히 움직인다      → zoompan (켄 번스 효과)
#   2) 컷과 컷이 녹아서 이어진다                → xfade (크로스페이드)
#   3) 5장이 한 질감으로 묶인다                 → noise(필름그레인) + vignette
#   4) 컷마다 한 줄 자막이 떴다 사라진다        → drawtext
#   5) 배경음악이 페이드 인/아웃 된다           → afade
#
# 왜 ffmpeg 인가: Kling·Veo 같은 AI 영상 생성은 2026-07 기준 무료 API 가 없다.
#   (Veo 3.1 = $0.40/초) ffmpeg 는 로컬에서 무료·무제한이고, 몇 번을 다시
#   돌려도 똑같은 결과가 나온다(재현 가능). 그래서 학생들도 똑같이 쓸 수 있다.
#
# 그래도 "진짜 움직이는 컷"을 넣고 싶다면:
#   frames/03.mp4 처럼 mp4 를 넣어두면 그 컷은 zoompan 을 건너뛰고 그 영상을
#   그대로 쓴다. Google Flow(하루 50 무료 크레딧) 같은 걸로 하이라이트 컷만
#   뽑아 넣으면 스크립트를 고치지 않고도 섞인다.
#
# 주의: macOS 기본 bash 는 3.2 라서 mapfile 같은 최신 문법을 쓰지 않는다.
# =====================================================================
set -euo pipefail

# ---------------------------------------------------------------- 설정값
FPS=30            # 초당 프레임
CLIP=6            # 컷 하나의 길이(초). 5초 노출 + 1초는 다음 컷과 겹침
XF=1              # 크로스페이드 길이(초)
CRF=23            # 화질(낮을수록 고화질·큰 용량). 18~28 사이에서 조절
WARN_MB=15        # 이 용량을 넘으면 경고(git 에 커밋할 파일이라)

# 최종 해상도. 원본 그림보다 크게 잡으면 물러지기만 하니, 그림이 작으면 낮춰라.
#   예) 그림이 1375x768 → W=1280 H=720 ./tools/dream-film/build.sh soobing
W="${W:-1920}"; H="${H:-1080}"

BIG_W=$((W * 3)); BIG_H=$((H * 3))  # zoompan 전용 3배 확대. 이걸 안 하면 줌이 덜덜 떨린다

HOLD=$((CLIP - XF))                 # 컷 하나가 온전히 보이는 시간 = 5초
KEN_FRAMES=$((CLIP * FPS))          # 컷 하나의 프레임 수 = 180

# 자막 크기·위치는 해상도에 비례시킨다(720p 에서 글자가 화면을 뚫지 않게).
FS=$((H / 24))                      # 1080→45, 720→30
CAP_Y=$((H - H * 150 / 1080))       # 1080→930, 720→620
CAP_PAD=$((H / 49))                 # 글자 상자 여백

# ---------------------------------------------------------------- 준비
SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "사용법: $0 <사람슬러그>     예) $0 soobing" >&2
  exit 1
fi

# WORKS_DIR 은 테스트용 탈출구. 보통은 신경 쓸 필요 없다.
ROOT="${WORKS_DIR:-$(cd "$(dirname "$0")/../../public/works" && pwd)}"
DIR="$ROOT/$SLUG/dream"
FRAMES_DIR="$DIR/frames"
OUT="$DIR/dream.mp4"
POSTER="$DIR/poster.jpg"

if ! command -v ffmpeg >/dev/null; then
  echo "❌ ffmpeg 가 없습니다.  brew install ffmpeg" >&2
  exit 1
fi

# ---------------------------------------------------------------- 입력 확인
# 없으면 "무엇을 어디에 넣어야 하는지" 를 알려주고 끝낸다. (학생이 처음 쓸 때의 경로)
if [ ! -d "$FRAMES_DIR" ]; then
  cat >&2 <<EOF
❌ 그림 폴더가 없습니다: $FRAMES_DIR

  이렇게 준비해 주세요.

    $DIR/
      frames/01.png  02.png  03.png  04.png  05.png   ← 1920x1080 그림 5장
      captions.txt                                     ← 한 줄 = 한 컷 자막
      bgm.mp3                                          ← 배경음악
      credits.txt                                      ← 음악 출처·라이선스

  그림 프롬프트가 필요하면 Claude 에게 "dream-film 으로 $SLUG 꺼 만들어줘" 라고 하세요.
EOF
  exit 1
fi

# 01, 02, 03 … 번호 순으로 모은다.
# 같은 번호에 그림과 영상이 둘 다 있으면 영상(mp4/mov)을 우선한다.
BASES=$(ls "$FRAMES_DIR" 2>/dev/null | grep -Ei '\.(png|jpe?g|webp|mp4|mov)$' | sed -E 's/\.[^.]+$//' | sort -u || true)

SRC=(); KIND=()
while IFS= read -r base; do
  if [ -z "$base" ]; then continue; fi
  for ext in mp4 MP4 mov MOV png PNG jpg JPG jpeg JPEG webp WEBP; do
    if [ -f "$FRAMES_DIR/$base.$ext" ]; then
      SRC+=("$FRAMES_DIR/$base.$ext")
      case "$ext" in
        mp4|MP4|mov|MOV) KIND+=("clip") ;;
        *)               KIND+=("img")  ;;
      esac
      break
    fi
  done
done <<< "$BASES"

N=${#SRC[@]}
if [ "$N" -lt 2 ]; then
  echo "❌ $FRAMES_DIR 에 쓸 수 있는 그림이 $N 장뿐입니다. 최소 2장(권장 5장) 넣어주세요." >&2
  exit 1
fi

TOTAL=$((N * HOLD + XF))     # 최종 길이. 5장이면 26초
echo "🎬 $SLUG — 컷 $N 개, 최종 $TOTAL 초"
i=0
while [ "$i" -lt "$N" ]; do
  if [ "${KIND[$i]}" = "clip" ]; then
    echo "   $((i+1)). $(basename "${SRC[$i]}")  (영상 클립 — 그대로 사용)"
  else
    echo "   $((i+1)). $(basename "${SRC[$i]}")  (그림 — 카메라 무빙 적용)"
  fi
  i=$((i + 1))
done

# ---------------------------------------------------------------- 자막·음악
CAPTIONS="$DIR/captions.txt"
BGM=""
for cand in bgm.mp3 bgm.m4a bgm.wav; do
  if [ -f "$DIR/$cand" ]; then BGM="$DIR/$cand"; break; fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 한글 자막을 그리려면 한글 폰트가 필요하다. 없으면 자막만 빼고 계속 간다.
FONT=""
if command -v fc-list >/dev/null 2>&1 && fc-list : family 2>/dev/null | grep -qi "Apple SD Gothic Neo"; then
  FONT="font='Apple SD Gothic Neo'"
elif [ -f /System/Library/Fonts/AppleSDGothicNeo.ttc ]; then
  FONT="fontfile='/System/Library/Fonts/AppleSDGothicNeo.ttc'"
elif [ -f /System/Library/Fonts/Supplemental/AppleGothic.ttf ]; then
  FONT="fontfile='/System/Library/Fonts/Supplemental/AppleGothic.ttf'"
elif [ -f /c/Windows/Fonts/malgun.ttf ]; then
  # Windows(Git Bash) — 맑은 고딕. 찾을 때는 /c/... 로 보지만, ffmpeg 는 네이티브
  # exe 라 그 경로를 못 읽으니 넘길 때는 C:/... 로 준다.
  # 드라이브 문자 뒤의 ':' 가 필터 옵션 구분자와 겹치므로 반드시 이스케이프한다.
  FONT="fontfile='C\\:/Windows/Fonts/malgun.ttf'"
fi

# 필터그래프 안에 넣을 파일 경로를 ffmpeg 가 읽을 수 있는 형태로 바꾼다.
#   Windows 의 ffmpeg 는 네이티브 exe 라 Git Bash 의 /tmp/... 를 못 읽는다.
#   그래서 C:/... 로 바꾸고, 드라이브 문자 뒤의 ':' 는 필터 옵션 구분자와
#   겹치므로 이스케이프한다. macOS·리눅스에선 cygpath 가 없어 그대로 통과한다.
ff_path() {
  if command -v cygpath >/dev/null 2>&1; then
    # 콜론 이스케이프를 sed 로 하면 MSYS(Git Bash) 의 sed 가 치환문의 백슬래시를
    # 그대로 넣지 않는 경우가 있어(환경마다 다름) C\: 가 아니라 C: 로 새어나간다.
    # 그러면 필터 파서가 드라이브 콜론을 옵션 구분자로 오해해 빌드가 깨진다.
    # 그래서 문자열 조립으로 확실하게 'C' + '\:' + 나머지 를 만든다.
    local m; m=$(cygpath -m "$1")     # 예) C:/Users/.../cap1.txt
    printf '%s' "${m:0:1}"'\:'"${m:2}"
  else
    printf '%s' "$1"
  fi
}

# ---------------------------------------------------------------- 입력 인자
INPUTS=()
i=0
while [ "$i" -lt "$N" ]; do
  if [ "${KIND[$i]}" = "img" ]; then
    # 그림 1장을 6초짜리 30fps 영상처럼 읽어들인다
    INPUTS+=(-loop 1 -framerate "$FPS" -t "$CLIP" -i "${SRC[$i]}")
  else
    INPUTS+=(-i "${SRC[$i]}")
  fi
  i=$((i + 1))
done

HAS_AUDIO=0
if [ -n "$BGM" ]; then
  # 음악이 영상보다 짧아도 되도록 무한 반복해서 읽고, 뒤에서 잘라낸다
  INPUTS+=(-stream_loop -1 -i "$BGM")
  HAS_AUDIO=1
  echo "   🎵 배경음악: $(basename "$BGM")"
else
  echo "   ⚠️  bgm.mp3 가 없어 무음으로 만듭니다."
fi

# ---------------------------------------------------------------- 필터그래프
# (1) 컷별 카메라 무빙
#     P = 0→1 로 흐르는 진행도. 이걸로 줌 배율과 위치를 시간에 따라 움직인다.
P="(on/$((KEN_FRAMES - 1)))"
FG=""
i=0
while [ "$i" -lt "$N" ]; do
  n=$((i + 1))
  if [ "${KIND[$i]}" = "clip" ]; then
    # AI 로 만든 영상 클립: 크기만 맞추고, 짧으면 마지막 프레임을 늘려 6초를 채운다
    FG="$FG[$i:v]scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,fps=$FPS,"
    FG="${FG}tpad=stop_mode=clone:stop_duration=$CLIP,trim=0:$CLIP,setpts=PTS-STARTPTS,"
    FG="${FG}setsar=1,format=yuv420p[v$n];"
    i=$((i + 1))
    continue
  fi

  # 그림: 컷 번호에 따라 다른 카메라 무빙을 준다(5개 프리셋을 돌려 씀).
  case $((i % 5)) in
    0) # ① 화면 중앙 살짝 위로 아주 느린 줌인 — "먼 곳을 바라본다"
       Z="1+0.20*$P"; X="iw/2-(iw/zoom/2)"; Y="ih*0.45-(ih/zoom/2)" ;;
    1) # ② 왼쪽 → 오른쪽 팬 — "길을 나선다"
       Z="1.15"; X="(iw-iw/zoom)*$P"; Y="(ih-ih/zoom)/2" ;;
    2) # ③ 중앙으로 조금 더 강한 줌인 — "무언가를 들여다본다"
       Z="1+0.28*$P"; X="iw/2-(iw/zoom/2)"; Y="ih/2-(ih/zoom/2)" ;;
    3) # ④ 아래 → 위 팬 — "올라간다"
       Z="1.15"; X="(iw-iw/zoom)/2"; Y="(ih-ih/zoom)*(1-$P)" ;;
    4) # ⑤ 줌아웃 — "세상이 넓어진다"
       Z="1.22-0.22*$P"; X="iw/2-(iw/zoom/2)"; Y="ih/2-(ih/zoom/2)" ;;
  esac

  FG="$FG[$i:v]scale=$BIG_W:$BIG_H:force_original_aspect_ratio=increase:flags=lanczos,"
  FG="${FG}crop=$BIG_W:$BIG_H,"
  FG="${FG}zoompan=z='$Z':x='$X':y='$Y':d=1:s=${W}x${H}:fps=$FPS,"
  FG="${FG}setsar=1,format=yuv420p[v$n];"
  i=$((i + 1))
done

# (2) 크로스페이드 사슬
#     컷1+컷2 를 1초 겹쳐 붙이고, 그 결과에 컷3 을 또 겹쳐 붙이는 식.
#     겹치는 지점(offset)은 5초, 10초, 15초 … 로 HOLD 만큼씩 밀린다.
PREV="v1"
n=2
while [ "$n" -le "$N" ]; do
  OFF=$(((n - 1) * HOLD))
  # 마지막 직전 전환만 한 박자 쉬어 간다(검은 화면을 스쳐 지나감).
  TR="fade"
  if [ "$((n - 1))" -eq "$((N - 1))" ] && [ "$N" -ge 4 ]; then TR="fadeblack"; fi
  LABEL="x$n"
  if [ "$n" -eq "$N" ]; then LABEL="vmix"; fi
  FG="$FG[$PREV][v$n]xfade=transition=$TR:duration=$XF:offset=$OFF[$LABEL];"
  PREV="$LABEL"
  n=$((n + 1))
done

# (3) 톤 통일 — 필름 그레인 + 비네트.
#     서로 다른 그림 5장을 "한 편의 영상"으로 느끼게 해주는 값싼 마법.
FG="$FG[vmix]noise=alls=6:allf=t,vignette=PI/5[vtone];"

# (4) 자막 — 컷이 온전히 보이는 구간에만 띄운다(크로스페이드 중엔 숨김).
LAST="vtone"
if [ -n "$FONT" ] && [ -f "$CAPTIONS" ]; then
  ci=0
  while IFS= read -r line || [ -n "$line" ]; do
    ci=$((ci + 1))
    if [ "$ci" -gt "$N" ]; then break; fi
    if [ -z "$(echo "$line" | tr -d '[:space:]')" ]; then continue; fi
    # 쉼표·콜론·따옴표 escape 지옥을 피하려고 텍스트를 파일로 넘긴다.
    printf '%s' "$line" > "$TMP/cap$ci.txt"
    ST=$(awk "BEGIN{printf \"%.2f\", ($ci-1)*$HOLD+0.8}")
    if [ "$ci" -eq "$N" ]; then
      EN=$(awk "BEGIN{printf \"%.2f\", $TOTAL-0.8}")
    else
      EN=$(awk "BEGIN{printf \"%.2f\", ($ci-1)*$HOLD+$HOLD}")
    fi
    FG="$FG[$LAST]drawtext=$FONT:textfile='$(ff_path "$TMP/cap$ci.txt")':"
    FG="${FG}fontcolor=white:fontsize=$FS:line_spacing=10:"
    FG="${FG}box=1:boxcolor=0x1b2f57@0.55:boxborderw=$CAP_PAD:"   # intro.html 의 남색 --accent2
    FG="${FG}x=(w-tw)/2:y=$CAP_Y:fix_bounds=1:"
    FG="${FG}enable='between(t,$ST,$EN)'[c$ci];"
    LAST="c$ci"
  done < "$CAPTIONS"
elif [ -z "$FONT" ]; then
  echo "   ⚠️  한글 폰트를 찾지 못해 자막 없이 만듭니다."
else
  echo "   ⚠️  captions.txt 가 없어 자막 없이 만듭니다."
fi
FG="$FG[$LAST]format=yuv420p[vout]"

# (5) 음악 — 앞 2초 페이드인, 끝 3초 페이드아웃
MAP=(-map "[vout]")
if [ "$HAS_AUDIO" = 1 ]; then
  AFO=$(awk "BEGIN{printf \"%.2f\", $TOTAL-3}")
  FG="$FG;[$N:a]atrim=0:$TOTAL,asetpts=PTS-STARTPTS,"
  FG="${FG}afade=t=in:st=0:d=2,afade=t=out:st=$AFO:d=3,volume=0.85[aout]"
  MAP+=(-map "[aout]" -c:a aac -b:a 160k)
fi

# ---------------------------------------------------------------- 인코딩
echo "   ⏳ 인코딩 중… (1~2분 걸릴 수 있어요)"
ffmpeg -hide_banner -loglevel error -stats -y \
  "${INPUTS[@]}" \
  -filter_complex "$FG" \
  "${MAP[@]}" \
  -t "$TOTAL" \
  -c:v libx264 -crf "$CRF" -preset slow -pix_fmt yuv420p -r "$FPS" \
  -movflags +faststart \
  "$OUT"

# 포스터(첫 화면 정지컷) — <video poster> 에 쓴다
ffmpeg -hide_banner -loglevel error -y -ss 1.5 -i "$OUT" -frames:v 1 -q:v 3 "$POSTER"

# ---------------------------------------------------------------- 결과
SIZE_MB=$(($(wc -c < "$OUT") / 1024 / 1024))
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)
echo ""
echo "✅ 완성:  $OUT"
echo "   ${DUR}초 · ${W}x${H} · ${SIZE_MB}MB"
echo "   포스터: $POSTER"
if [ "$SIZE_MB" -gt "$WARN_MB" ]; then
  echo ""
  echo "   ⚠️  ${SIZE_MB}MB 는 git 에 넣기엔 좀 큽니다."
  echo "      이 파일 맨 위 CRF=$CRF 를 28 로 올리거나, W/H 를 1280x720 으로 낮춰 다시 돌려보세요."
fi
