import { nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'
import { createWriteStream, existsSync, readFileSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import type { EmotionTag, ImageTags } from '@shared/types'
import { modelCacheDir } from '../paths'
import { detectFaces } from './face'

// Anime expression/emotion read via the WaifuDiffusion v1.4 tagger (SmilingWolf,
// moat-v2, ONNX). Danbooru-trained → handles NSFW locally, no upload. The model
// is ~310MB so it is NOT bundled: it's downloaded to the model cache on first use.
const MODEL_URL = 'https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger-v2/resolve/main/model.onnx'
const TAGS_URL = 'https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger-v2/resolve/main/selected_tags.csv'
const SIZE = 448 // model input is 448×448, NHWC, BGR, 0-255 (no normalization)
const THRESHOLD = 0.15 // low, so subtle states (e.g. a faint frown) still surface
const TOP_N = 12

// Curated Danbooru tags → Japanese label. Includes fine MOUTH / BROW / EYE states
// (not just emotions), since "mouth open" and "slightly angry (v-brows)" matter
// most. Tags not present in the model are simply never matched.
const EMO: Record<string, string> = {
  // mouth
  open_mouth: '口開け',
  closed_mouth: '口閉じ',
  parted_lips: '唇わずか開',
  ':d': '満面の笑み(口開)',
  ':o': '口あんぐり',
  ':3': 'にこ口',
  teeth: '歯見え',
  clenched_teeth: '歯食いしばり',
  fang: '牙',
  wavy_mouth: 'への字口',
  tongue_out: '舌出し',
  drooling: 'よだれ',
  saliva: '唾液',
  // brows (anger / tension cues)
  'v-shaped_eyebrows': 'への字眉(怒)',
  frown: 'しかめ面',
  light_frown: '軽くしかめ',
  furrowed_brow: '眉間にしわ',
  raised_eyebrows: '眉上げ',
  anger_vein: '怒りマーク',
  scowl: '険しい顔',
  angry: '怒り',
  annoyed: '苛立ち',
  pout: 'むくれ',
  // eyes
  closed_eyes: '目閉じ',
  'half-closed_eyes': 'とろん目',
  narrowed_eyes: '細目',
  one_eye_closed: 'ウインク',
  wink: 'ウインク',
  bedroom_eyes: '流し目',
  // smiles / positive
  smile: '笑顔',
  light_smile: '微笑',
  grin: 'にやり',
  laughing: '大笑い',
  happy: '嬉しい',
  smirk: 'にやけ',
  evil_smile: '悪い笑み',
  seductive_smile: '妖艶な笑み',
  // shy / nervous
  blush: '赤面',
  nose_blush: '鼻赤面',
  embarrassed: '照れ',
  nervous: '緊張',
  flying_sweatdrops: '焦り',
  nervous_sweating: '冷や汗',
  sweat: '汗',
  // sad
  crying: '泣き',
  tears: '涙',
  crying_with_eyes_open: '泣き(目開)',
  streaming_tears: '号泣',
  tearing_up: '涙ぐむ',
  sad: '悲しい',
  // surprise / fear
  surprised: '驚き',
  shocked: '衝撃',
  scared: '怯え',
  fear: '恐怖',
  // lewd
  ahegao: 'アヘ顔',
  torogao: 'とろ顔',
  naughty_face: 'いたずら顔',
  heavy_breathing: '息荒い',
  // neutral
  serious: '真剣',
  expressionless: '無表情'
}

// Body pose tags (read from the WHOLE image, not the face crop).
const POSE: Record<string, string> = {
  standing: '立っている',
  sitting: '座っている',
  lying: '寝そべり',
  on_back: '仰向け',
  on_stomach: 'うつ伏せ',
  on_side: '横向き',
  all_fours: '四つん這い',
  kneeling: '膝立ち',
  squatting: 'しゃがみ',
  wariza: '女の子座り',
  bent_over: '前かがみ',
  leaning_forward: '前傾',
  arched_back: '背を反らす',
  spread_legs: '脚を開く',
  knees_up: '膝を立てる',
  legs_up: '脚を上げる',
  crossed_legs: '脚を組む',
  hand_on_hip: '腰に手',
  arms_up: '腕を上げる',
  crossed_arms: '腕組み',
  straddling: '跨る',
  'top-down_bottom-up': '尻上げ突っ伏せ',
  presenting: '差し出すポーズ',
  looking_back: '振り返り',
  looking_at_viewer: '視線こちら'
}

// Location / background tags (read from the WHOLE image).
const SCENE: Record<string, string> = {
  outdoors: '屋外',
  indoors: '屋内',
  city: '街中',
  cityscape: '街並み',
  street: '路上',
  alley: '路地',
  building: '建物',
  classroom: '教室',
  bedroom: '寝室',
  bathroom: '浴室/トイレ',
  kitchen: '台所',
  beach: 'ビーチ',
  ocean: '海',
  pool: 'プール',
  onsen: '温泉',
  forest: '森',
  park: '公園',
  rooftop: '屋上',
  train_interior: '電車内',
  car_interior: '車内',
  office: 'オフィス',
  sky: '空',
  night: '夜',
  day: '昼',
  sunset: '夕暮れ',
  snow: '雪',
  rain: '雨'
}

// Clothing / exposure / undressing-in-progress (whole image).
const CLOTHING: Record<string, string> = {
  completely_nude: '全裸',
  nude: '裸',
  topless: 'トップレス',
  bottomless: '下半身裸',
  breasts_out: '胸出し',
  nipples: '乳首露出',
  no_bra: 'ノーブラ',
  no_panties: 'ノーパン',
  undressing: '脱衣中',
  clothes_lift: '服まくり',
  shirt_lift: 'シャツまくり',
  skirt_lift: 'スカートまくり',
  clothes_pull: '服引っ張り',
  panty_pull: 'パンツずらし',
  bra_lift: 'ブラずらし',
  strap_slip: '肩紐ずれ',
  clothing_aside: 'ずらし',
  open_shirt: 'シャツはだけ',
  open_clothes: '服はだけ',
  unbuttoned: 'ボタン外し',
  untied: '紐ほどけ',
  school_uniform: '制服',
  serafuku: 'セーラー服',
  swimsuit: '水着',
  bikini: 'ビキニ',
  school_swimsuit: 'スク水',
  bra: 'ブラ',
  panties: 'パンツ',
  lingerie: '下着',
  kimono: '着物',
  maid: 'メイド服',
  nurse: 'ナース服',
  gym_uniform: '体操服',
  buruma: 'ブルマ',
  thighhighs: 'ニーソ',
  pantyhose: 'パンスト'
}

// Sexual act / position (whole image).
const ACT: Record<string, string> = {
  sex: 'セックス',
  vaginal: '挿入(膣)',
  anal: 'アナル',
  oral: 'オーラル',
  fellatio: 'フェラ',
  deepthroat: 'ディープスロート',
  irrumatio: 'イラマチオ',
  cunnilingus: 'クンニ',
  paizuri: 'パイズリ',
  handjob: '手コキ',
  fingering: '指マン',
  masturbation: 'オナニー',
  doggystyle: '後背位',
  cowgirl_position: '騎乗位',
  missionary: '正常位',
  girl_on_top: '女性上位',
  sex_from_behind: '後ろから',
  imminent_penetration: '挿入直前',
  after_sex: '事後',
  breast_grab: '胸揉み',
  ass_grab: '尻掴み',
  nipple_tweak: '乳首いじり',
  spread_pussy: '開帳',
  cum: '精液',
  cumshot: '射精',
  cum_in_pussy: '中出し',
  cum_on_body: '顔/体射'
}

// People count / relationships / contact (whole image).
const RELATION: Record<string, string> = {
  solo: '一人',
  multiple_girls: '複数の女性',
  '2girls': '女性2人',
  '3girls': '女性3人',
  '6+girls': '女性大勢',
  '1boy': '男性1人',
  '2boys': '男性2人',
  multiple_boys: '複数の男性',
  crowd: '群衆',
  people: '人々',
  hetero: '男女',
  yuri: '百合',
  hug: '抱擁',
  holding_hands: '手繋ぎ',
  interlocked_fingers: '指を絡める',
  kiss: 'キス',
  arm_around_shoulder: '肩を抱く',
  carrying: '抱えてる',
  princess_carry: 'お姫様抱っこ'
}

// Distinct background objects (whole image).
const BGOBJ: Record<string, string> = {
  mountain: '山',
  mountainous_horizon: '山並み',
  tree: '木',
  cherry_blossoms: '桜',
  flower: '花',
  water: '水',
  river: '川',
  lake: '湖',
  building: '建物',
  skyscraper: '高層ビル',
  bridge: '橋',
  road: '道',
  bed: 'ベッド',
  window: '窓',
  grass: '草'
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`モデルのダウンロードに失敗しました (${res.status})`)
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest))
}

interface TagIndex {
  index: number
  tag: string
  label: string
}
interface Ready {
  session: ort.InferenceSession
  emo: TagIndex[]
  clothing: TagIndex[]
  act: TagIndex[]
  pose: TagIndex[]
  relation: TagIndex[]
  scene: TagIndex[]
  bgobj: TagIndex[]
}
let readyPromise: Promise<Ready> | null = null

// Map each curated tag (category 0) to its model output index.
function buildIndices(csvPath: string): Omit<Ready, 'session'> {
  const rows = readFileSync(csvPath, 'utf8').split('\n')
  const idxByName = new Map<string, number>()
  // Row 0 is the header; data row i maps to model output index i.
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(',')
    if (cols.length >= 3 && cols[2] === '0') idxByName.set(cols[1], i - 1)
  }
  const pick = (m: Record<string, string>): TagIndex[] =>
    Object.entries(m).flatMap(([tag, label]) => {
      const index = idxByName.get(tag)
      return index === undefined ? [] : [{ index, tag, label }]
    })
  return {
    emo: pick(EMO),
    clothing: pick(CLOTHING),
    act: pick(ACT),
    pose: pick(POSE),
    relation: pick(RELATION),
    scene: pick(SCENE),
    bgobj: pick(BGOBJ)
  }
}

async function init(): Promise<Ready> {
  const model = join(modelCacheDir(), 'wd14-moat.onnx')
  const tags = join(modelCacheDir(), 'wd14-tags.csv')
  if (!existsSync(tags)) await download(TAGS_URL, tags)
  if (!existsSync(model)) await download(MODEL_URL, model)
  const session = await ort.InferenceSession.create(model)
  return { session, ...buildIndices(tags) }
}
function getReady(): Promise<Ready> {
  if (!readyPromise) readyPromise = init()
  return readyPromise
}

async function runTagger(session: ort.InferenceSession, img: Electron.NativeImage): Promise<Float32Array> {
  const input = new ort.Tensor('float32', preprocess(img), [1, SIZE, SIZE, 3])
  const result = await session.run({ [session.inputNames[0]]: input })
  return result[session.outputNames[0]].data as Float32Array
}

function extract(probs: Float32Array, indices: TagIndex[], threshold: number, topN: number): EmotionTag[] {
  return indices
    .map((e) => ({ tag: e.tag, label: e.label, score: probs[e.index] }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

// Pad to a white square, resize to 448, BGR NHWC float 0-255 (WD14 preprocessing).
function preprocess(img: Electron.NativeImage): Float32Array {
  const { width: ow, height: oh } = img.getSize()
  if (!ow || !oh) throw new Error('画像の読み込みに失敗しました')
  const scale = SIZE / Math.max(ow, oh)
  const nw = Math.max(1, Math.round(ow * scale))
  const nh = Math.max(1, Math.round(oh * scale))
  const bmp = img.resize({ width: nw, height: nh, quality: 'best' }).toBitmap() // BGRA
  const data = new Float32Array(SIZE * SIZE * 3).fill(255) // white background
  const ox = Math.floor((SIZE - nw) / 2)
  const oy = Math.floor((SIZE - nh) / 2)
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const s = (y * nw + x) * 4
      const d = ((oy + y) * SIZE + (ox + x)) * 3
      data[d] = bmp[s] // B
      data[d + 1] = bmp[s + 1] // G
      data[d + 2] = bmp[s + 2] // R
    }
  }
  return data
}

// Crop to the largest face (with padding for brows/chin) so the expression read
// isn't diluted by the body/scene. Falls back to the whole image if no face.
async function faceCrop(png: Buffer): Promise<Electron.NativeImage> {
  const full = nativeImage.createFromBuffer(png)
  const faces = await detectFaces(png).catch(() => [])
  if (!faces.length) return full
  const f = faces.reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a))
  const { width: W, height: H } = full.getSize()
  const padX = (f.x1 - f.x0) * 0.3
  const padY = (f.y1 - f.y0) * 0.4
  const x = Math.max(0, Math.round(f.x0 - padX))
  const y = Math.max(0, Math.round(f.y0 - padY))
  const w = Math.min(W, Math.round(f.x1 + padX)) - x
  const h = Math.min(H, Math.round(f.y1 + padY)) - y
  if (w < 8 || h < 8) return full
  return full.crop({ x, y, width: w, height: h })
}

// Full read: expression from the FACE crop (sharper), everything else from the
// WHOLE image (clothing/act/pose/relation/scene/background need the body & scene).
export async function detectImageTags(png: Buffer): Promise<ImageTags> {
  const r = await getReady()
  const faceProbs = await runTagger(r.session, await faceCrop(png))
  const fullProbs = await runTagger(r.session, nativeImage.createFromBuffer(png))
  return {
    emotion: extract(faceProbs, r.emo, THRESHOLD, TOP_N),
    clothing: extract(fullProbs, r.clothing, 0.3, 8),
    act: extract(fullProbs, r.act, 0.25, 6),
    pose: extract(fullProbs, r.pose, 0.3, 6),
    relation: extract(fullProbs, r.relation, 0.3, 5),
    scene: extract(fullProbs, r.scene, 0.3, 4),
    bgobj: extract(fullProbs, r.bgobj, 0.3, 5)
  }
}
