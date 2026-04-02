#!/usr/bin/env bash
# CrossForge Word List Downloader
# Downloads open-source word lists and frequency data for the CrossForge word database.
# All sources are public domain or permissively licensed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data/raw"
mkdir -p "$DATA_DIR"

echo "=== CrossForge Word List Downloader ==="
echo "Data directory: $DATA_DIR"
echo

# ── 1. SCOWL (Spell Checker Oriented Word Lists) ────────────────────────────
# Public domain. ~400K English words across many size/variant files.
echo "[1/5] Downloading SCOWL word lists..."
SCOWL_URL="https://downloads.sourceforge.net/project/wordlist/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz"
if [ ! -f "$DATA_DIR/scowl.tar.gz" ]; then
    curl -L --retry 3 --progress-bar -o "$DATA_DIR/scowl.tar.gz" "$SCOWL_URL"
else
    echo "  scowl.tar.gz already downloaded, skipping"
fi

if [ ! -d "$DATA_DIR/scowl" ]; then
    echo "  Extracting SCOWL..."
    tar -xzf "$DATA_DIR/scowl.tar.gz" -C "$DATA_DIR"
    SCOWL_EXTRACTED=$(ls "$DATA_DIR" | grep "^scowl-" | head -1)
    mv "$DATA_DIR/$SCOWL_EXTRACTED" "$DATA_DIR/scowl"
fi

# Merge SCOWL word files (sizes 10-70 = common to fairly rare, skip 80-95 = very rare)
echo "  Merging SCOWL word files..."
SCOWL_MERGED="$DATA_DIR/scowl_merged.txt"
> "$SCOWL_MERGED"
for size in 10 20 35 40 50 55 60 70; do
    for variant in english american british; do
        # words, proper-names (for crossword entries like EINSTEIN)
        for suffix in words.txt proper-names.txt upper.txt; do
            f="$DATA_DIR/scowl/final/$variant-$size.$suffix"
            if [ -f "$f" ]; then
                # Add score based on word size (smaller = more common = higher score)
                case $size in
                    10|20) score=90 ;;
                    35|40) score=75 ;;
                    50|55) score=60 ;;
                    60|70) score=45 ;;
                    *) score=30 ;;
                esac
                while IFS= read -r word; do
                    # Strip possessives and non-alpha
                    clean="${word//[^a-zA-Z]/}"
                    [ -n "$clean" ] && echo "$clean;$score"
                done < "$f"
            fi
        done
    done
done >> "$SCOWL_MERGED"

echo "  SCOWL merged: $(wc -l < "$SCOWL_MERGED") raw lines"

# ── 2. Google 10000 English (frequency-weighted common words) ────────────────
echo "[2/5] Downloading Google 10000 English word list..."
G10K_URL="https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
G10K_FILE="$DATA_DIR/google_10k.txt"
if [ ! -f "$G10K_FILE" ]; then
    curl -L --retry 3 --progress-bar -o "$G10K_FILE" "$G10K_URL" || \
        echo "  Warning: could not download google-10k (may be offline), continuing..."
fi

if [ -f "$G10K_FILE" ]; then
    echo "  Converting Google 10K to scored format..."
    TOTAL=$(wc -l < "$G10K_FILE")
    G10K_SCORED="$DATA_DIR/google_10k_scored.txt"
    > "$G10K_SCORED"
    n=0
    while IFS= read -r word; do
        n=$((n+1))
        # Top of list = highest score, scale 50-95
        score=$(python3 -c "print(int(95 - ($n / $TOTAL) * 45))" 2>/dev/null || echo "70")
        clean="${word//[^a-zA-Z]/}"
        [ -n "$clean" ] && echo "$clean;$score"
    done < "$G10K_FILE" > "$G10K_SCORED"
    echo "  Google 10K scored: $(wc -l < "$G10K_SCORED") lines"
fi

# ── 3. WordNet-based word list (via NLTK, if Python available) ───────────────
echo "[3/5] Generating WordNet / common phrase entries..."
PHRASES_FILE="$DATA_DIR/common_phrases.txt"
python3 - <<'PYEOF' > "$PHRASES_FILE" 2>/dev/null || echo "  Python phrase generation skipped"
# Common crossword multi-word entries: phrases joined without spaces
# These are standard crosswordese-style entries that appear frequently
phrases = [
    # Common two-word entries (very common in NYT)
    ("ITS", "A", "TRAP", 85), ("IN", "A", "SENSE", 60), ("ICE", "CREAM", 80),
    ("SO", "BE", "IT", 65), ("AS", "AM", "I", 55), ("BE", "THAT", "AS", "IT", "MAY", 50),
    ("ALL", "IN", "ALL", 60), ("ON", "THE", "DOT", 65), ("IN", "THE", "END", 65),
    ("ALL", "AT", "ONCE", 60), ("OUT", "OF", "THE", "BLUE", 55),
    ("COME", "ON", 70), ("NO", "WAY", 75), ("GO", "FOR", "IT", 65),
    ("YES", "MAN", 70), ("NO", "MAN", 60), ("OLD", "BOY", 60),
    ("TOP", "DOG", 65), ("HOT", "DOG", 75), ("CORN", "DOG", 60),
    ("SUN", "BURN", 70), ("MOON", "BEAM", 65), ("STAR", "FISH", 65),
    ("AIR", "PLANE", 75), ("AIR", "WAVE", 60), ("AIR", "LINE", 70),
    ("OVER", "ALL", 70), ("OVER", "LOOK", 70), ("OVER", "LAP", 65),
    ("UNDER", "SCORE", 70), ("UNDER", "MINE", 65), ("UNDER", "TONE", 60),
    ("OUT", "SIDE", 75), ("OUT", "RIGHT", 70), ("OUT", "SMART", 70),
    ("CROSS", "WORD", 85), ("CROSS", "OVER", 70), ("CROSS", "TOWN", 65),
    ("BREAK", "FAST", 80), ("BREAK", "AWAY", 65), ("BREAK", "DOWN", 70),
    ("HAND", "SHAKE", 70), ("HAND", "STAND", 65), ("HAND", "BOOK", 65),
    ("BOOK", "WORM", 70), ("BOOK", "MARK", 70), ("BOOK", "END", 65),
    ("FIRE", "PLACE", 75), ("FIRE", "SIDE", 65), ("FIRE", "WORK", 75),
    ("WATER", "FALL", 75), ("WATER", "FRONT", 65), ("WATER", "PROOF", 65),
    ("EARTH", "QUAKE", 70), ("EARTH", "WORM", 65), ("EARTH", "LING", 55),
    ("BALL", "PARK", 70), ("BALL", "ROOM", 70), ("BALL", "GAME", 65),
    ("PLAY", "GROUND", 70), ("PLAY", "MAKER", 65), ("PLAY", "BOOK", 65),
    ("WORK", "SHOP", 70), ("WORK", "LOAD", 65), ("WORK", "OUT", 75),
    ("TIME", "OUT", 75), ("TIME", "LINE", 70), ("TIME", "LESS", 65),
    ("LIFE", "TIME", 70), ("LIFE", "STYLE", 70), ("LIFE", "LINE", 65),
    ("DAY", "LIGHT", 70), ("DAY", "DREAM", 70), ("DAY", "BREAK", 65),
    ("NIGHT", "MARE", 70), ("NIGHT", "FALL", 65), ("NIGHT", "LIFE", 65),
    ("SUN", "SHINE", 75), ("SUN", "RISE", 70), ("SUN", "SET", 70),
    ("MOON", "LIGHT", 70), ("MOON", "SHINE", 65), ("MOON", "WALK", 70),
    ("STAR", "LIGHT", 65), ("STAR", "BOARD", 65), ("STAR", "DUST", 65),
    ("RAIN", "BOW", 75), ("RAIN", "DROP", 65), ("RAIN", "COAT", 65),
    ("SNOW", "FLAKE", 70), ("SNOW", "BALL", 70), ("SNOW", "FALL", 65),
    ("WIND", "MILL", 65), ("WIND", "FALL", 65), ("WIND", "SHIELD", 65),
    ("HOT", "LINE", 65), ("HOT", "SHOT", 70), ("HOT", "BED", 60),
    ("COLD", "FRONT", 65), ("COLD", "SNAP", 65), ("COLD", "CASE", 70),
    ("LONG", "SHOT", 70), ("LONG", "HAND", 60), ("LONG", "BOW", 55),
    ("SHORT", "CAKE", 65), ("SHORT", "HAND", 65), ("SHORT", "STOP", 75),
    ("HIGH", "LIGHT", 75), ("HIGH", "LAND", 65), ("HIGH", "WAY", 75),
    ("LOW", "LAND", 60), ("LOW", "DOWN", 65), ("LOW", "KEY", 70),
    ("BACK", "YARD", 75), ("BACK", "BONE", 70), ("BACK", "STAGE", 70),
    ("FRONT", "LINE", 70), ("FRONT", "MAN", 65), ("FRONT", "PAGE", 65),
    ("SIDE", "WALK", 75), ("SIDE", "SHOW", 65), ("SIDE", "LINE", 65),
    ("TOP", "SIDE", 60), ("TOP", "COAT", 60), ("TOP", "SOIL", 65),
    ("GROUND", "WORK", 65), ("GROUND", "HOG", 70), ("GROUND", "SWELL", 55),
    ("LAND", "MARK", 70), ("LAND", "SLIDE", 70), ("LAND", "LORD", 65),
    ("SEA", "SIDE", 65), ("SEA", "SHORE", 65), ("SEA", "BIRD", 60),
    ("RIVER", "BANK", 65), ("RIVER", "BED", 60), ("RIVER", "SIDE", 65),
    ("LAKE", "SIDE", 55), ("LAKE", "FRONT", 55), ("LAKE", "BED", 50),
    ("MOUNTAIN", "TOP", 65), ("MOUNTAIN", "SIDE", 60),
    ("CAMP", "FIRE", 70), ("CAMP", "GROUND", 65), ("CAMP", "SITE", 60),
    # Pop culture / lively entries
    ("NETFLIX", 80), ("GOOGLE", 85), ("TWITTER", 75), ("TIKTOK", 75),
    ("PODCAST", 80), ("HASHTAG", 75), ("SELFIE", 80), ("EMOJI", 75),
    ("UBER", 75), ("LYFT", 65), ("ZOOM", 80), ("TEXTING", 75),
    ("LAPTOP", 75), ("TABLET", 70), ("SMARTPHONE", 70), ("EARBUDS", 70),
    ("WIFI", 80), ("BLUETOOTH", 70), ("STREAMING", 75), ("DOWNLOAD", 70),
    ("UPLOAD", 65), ("PIXEL", 70), ("AVATAR", 70), ("MEME", 80),
    ("VIRAL", 75), ("TRENDING", 70), ("INFLUENCER", 65),
    # Sports & entertainment
    ("HOMERUN", 75), ("TOUCHDOWN", 75), ("SLAPSHOT", 65), ("REBOUND", 70),
    ("OVERTIME", 70), ("PLAYOFF", 70), ("PENNANT", 65), ("DUGOUT", 65),
    ("BULLPEN", 65), ("PINCHIT", 55), ("INFIELD", 65), ("OUTFIELD", 65),
    # Common crossword starters
    ("ALOE", 55), ("ARIA", 60), ("ATOP", 55), ("AEON", 55), ("ABET", 55),
    ("ANEW", 55), ("UPON", 60), ("INTO", 70), ("ONTO", 65), ("AMID", 55),
    ("AMOK", 60), ("AWRY", 65), ("AGOG", 60), ("AVID", 65), ("AVOW", 55),
    ("APEX", 70), ("AXLE", 60), ("OGLE", 60), ("OGRE", 65), ("OMEN", 65),
    ("OMIT", 60), ("OPAH", 40), ("ORCA", 65), ("IOTA", 65), ("ICON", 75),
]

seen = set()
for parts in phrases:
    if isinstance(parts[-1], int):
        score = parts[-1]
        words = parts[:-1]
    else:
        score = 60
        words = parts
    combined = "".join(str(w) for w in words if isinstance(w, str))
    combined = combined.upper()
    if combined not in seen and 3 <= len(combined) <= 21 and combined.isalpha():
        seen.add(combined)
        print(f"{combined};{score}")
PYEOF
echo "  Phrases generated: $(wc -l < "$PHRASES_FILE") entries"

# ── 4. Crosswordese penalty list ─────────────────────────────────────────────
echo "[4/5] Generating crosswordese penalty/boost adjustments..."
ADJUSTMENTS_FILE="$DATA_DIR/adjustments.txt"
cat > "$ADJUSTMENTS_FILE" << 'ADJEOF'
# Format: WORD;SCORE
# Crosswordese (low scores — these are valid but overused/obscure)
EPEE;20
ESNE;15
ETUI;20
ALOE;40
ALEE;20
ASEA;20
OLEO;20
OREO;50
OLES;25
IRES;25
IRES;25
EIRE;25
ERIN;30
ERNE;25
ERSE;20
SNEE;20
INIA;10
NAEVI;15
ARÊTE;15
ALAE;15
ALULA;20
AREOLA;25
AREOLE;20
NOEL;35
OSSA;20
INRO;20
ATILT;25
ATRIP;20
ATREMBLE;15
ENOL;20
ENOLS;20
UTERI;20
UVEA;25
UVEAL;20
INIA;10
GESTE;20
TARN;30
SCREE;35
TALUS;35
NEBS;25
NIBS;30
ODEA;25
AGEE;20
OGEE;25
SMEW;25
SMEWS;20
SPAE;20
SPAED;15
RIEL;25
RIAL;30
PIETA;40
PIETAS;30
NAIAD;30
# Boost lively / fresh entries
YOLO;75
FOMO;70
WOKE;75
VIBE;80
MOJO;75
SWAG;75
CHILL;75
DOPE;70
LEGIT;75
SLAY;75
LIT;70
SALTY;75
EXTRA;70
LOWKEY;65
HIGHKEY;60
GOAT;75
SAVAGE;70
BINGE;75
STAN;70
SHIP;65
SHADE;70
GHOSTED;70
FLEX;70
SIP;60
BOPS;65
SLAPS;65
HITS;70
FIRE;75
ICY;65
COLD;70
HOT;75
BOP;65
SIP;60
DRIP;65
MOOD;75
VIBES;75
ENERGY;75
GOALS;70
ADULTING;60
GASLIGHTING;65
CATFISHING;65
DOOMSCROLLING;60
GHOSTING;70
BREADCRUMBING;55
SITUATIONSHIP;60
RIZZ;70
SLAY;75
BUSSIN;60
BANGER;70
PERIODT;60
LOWKEY;65
SIMP;65
RATIO;60
UNDERSTOOD;65
PERIODT;60
BESTIE;65
BESTY;55
CHILE;60
CHILLAX;60
VIBE;80
VIBES;75
MOOD;75
ICONIC;75
UNHINGED;65
CHAOTIC;70
BASED;65
CRINGE;70
SUSS;60
CAP;65
NOCAP;60
DEADASS;60
FACTS;75
VALID;70
GUCCI;65
BOUGIE;65
BOUJEE;60
EXTRA;70
THIRSTY;65
SNATCHED;60
LOWKEY;65
SIS;60
BESTIE;65
WOKE;75
YIKES;75
BRUH;70
BLESS;65
AWOKE;60
CANCELLED;65
AWKS;55
ADORBS;55
TOTES;60
OBVI;55
SESH;60
INSPO;60
DRIP;65
LEWK;55
SLAY;75
GLAM;70
GLOWED;65
GLOW;70
GLOATED;55
BEIGE;60
TAUPE;55
MAUVE;55
NOIR;65
RETRO;70
VINTAGE;70
ARTSY;65
QUIRKY;70
NERDY;65
GEEKY;65
HIPSTER;65
FOODIE;70
NORMIE;60
FANBOY;65
FANGIRL;65
FANDOM;65
STAN;70
HYPE;70
HYPED;65
CLOUT;70
VIRAL;75
MEME;80
DANK;65
SPICY;70
THICC;55
SWIPE;70
MATCH;70
GHOSTED;70
SWIPED;60
CATFISH;65
FINSTA;55
SPAM;60
TROLL;65
THREAD;65
TWEETED;60
TWEETING;60
RETWEETED;55
UNFOLLOWED;55
FOLLOWED;55
TRENDING;70
HASHTAG;70
SELFIE;75
PHOTOBOMB;65
VLOG;65
BLOG;65
PODCAST;75
INFLUENCER;65
STREAMER;65
GAMER;70
ESPORT;55
ADJEOF
echo "  Adjustments file created"

# ── 5. Combine everything ────────────────────────────────────────────────────
echo "[5/5] All sources downloaded and prepared."
echo
echo "Files ready in $DATA_DIR:"
ls -lh "$DATA_DIR/"*.txt 2>/dev/null | awk '{print "  " $5, $9}'
echo
echo "Next: run scripts/build-wordlist.py to compile the binary database."
echo "  cd $(dirname "$SCRIPT_DIR")"
echo "  python3 scripts/build-wordlist.py \\"
echo "    data/raw/scowl_merged.txt \\"
echo "    data/raw/google_10k_scored.txt \\"
echo "    data/raw/common_phrases.txt \\"
echo "    data/raw/adjustments.txt \\"
echo "    -o resources/wordlist.bin"
