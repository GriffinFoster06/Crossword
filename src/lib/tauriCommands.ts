/// Typed wrappers around Tauri invoke commands.
/// Falls back to local implementations when running in browser (dev without Tauri).

import type {
  GridState, WordMatch, WordInfo, ValidationResult, GridStats,
  AutofillResult, AutofillOptions, PuzzleFile,
  OllamaStatus, ClueCandidate, ThemeSuggestion, RankedWord, ClueHistoryEntry,
} from '../types/crossword';

// Check if we're running inside Tauri
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let listen: ((event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>) | null = null;

async function initTauri() {
  try {
    const api = await import('@tauri-apps/api/core');
    invoke = api.invoke;
    const eventApi = await import('@tauri-apps/api/event');
    listen = eventApi.listen;
    return true;
  } catch {
    return false;
  }
}

let tauriReady: Promise<boolean> | null = null;
function ensureTauri(): Promise<boolean> {
  if (!tauriReady) tauriReady = initTauri();
  return tauriReady;
}

async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await ensureTauri();
  if (!invoke) throw new Error('Not running in Tauri');
  return invoke(cmd, args) as Promise<T>;
}

// --- Word Database ---

export async function queryWords(pattern: string, limit = 100): Promise<WordMatch[]> {
  try {
    return await callTauri<WordMatch[]>('cmd_query_words', { pattern, limit });
  } catch {
    return localQueryWords(pattern, limit);
  }
}

export async function getWordCount(): Promise<number> {
  try {
    return await callTauri<number>('cmd_get_word_count');
  } catch {
    return FALLBACK_WORDS.length;
  }
}

export async function getWordInfo(word: string): Promise<WordInfo> {
  try {
    return await callTauri<WordInfo>('cmd_get_word_info', { word });
  } catch {
    const upper = word.toUpperCase();
    const found = FALLBACK_WORDS.find(w => w.word === upper);
    return { word: upper, score: found?.score ?? 0, exists: !!found };
  }
}

// --- Grid ---

export async function validateGrid(grid: GridState): Promise<ValidationResult> {
  try {
    return await callTauri<ValidationResult>('cmd_validate_grid', { grid });
  } catch {
    return { is_valid: true, violations: [], stats: {} as GridStats };
  }
}

// --- Autofill ---

export async function startAutofill(
  grid: GridState,
  options?: AutofillOptions,
  onProgress?: (p: unknown) => void,
): Promise<AutofillResult> {
  await ensureTauri();
  let unlisten: (() => void) | null = null;
  if (listen && onProgress) {
    unlisten = await listen('autofill-progress', (e) => onProgress(e.payload));
  }
  try {
    return await callTauri<AutofillResult>('cmd_start_autofill', { grid, options });
  } finally {
    unlisten?.();
  }
}

export async function cancelAutofill(): Promise<void> {
  try {
    await callTauri<void>('cmd_cancel_autofill');
  } catch { /* ignore */ }
}

// --- File I/O ---

export async function savePuzzle(puzzle: PuzzleFile, path: string): Promise<void> {
  return callTauri('cmd_save_puzzle', { puzzle, path });
}

export async function loadPuzzle(path: string): Promise<PuzzleFile> {
  return callTauri('cmd_load_puzzle', { path });
}

export async function exportPuz(puzzle: PuzzleFile, path: string): Promise<void> {
  return callTauri('cmd_export_puz', { puzzle, path });
}

export async function importPuz(path: string): Promise<PuzzleFile> {
  return callTauri('cmd_import_puz', { path });
}

export async function exportPdf(puzzle: PuzzleFile, path: string, includeSolution = false): Promise<void> {
  return callTauri('cmd_export_pdf', { puzzle, path, includeSolution });
}

export interface NytExportResult {
  puz_path: string;
  cover_letter: string;
  warnings: string[];
}

export async function exportNyt(
  puzzle: PuzzleFile,
  puzPath: string,
  validation: ValidationResult,
): Promise<NytExportResult> {
  return callTauri('cmd_export_nyt', { puzzle, puzPath, validation });
}

// --- AI ---

export async function checkOllama(): Promise<OllamaStatus> {
  try {
    return await callTauri<OllamaStatus>('cmd_check_ollama');
  } catch {
    return { available: false, models: [], selected_model: null };
  }
}

export async function generateClues(
  answer: string,
  difficulty: number,
  crossingWords: string[] = [],
  themeHint?: string,
): Promise<ClueCandidate[]> {
  return callTauri('cmd_generate_clues', {
    answer,
    difficulty,
    crossingWords,
    themeHint: themeHint ?? null,
  });
}

export async function developTheme(
  seed: string,
  gridSize: number,
  difficulty?: string,
): Promise<ThemeSuggestion> {
  return callTauri('cmd_develop_theme', { seed, gridSize, difficulty: difficulty ?? null });
}

export async function suggestWords(
  pattern: string,
  candidates: string[],
  crossingContext: string[] = [],
  theme?: string,
): Promise<RankedWord[]> {
  return callTauri('cmd_suggest_words', { pattern, candidates, crossingContext, theme: theme ?? null });
}

export async function getClueHistory(word: string): Promise<ClueHistoryEntry[]> {
  try {
    return await callTauri<ClueHistoryEntry[]>('cmd_get_clue_history', { word });
  } catch {
    return [];
  }
}

export interface BatchClueInput {
  number: number;
  direction: string;
  answer: string;
}

export interface BatchClueResult {
  number: number;
  direction: string;
  answer: string;
  clue: string;
  style: string;
}

export interface GridPattern {
  pattern: number[][];
  theme_positions: { row: number; col: number; direction: string; word: string }[];
  word_count: number;
  black_count: number;
  description: string;
  notes: string;
}

export interface PuzzleRequest {
  theme_seed: string;
  difficulty: string;
  requested_entries: string[];
  grid_size: number;
  notes: string;
}

export async function batchGenerateClues(
  words: BatchClueInput[],
  difficulty: number,
  onProgress?: (index: number, total: number, result: BatchClueResult) => void,
): Promise<BatchClueResult[]> {
  await ensureTauri();
  let unlisten: (() => void) | null = null;
  if (listen && onProgress) {
    unlisten = await listen('batch-clue-progress', (e: { payload: unknown }) => {
      const p = e.payload as { index: number; total: number; result: BatchClueResult };
      onProgress(p.index, p.total, p.result);
    });
  }
  try {
    return await callTauri<BatchClueResult[]>('cmd_batch_generate_clues', { words, difficulty });
  } finally {
    unlisten?.();
  }
}

export async function constructGrid(
  entries: { word: string; is_revealer: boolean }[],
  gridSize: number,
  difficulty?: string,
): Promise<GridPattern> {
  return callTauri('cmd_construct_grid', { entries, gridSize, difficulty: difficulty ?? null });
}

export async function parsePuzzleRequest(request: string): Promise<PuzzleRequest> {
  return callTauri('cmd_parse_puzzle_request', { request });
}

export async function evaluateFill(words: string[], themeEntries: string[]): Promise<string> {
  return callTauri('cmd_evaluate_fill', { words, themeEntries });
}

export async function checkCrossforgeModels(): Promise<string[]> {
  try {
    return await callTauri<string[]>('cmd_check_crossforge_models');
  } catch {
    return [];
  }
}

export interface ModelInstallProgress {
  step: 'checking' | 'installing' | 'done' | 'skipped' | 'error';
  model: string;
  index: number;
  total: number;
  message: string;
}

export async function installModels(
  onProgress?: (p: ModelInstallProgress) => void,
): Promise<void> {
  await ensureTauri();
  let unlisten: (() => void) | null = null;
  if (listen && onProgress) {
    unlisten = await listen('model-install-progress', (e: { payload: unknown }) => {
      onProgress(e.payload as ModelInstallProgress);
    });
  }
  try {
    await callTauri<void>('cmd_install_models');
  } finally {
    unlisten?.();
  }
}

// ==========================================
// Local fallback word list (browser dev mode)
// ==========================================

interface FallbackWord {
  word: string;
  score: number;
}

const COMMON_WORDS = [
  'THE','AND','FOR','ARE','BUT','NOT','YOU','ALL','CAN','HER','WAS','ONE',
  'OUR','OUT','DAY','HAD','HAS','HIS','HOW','ITS','MAY','NEW','NOW','OLD',
  'SEE','WAY','WHO','BOY','DID','GET','HIM','LET','SAY','SHE','TOO','USE',
  'ABOUT','AFTER','AGAIN','BEING','COULD','EVERY','FIRST','FOUND','GREAT',
  'HOUSE','LARGE','LEARN','NEVER','OTHER','PLACE','PLANT','POINT','RIGHT',
  'SMALL','SOUND','SPELL','STILL','STUDY','THEIR','THERE','THESE','THING',
  'THINK','THREE','WATER','WHERE','WHICH','WORLD','WOULD','WRITE','ABOVE',
  'ALONG','BEGAN','BELOW','ENTRE','GOING','KNOWN','LATER','MIGHT','NIGHT',
  'OFTEN','PAPER','QUITE','SINCE','STAND','START','STATE','STORY','TABLE',
  'TAKEN','THOSE','UNDER','UNTIL','USING','WATCH','WHILE','WORDS','YEARS',
  'ACROSS','ALMOST','ALWAYS','ANSWER','AROUND','BECAME','BEFORE','BEHIND',
  'BETTER','CHANGE','CIRCLE','COLUMN','COMMON','COURSE','DETAIL','DOUBLE',
  'DURING','ENERGY','ENOUGH','FIGURE','FOLLOW','GROUND','HAPPEN','ISLAND',
  'LETTER','LISTEN','LITTLE','MATTER','MEMBER','MINUTE','MOMENT','MOTION',
  'MOTHER','NATURE','NUMBER','OBJECT','OFFICE','ONLINE','OPENED','ORIGIN',
  'PARENT','PEOPLE','PERIOD','PERSON','POLICE','PUBLIC','REASON','RECORD',
  'REGION','REMAIN','REPORT','RESULT','RETURN','SCHOOL','SECOND','SIMPLE',
  'SINGLE','SOCIAL','SOURCE','SPIRIT','SPRING','SQUARE','STREET','STRONG',
  'SUMMER','SYSTEM','THOUGH','TOWARD','TRAVEL','TWELVE','UNITED','VALLEY',
  'WONDER','WORKER','WRITER','YELLOW','ACE','ADS','AGE','AID','AIM','AIR',
  'ALE','APE','ARC','ARK','ARM','ART','ATE','AWE','AXE','BAD','BAG','BAN',
  'BAR','BAT','BED','BET','BIG','BIT','BOW','BOX','BUD','BUG','BUN','BUS',
  'CAB','CAM','CAP','CAR','CAT','COP','COT','COW','CRY','CUB','CUP','CUR',
  'CUT','DAD','DAM','DEN','DEW','DIG','DIM','DIP','DOC','DOG','DOT','DRY',
  'DUB','DUD','DUE','DUG','DUN','DUO','DYE','EAR','EAT','EEL','EGG','EGO',
  'ELF','ELK','ELM','EMU','END','ERA','EVE','EWE','EYE','FAN','FAR','FAT',
  'FAX','FED','FEW','FIG','FIN','FIT','FIX','FLY','FOB','FOE','FOG','FOP',
  'FOX','FRY','FUN','FUR','GAB','GAG','GAP','GAS','GAY','GEL','GEM','GET',
  'GIG','GIN','GNU','GOB','GOD','GOT','GUM','GUN','GUT','GUY','GYM','HAD',
  'HAM','HAP','HAT','HAY','HEN','HEW','HID','HIM','HIP','HIT','HOB','HOG',
  'HOP','HOT','HUB','HUE','HUG','HUM','HUT','ICE','ICY','ILL','IMP','INK',
  'INN','ION','IRE','IRK','IVY','JAB','JAG','JAM','JAR','JAW','JAY','JET',
  'JIG','JOB','JOG','JOT','JOY','JUG','JUT','KEG','KEN','KEY','KID','KIN',
  'KIT','LAB','LAD','LAG','LAP','LAW','LAX','LAY','LEA','LED','LEG','LET',
  'LID','LIE','LIP','LIT','LOG','LOT','LOW','LUG','MAD','MAP','MAR','MAT',
  'MAW','MEN','MET','MID','MIX','MOB','MOD','MOM','MOP','MOW','MUD','MUG',
  'NAB','NAG','NAP','NET','NIL','NIT','NOD','NOR','NOT','NOW','NUB','NUN',
  'NUT','OAK','OAR','OAT','ODD','ODE','OFF','OFT','OIL','OLD','OPT','ORB',
  'ORE','OUR','OUT','OWE','OWL','OWN','PAD','PAL','PAN','PAP','PAR','PAT',
  'PAW','PAY','PEA','PEG','PEN','PEP','PER','PET','PEW','PIE','PIG','PIN',
  'PIT','PLY','POD','POP','POT','POW','PRY','PUB','PUG','PUN','PUP','PUS',
  'PUT','RAG','RAM','RAN','RAP','RAT','RAW','RAY','RED','REF','RIB','RID',
  'RIG','RIM','RIP','ROB','ROD','ROT','ROW','RUB','RUG','RUM','RUN','RUT',
  'RYE','SAC','SAD','SAG','SAP','SAT','SAW','SAY','SEA','SET','SEW','SHY',
  'SIN','SIP','SIS','SIT','SIX','SKI','SKY','SLY','SOB','SOD','SON','SOP',
  'SOT','SOW','SOY','SPA','SPY','STY','SUB','SUM','SUN','SUP','TAB','TAD',
  'TAG','TAN','TAP','TAR','TAT','TAX','TEA','TEN','THE','TIC','TIE','TIN',
  'TIP','TOE','TON','TOO','TOP','TOW','TOY','TUB','TUG','TWO','URN','USE',
  'VAN','VAT','VET','VEX','VIA','VIE','VOW','WAD','WAR','WAX','WEB','WED',
  'WET','WHO','WIG','WIN','WIT','WOE','WOK','WON','WOO','WOW','YAK','YAM',
  'YAP','YAW','YEA','YES','YET','YEW','YIN','ZAP','ZEN','ZIP','ZIT','ZOO',
  'ABLE','ALSO','AREA','ARMY','AWAY','BACK','BALL','BAND','BANK','BASE',
  'BATH','BEAR','BEAT','BEEN','BELL','BELT','BEST','BIKE','BILL','BIRD',
  'BITE','BLOW','BLUE','BOAT','BODY','BOLD','BOMB','BOND','BONE','BOOK',
  'BOOT','BORE','BORN','BOSS','BOTH','BOWL','BURN','BUSY','CAFE','CAGE',
  'CAKE','CALL','CALM','CAME','CAMP','CAPE','CARD','CARE','CART','CASE',
  'CASH','CAST','CAVE','CHAT','CHEF','CHIN','CHIP','CITY','CLAD','CLAM',
  'CLAN','CLAP','CLAY','CLIP','CLUB','CLUE','COAL','COAT','CODE','COIN',
  'COLD','COLE','COLT','COME','COOK','COOL','COPE','COPY','CORD','CORE',
  'CORN','COST','COUP','CREW','CROP','CROW','CURE','CURL','CUTE','DALE',
  'DAME','DAMP','DARE','DARK','DART','DASH','DATA','DATE','DAWN','DEAD',
  'DEAL','DEAN','DEAR','DEBT','DECK','DEED','DEEM','DEEP','DEER','DEMO',
  'DENY','DESK','DIAL','DICE','DIET','DINE','DIRT','DISC','DISH','DOCK',
  'DOES','DOME','DONE','DOOM','DOOR','DOSE','DOWN','DRAG','DRAW','DREW',
  'DROP','DRUG','DRUM','DUAL','DUCK','DUDE','DUEL','DUKE','DULL','DUMB',
  'DUMP','DUNE','DUSK','DUST','DUTY','EACH','EARN','EASE','EAST','EASY',
  'EDGE','EDIT','ELSE','EMIT','EPIC','EVEN','EVER','EVIL','EXAM','EXIT',
  'FACE','FACT','FADE','FAIL','FAIR','FAKE','FALL','FAME','FANG','FARE',
  'FARM','FAST','FATE','FEAR','FEAT','FEED','FEEL','FELL','FELT','FILE',
  'FILL','FILM','FIND','FINE','FIRE','FIRM','FISH','FIST','FLAG','FLAT',
  'FLED','FLEW','FLIP','FLOW','FOAM','FOLD','FOLK','FOND','FONT','FOOD',
  'FOOL','FOOT','FORD','FORE','FORK','FORM','FORT','FOUL','FOUR','FREE',
  'FROM','FUEL','FULL','FUND','FURY','FUSE','GAIN','GALA','GALE','GAME',
  'GANG','GATE','GAVE','GAZE','GEAR','GENE','GIFT','GIRL','GIVE','GLAD',
  'GLOW','GLUE','GOAT','GOES','GOLD','GOLF','GONE','GOOD','GRAB','GRAY',
  'GREW','GREY','GRID','GRIM','GRIN','GRIP','GROW','GULF','GURU','GUST',
  'HACK','HAIR','HAIL','HALF','HALL','HALT','HAND','HANG','HARD','HARE',
  'HARM','HARP','HATE','HAUL','HAVE','HEAD','HEAL','HEAP','HEAR','HEAT',
  'HEEL','HEIR','HELD','HELP','HERB','HERD','HERE','HERO','HIGH','HIKE',
  'HILL','HINT','HIRE','HOLD','HOLE','HOME','HOOK','HOPE','HORN','HOST',
  'HOUR','HUGE','HULL','HUNG','HUNT','HURT','HYMN','ICON','IDEA','IDLE',
  'INCH','INTO','IRON','ISLE','ITEM','JACK','JADE','JAIL','JAZZ','JEAN',
  'JERK','JEST','JOKE','JUMP','JUNE','JURY','JUST','KEEN','KEEP','KEPT',
  'KICK','KIDS','KILL','KIND','KING','KISS','KITE','KNEE','KNEW','KNIT',
  'KNOB','KNOT','KNOW','LACE','LACK','LAID','LAKE','LAMB','LAME','LAMP',
  'LAND','LANE','LAST','LATE','LAWN','LEAD','LEAF','LEAK','LEAN','LEAP',
  'LEFT','LEND','LENS','LESS','LIED','LIES','LIFE','LIFT','LIKE','LIMB',
  'LIME','LIMP','LINE','LINK','LION','LIST','LIVE','LOAD','LOAN','LOCK',
  'LOFT','LOGO','LONE','LONG','LOOK','LORD','LOSE','LOSS','LOST','LOTS',
  'LOUD','LOVE','LUCK','LURE','LURK','LUSH','MADE','MAID','MAIL','MAIN',
  'MAKE','MALE','MALL','MALT','MANE','MANY','MARE','MARK','MASK','MASS',
  'MAST','MATE','MAZE','MEAL','MEAN','MEAT','MEET','MELT','MEMO','MENU',
  'MERE','MESA','MESH','MESS','MILD','MILE','MILK','MILL','MIME','MIND',
  'MINE','MINT','MISS','MIST','MOAT','MOCK','MODE','MOLD','MOLE','MOOD',
  'MOON','MORE','MOSS','MOST','MOTH','MOVE','MUCH','MULE','MUSE','MUST',
  'MYTH','NAIL','NAME','NAVE','NAVY','NEAR','NEAT','NECK','NEED','NEST',
  'NEWS','NEXT','NICE','NINE','NODE','NONE','NOON','NORM','NOSE','NOTE',
  'NOUN','ODDS','OKAY','ONCE','ONLY','ONTO','OPEN','OPTS','ORAL','ORCA',
  'OVEN','OVER','PACE','PACK','PAGE','PAID','PAIL','PAIN','PAIR','PALE',
  'PALM','PANE','PARA','PARK','PART','PASS','PAST','PATH','PEAK','PEAR',
  'PEEL','PEER','PEST','PICK','PIER','PILE','PINE','PINK','PIPE','PLAN',
  'PLAY','PLEA','PLOT','PLUG','PLUM','PLUS','POEM','POET','POLE','POLL',
  'POND','PONY','POOL','POOR','POPE','PORK','PORT','POSE','POST','POUR',
  'PRAY','PREY','PROD','PROP','PULL','PULP','PUMP','PUNK','PURE','PUSH',
  'QUIT','QUIZ','RACE','RACK','RAFT','RAGE','RAID','RAIL','RAIN','RAMP',
  'RANG','RANK','RARE','RATE','READ','REAL','REAR','REED','REEF','REIN',
  'RELY','RENT','REST','RICE','RICH','RIDE','RIFT','RIGS','RING','RIOT',
  'RISE','RISK','ROAD','ROAM','ROBE','ROCK','RODE','ROLE','ROLL','ROOF',
  'ROOM','ROOT','ROPE','ROSE','RUIN','RULE','RUNG','RUSH','RUST','RUTH',
  'SACK','SAFE','SAGE','SAID','SAIL','SAKE','SALE','SALT','SAME','SAND',
  'SANG','SANK','SAVE','SEAL','SEAM','SEAT','SEED','SEEK','SEEM','SEEN',
  'SELF','SELL','SEND','SENT','SEPT','SHAM','SHED','SHIN','SHIP','SHOP',
  'SHOT','SHOW','SHUT','SICK','SIDE','SIGH','SIGN','SILK','SINK','SITE',
  'SIZE','SLAM','SLAP','SLEW','SLID','SLIM','SLIP','SLOT','SLOW','SLUG',
  'SNAP','SNOW','SOAK','SOAP','SOAR','SOCK','SOFT','SOIL','SOLD','SOLE',
  'SOME','SONG','SOON','SORT','SOUL','SOUR','SPAN','SPAR','SPEC','SPED',
  'SPIN','SPIT','SPOT','STAR','STAY','STEM','STEP','STEW','STIR','STOP',
  'STUB','SUIT','SUNG','SUNK','SURE','SURF','SWAN','SWAP','SWIM','TABS',
  'TACK','TAIL','TAKE','TALE','TALK','TALL','TAME','TANK','TAPE','TASK',
  'TAXI','TEAL','TEAM','TEAR','TEEN','TELL','TEND','TENS','TENT','TERM',
  'TEST','TEXT','THAN','THAT','THEM','THEN','THEY','THIN','THIS','THUS',
  'TICK','TIDE','TIDY','TIED','TIER','TILE','TILL','TILT','TIME','TINY',
  'TIRE','TOAD','TOES','TOIL','TOLD','TOLL','TOMB','TONE','TOOK','TOOL',
  'TOPS','TORE','TORN','TOSS','TOUR','TOWN','TRAP','TRAY','TREE','TREK',
  'TRIM','TRIO','TRIP','TRUE','TUBE','TUCK','TUNA','TUNE','TURN','TURF',
  'TWIN','TYPE','UNIT','UPON','URGE','USED','USER','VAIN','VALE','VANE',
  'VARY','VAST','VEIL','VEIN','VENT','VERB','VERY','VEST','VETO','VIEW',
  'VINE','VISA','VOID','VOLT','VOTE','WADE','WAGE','WAIL','WAIT','WAKE',
  'WALK','WALL','WAND','WANT','WARD','WARM','WARN','WARP','WASH','WAVE',
  'WAVY','WEAK','WEAR','WEED','WEEK','WEEP','WELL','WENT','WERE','WEST',
  'WHAT','WHEN','WHOM','WIDE','WIFE','WILD','WILL','WILT','WILY','WIND',
  'WINE','WING','WINK','WIPE','WIRE','WISE','WISH','WITH','WOKE','WOLF',
  'WOOD','WOOL','WORD','WORE','WORK','WORM','WORN','WRAP','WREN','YARD',
  'YARN','YEAR','YELL','YOUR','ZEAL','ZERO','ZONE','ZOOM',
];

const FALLBACK_WORDS: FallbackWord[] = COMMON_WORDS.map(w => ({ word: w, score: 50 }));

function localQueryWords(pattern: string, limit: number): WordMatch[] {
  const upper = pattern.toUpperCase();
  const len = upper.length;

  return FALLBACK_WORDS
    .filter(w => {
      if (w.word.length !== len) return false;
      for (let i = 0; i < len; i++) {
        const p = upper[i];
        if (p === '_' || p === '.' || p === '?') continue;
        if (w.word[i] !== p) return false;
      }
      return true;
    })
    .slice(0, limit)
    .map((w, i) => ({ word: w.word, score: w.score, frequency_rank: i }));
}
