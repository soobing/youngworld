# 여기에 그림 5장을 넣으세요

```
01.png   제일 뒷줄에서, 제일 뒤를 봤다
02.png   "저 해볼래요" 하고 앉은 첫날
03.png   첫 박, 하나 둘 셋 넷
04.png   한국사, 그리고 "만약 그때 달랐다면"
05.png   이번엔 내가 무대에 앉는다
```

- **1920×1080 (16:9)** 로 통일하세요. 비율이 섞이면 화면이 잘립니다.
- `.png` `.jpg` `.webp` 다 됩니다. 번호 순서대로 영상이 됩니다.
- **`03.mp4` 처럼 mp4 를 넣으면 그 컷만 진짜 영상으로 바뀝니다** (5초 클립).
  같은 번호에 그림과 영상이 둘 다 있으면 영상이 우선합니다.

**01번을 먼저 확정하고, 02~05 를 만들 때 01을 참조 이미지로 첨부하세요.**
특히 **05번은 01번을 반드시 참조로** 넣어야 합니다 — 같은 뒷모습·같은 화면 위치인데
배경만 객석에서 무대로 뒤집히는 게 이 작품의 핵심입니다.

그림을 다 넣었으면:

```bash
W=1280 H=720 ./tools/dream-film/build.sh ahn
```

> 원본이 1376x768 이라 720p 로 빌드합니다. 1920x1080 짜리 그림을 새로 넣었다면
> `W`/`H` 없이 그냥 `./tools/dream-film/build.sh ahn` 으로 돌리세요.

---

# 실제로 쓴 프롬프트 (2026-07-28, Google Gemini)

그림 파일은 `.gitignore` 대상이라 저장소에 없습니다. 다시 만들어야 하면 아래를
그대로 쓰세요. **스타일 앵커를 5개 프롬프트 맨 앞에 매번 붙여야** 5장이 한 사람,
한 화풍으로 유지됩니다.

## 스타일 앵커 (모든 컷 공통)

```
STYLE ANCHOR (do not change between images):
Cel-shaded anime background art, crisp linework, flat color blocks, vivid skies,
cinematic wide 16:9 composition, 1920x1080.
Palette: deep violet #1b1030 shadows, ONE stage-magenta #ff3d7f light source per image.
Character: the SAME Korean high-school student throughout — short black hair,
dark navy school uniform jacket over a white tee, a pair of wooden drumsticks
always visible (in hand or in the back pocket). Always shown from behind or in
three-quarter back view so the face is never the focus.
Lighting: one hard magenta light source, everything else falling into deep violet.
NEGATIVE: text, korean letters, english letters, watermark, signature, logo,
extra fingers, deformed hands, anime big eyes, oversaturated colors, cluttered frame.
```

## 01 — 제일 뒷줄에서, 제일 뒤를 봤다

```
A small live-music venue at night, seen from the very back row of the audience.
In the center of the frame, slightly left, the student sits alone in a folded-down
seat, seen from directly behind, leaning forward with elbows on knees, looking past
rows of dark audience silhouettes toward the distant stage.
On the far stage: a band mid-performance, and behind them at the very back, a drum
kit with the drummer half-hidden behind the cymbals — the student's eyes are on that
back position, not on the singer.
A rolled-up paper flyer in one hand, resting on the knee. Empty seats to either side.
The only light is the magenta stage wash spilling forward over the audience; the back
row where the student sits is almost entirely deep violet shadow.
Cinematic wide shot, generous empty space around the seated figure.
```

## 02 — "저 해볼래요" 하고 앉은 첫날

```
A cramped school band club practice room in the late afternoon, wide horizontal
composition. The student sits on a drum stool for the first time, seen from behind
and slightly to the left, back straight and a little stiff, holding a brand-new pair
of drumsticks awkwardly high.
The kit is old and mismatched: a scuffed bass drum, one cracked cymbal, a snare with
worn tape on the head. Coiled cables on the floor, a stack of egg-crate foam panels
on the wall, a folding chair with a school bag dropped on it.
A single window on the right lets in a low magenta evening sky; the light rakes across
the room from right to left, the far left corner sinking into deep violet.
Cinematic wide shot with room on both sides for the camera to pan.
```

## 03 — 첫 박, 하나 둘 셋 넷

```
On stage at a school festival, the exact instant before the first beat.
Tight three-quarter back view of the student seated at the drum kit, one arm already
raised with a drumstick at the top of its swing, shoulders tense, head tilted slightly
down toward the snare.
Close around them: the ride cymbal catching the light, the hi-hat, the snare head.
Further ahead, the backs of two bandmates and a mic stand as dark silhouettes against
the glare.
A single hard magenta spotlight comes straight down from above onto the kit, throwing
a sharp-edged pool of light; the rest of the stage is deep violet. Faint haze in the
beam.
Cinematic medium shot, the figure filling much of the frame.
```

## 04 — 한국사, 그리고 "만약 그때 달랐다면"

```
A student's desk at night, tall vertical arrangement of detail from bottom to top.
Low in the frame: an open thick Korean-history exam workbook, pages dense with
unreadable printed lines, a highlighter and a mechanical pencil beside it.
In the middle: an open notebook where a timeline has been drawn by hand — one solid
line running straight on, and from a single circled point a dashed line branching
upward and away.
Above, pinned to the wall: more handwritten timeline pages overlapping each other.
The student is seen from behind at the desk, head propped on one hand, looking up at
the dashed branch rather than down at the workbook. Drumsticks lie forgotten at the
edge of the desk.
One desk lamp throws a warm magenta cone up the wall; the rest of the room is deep
violet.
Cinematic shot composed so the eye travels from the desk upward.
```

> ⚠️ 이 컷만 주의: `NEGATIVE` 로 글자를 막았는데도 Gemini 가 벽과 교재에 알아볼 수
> 없는 가짜 글자를 그려 넣었습니다. 다시 만든다면 프롬프트에 아래 한 줄을 더하세요.
> `All books, papers and wall notes must be blank or show only abstract line marks —
> absolutely no letters or characters of any language.`

## 05 — 이번엔 내가 무대에 앉는다  ⚠️ 01번을 반드시 참조 이미지로

```
SAME back-view pose, SAME placement in frame as image 01 — the figure centered and
slightly left, seated, leaning forward with elbows on knees, seen from directly
behind. Only the world around them is reversed.
Now they are on the stage of a large concert hall, seated at a full drum kit at the
back of the stage, looking out. Where image 01 had rows of empty seats and dark
silhouettes, here a packed audience stretches away into the dark, hundreds of faces
turned toward the stage, a balcony above them.
On the kit: cymbals, a snare, drumsticks held loosely in one hand. Bandmates' backs
far ahead near the stage lip.
The magenta light now comes from BEHIND the figure — stage lights above and behind,
rimming their shoulders — and spills out over the crowd instead of onto them.
Cinematic wide shot with a lot of space around the figure so the hall can open up.
```
