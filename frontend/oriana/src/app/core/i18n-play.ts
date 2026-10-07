import type { Lang } from './story';

// The words around the treasure hunt and the reasons beyond the window. Short
// and soft, like the rest of the house; what each keepsake and reason says
// lives in src/stories.

export interface PlayLabels {
  // The locket
  locket: string;
  keepsakes: string;
  keepsakeFound: string;
  everyKeepsake: string;
  openLocket: string;
  foundOf: (found: number, total: number) => string;
  firstFind: (left: number) => string;
  places: Record<'library' | 'books' | 'reasons' | 'secrets' | 'last', string>;
  notYetFound: string;
  foundOn: (date: string) => string;
  revealHint: string;
  strongerHint: string;
  allHints: string;
  lastLocked: (left: number) => string;
  readLetter: string;
  tabs: Record<'treasures' | 'journal' | 'settings', string>;
  whisper: string;
  whisperPlaceholder: string;
  whisperButton: string;
  whisperNothing: string;
  whisperAgain: string;
  whisperFound: string;

  // The journal
  since: (date: string) => string;
  daysSince: (days: number) => string;
  visits: string;
  days: string;
  pagesTurned: string;
  storiesFinished: string;
  reasonsRead: string;
  hintsUsed: string;

  // Settings
  sounds: string;
  sparkles: string;
  candlelight: string;
  textSize: string;
  smaller: string;
  larger: string;
  reset: string;
  resetConfirm: string;
  resetDone: string;

  // The reader
  readingSettings: string;
  keys: string;
  keyTurn: string;
  keyText: string;
  keyEnds: string;

  // Beyond the window
  reasons: string;
  throughWindow: string;
  openWindow: string;
  backToLibrary: string;
  reasonNumber: (n: number) => string;
  readOf: (read: number, total: number) => string;
  nextReason: string;
  travelTo: string;
  arriving: string;
  allReadHere: string;
  asList: string;
  asView: string;
  writtenDown: string;
  dragToLook: string;

  /** Above her name in the library, by the hour of her visit. */
  greeting: (hour: number) => string;

  // The library cat
  catGreeting: string;
  catHint: (hint: string) => string;
  catAllFound: string;
  catPurrs: string;
  catLabel: (name: string) => string;
  /** Little yellow lines that bounce beside the title, one picked each visit. */
  splashes: readonly string[];
  /** The corner of the title screen. */
  fromWithLove: (name: string) => string;

  // Things in the reading room
  switchOff: string;
  switchOn: string;
  dipQuill: string;
  leafThrough: string;
}

const EN: PlayLabels = {
  locket: 'The Locket',
  keepsakes: 'Keepsakes',
  keepsakeFound: 'Keepsake found',
  everyKeepsake: 'Every keepsake found',
  openLocket: 'Open the locket',
  foundOf: (found, total) => `${found} of ${total} found`,
  firstFind: (left) => `It’s in the locket now. ${left} more are hidden around the house…`,
  places: {
    library: 'In the library',
    books: 'Between the pages',
    reasons: 'Beyond the window',
    secrets: 'Secrets',
    last: 'At the very end',
  },
  notYetFound: 'Not found yet',
  foundOn: (date) => `Found ${date}`,
  revealHint: 'Reveal a hint',
  strongerHint: 'A stronger hint',
  allHints: 'That’s every hint ♡',
  lastLocked: (left) =>
    left === 1
      ? 'One more keepsake, and this opens.'
      : `Find ${left} more keepsakes to open this one.`,
  readLetter: 'Read the letter',
  tabs: { treasures: 'Keepsakes', journal: 'Journal', settings: 'Settings' },
  whisper: 'Whisper a word',
  whisperPlaceholder: 'Something from the stories…',
  whisperButton: 'Whisper',
  whisperNothing: 'Nothing happens… but the library is listening.',
  whisperAgain: 'You found that one already ♡',
  whisperFound: 'Something stirs!',

  since: (date) => `Our library since ${date}`,
  daysSince: (days) => (days === 1 ? 'One day since we met' : `${days} days since we met`),
  visits: 'Visits',
  days: 'Days visited',
  pagesTurned: 'Pages turned',
  storiesFinished: 'Stories finished',
  reasonsRead: 'Reasons read',
  hintsUsed: 'Hints used',

  sounds: 'Little sounds',
  sparkles: 'Sparkles on touch',
  candlelight: 'Candlelight pages',
  textSize: 'Text size',
  smaller: 'Smaller text',
  larger: 'Larger text',
  reset: 'Start the hunt again',
  resetConfirm: 'Tap again to forget every keepsake',
  resetDone: 'All forgotten. Happy hunting!',

  readingSettings: 'Reading settings',
  keys: 'Keys',
  keyTurn: 'Turn the page',
  keyText: 'Text size',
  keyEnds: 'First & last page',

  reasons: 'Reasons I Love You',
  throughWindow: 'Through the window',
  openWindow: 'Open the window',
  backToLibrary: 'Back to the library',
  reasonNumber: (n) => `Reason no. ${n}`,
  readOf: (read, total) => `${read} of ${total} read`,
  nextReason: 'Next reason',
  travelTo: 'Travel to',
  arriving: 'Opening the window…',
  allReadHere: 'Every reason here, read ♡',
  asList: 'Read them as a list',
  asView: 'Back to the view',
  writtenDown: 'Here they are, written down for you.',
  dragToLook: 'Drag to look around',

  greeting: (hour) =>
    hour < 4
      ? 'Still awake?'
      : hour < 12
        ? 'Good morning honeyy :>'
        : hour < 18
          ? 'Good afternoon mwhawmwha :>>'
          : 'Good evening, i lovee you soo muchh :>>',

  catGreeting: 'Psst… things are hidden all over this house. Tap me for a hint!',
  catHint: (hint) => hint,
  catAllFound: 'You found everything! Mrrp ♡',
  catPurrs: '*purrs*',
  catLabel: (name) => `${name}, the library cat`,
  splashes: [
    'Made with love!',
    'Just for you!',
    'Also try: hugs!',
    'Now with cherry trees!',
    'Hearts x1000!',
    '100% cozy!',
    'Mwah!',
    'Best read together!',
    'Our story so far!',
    'You again! Hi! <3',
  ],
  fromWithLove: (name) => `For Oriana, with love from ${name}`,

  switchOff: 'Switch off',
  switchOn: 'Switch on',
  dipQuill: 'Dip the quill',
  leafThrough: 'Leaf through',
};

const VI: PlayLabels = {
  locket: 'Mặt dây chuyền',
  keepsakes: 'Kỷ vật',
  keepsakeFound: 'Tìm thấy kỷ vật',
  everyKeepsake: 'Đã tìm đủ mọi kỷ vật',
  openLocket: 'Mở mặt dây chuyền',
  foundOf: (found, total) => `Đã tìm ${found} / ${total}`,
  firstFind: (left) => `Đã cất vào mặt dây chuyền rồi. Còn ${left} món nữa giấu quanh nhà…`,
  places: {
    library: 'Trong thư viện',
    books: 'Giữa những trang sách',
    reasons: 'Bên kia khung cửa',
    secrets: 'Bí mật',
    last: 'Ở cuối cùng',
  },
  notYetFound: 'Chưa tìm thấy',
  foundOn: (date) => `Tìm thấy ${date}`,
  revealHint: 'Xem gợi ý',
  strongerHint: 'Gợi ý rõ hơn',
  allHints: 'Hết gợi ý rồi ♡',
  lastLocked: (left) =>
    left === 1 ? 'Thêm một kỷ vật nữa là mở được.' : `Tìm thêm ${left} kỷ vật để mở món này.`,
  readLetter: 'Đọc lá thư',
  tabs: { treasures: 'Kỷ vật', journal: 'Nhật ký', settings: 'Cài đặt' },
  whisper: 'Thì thầm một chữ',
  whisperPlaceholder: 'Một chữ trong truyện…',
  whisperButton: 'Thì thầm',
  whisperNothing: 'Chưa có gì xảy ra… nhưng thư viện đang lắng nghe.',
  whisperAgain: 'Món này bạn tìm rồi ♡',
  whisperFound: 'Có gì đó vừa động đậy!',

  since: (date) => `Thư viện của mình từ ${date}`,
  daysSince: (days) => `${days} ngày kể từ khi tụi mình quen nhau`,
  visits: 'Lượt ghé',
  days: 'Số ngày ghé',
  pagesTurned: 'Trang đã lật',
  storiesFinished: 'Truyện đã đọc xong',
  reasonsRead: 'Lý do đã đọc',
  hintsUsed: 'Gợi ý đã dùng',

  sounds: 'Âm thanh nhỏ',
  sparkles: 'Lấp lánh khi chạm',
  candlelight: 'Trang sách ánh nến',
  textSize: 'Cỡ chữ',
  smaller: 'Chữ nhỏ hơn',
  larger: 'Chữ lớn hơn',
  reset: 'Tìm lại từ đầu',
  resetConfirm: 'Chạm lần nữa để quên hết kỷ vật',
  resetDone: 'Đã quên hết. Chúc tìm vui!',

  readingSettings: 'Cài đặt đọc',
  keys: 'Phím',
  keyTurn: 'Lật trang',
  keyText: 'Cỡ chữ',
  keyEnds: 'Trang đầu & cuối',

  reasons: 'Những Lý Do Anh Yêu Em',
  throughWindow: 'Qua khung cửa sổ',
  openWindow: 'Mở cửa sổ',
  backToLibrary: 'Về thư viện',
  reasonNumber: (n) => `Lý do thứ ${n}`,
  readOf: (read, total) => `Đã đọc ${read} / ${total}`,
  nextReason: 'Lý do tiếp theo',
  travelTo: 'Đi đến',
  arriving: 'Đang mở cửa sổ…',
  allReadHere: 'Đã đọc hết mọi lý do ở đây ♡',
  asList: 'Xem dạng danh sách',
  asView: 'Quay lại khung cảnh',
  writtenDown: 'Tất cả đây, viết ra cho em.',
  dragToLook: 'Kéo để nhìn quanh',

  greeting: (hour) =>
    hour < 4
      ? 'Vẫn còn thức à?'
      : hour < 12
        ? 'Chào buổi sáng'
        : hour < 18
          ? 'Chào buổi chiều'
          : 'Chào buổi tối',

  catGreeting: 'Suỵt… có nhiều thứ giấu khắp nhà đấy. Chạm vào mình để được gợi ý!',
  catHint: (hint) => hint,
  catAllFound: 'Bạn tìm được hết rồi! Meo ♡',
  catPurrs: '*rừ rừ*',
  catLabel: (name) => `${name}, mèo của thư viện`,
  splashes: [
    'Làm bằng cả trái tim!',
    'Chỉ dành cho em!',
    'Thêm một cái ôm nhé!',
    'Có cả hoa anh đào!',
    'Một nghìn trái tim!',
    'Ấm áp 100%!',
    'Moa!',
  ],
  fromWithLove: (name) => `Tặng Oriana, thương yêu, ${name}`,

  switchOff: 'Tắt đèn',
  switchOn: 'Bật đèn',
  dipQuill: 'Chấm mực',
  leafThrough: 'Lật xem',
};

const LABELS: Record<Lang, PlayLabels> = { en: EN, vi: VI };

export const playLabelsFor = (lang: Lang): PlayLabels => LABELS[lang] ?? EN;
