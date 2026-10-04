import type { Lang } from './story';

// Everything around the stories is kept short and soft: the words that
// matter are in the stories themselves.

export interface Labels {
  volume: string;
  stories: string;
  chapter: string;
  contents: string;
  library: string;
  exLibris: string;
  belongsTo: string;
  by: string;
  writtenFor: string;
  firstEdition: string;
  titlePage: string;
  fromBeginning: string;
  finis: string;
  thanks: string;
  closeBook: string;
  close: string;
  musicPlay: string;
  musicPause: string;
  openHint: string;
  turnHint: string;
  preparing: string;
  previousPage: string;
  nextPage: string;
  beginReading: string;
  continueReading: string;
  readAgain: string;
  finished: string;
  justForYou: string;
  theShelf: string;
  yourStories: string;
  openMe: string;
  openTheSeal: string;
  madeWithCare: string;
  chapters: (count: number) => string;
  minutes: (count: number) => string;
  pageOf: (page: number, total: number) => string;
}

const EN: Labels = {
  volume: 'Volume',
  stories: 'Stories',
  chapter: 'Chapter',
  contents: 'Contents',
  library: 'Library',
  exLibris: 'Ex Libris',
  belongsTo: 'Belongs to',
  by: 'by',
  writtenFor: 'For',
  firstEdition: 'First edition',
  titlePage: 'Title page',
  fromBeginning: 'From the start',
  finis: 'Finis',
  thanks: 'Thanks for reading ♡',
  closeBook: 'Close the book',
  close: 'Close',
  musicPlay: 'Play music',
  musicPause: 'Pause music',
  openHint: 'Tap to open',
  turnHint: '← → or swipe',
  preparing: 'Just a moment…',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  beginReading: 'Read',
  continueReading: 'Continue',
  readAgain: 'Read again',
  finished: 'Finished',
  justForYou: 'Just for you',
  theShelf: 'The shelf',
  yourStories: 'Our Stories',
  openMe: 'Open me',
  openTheSeal: 'Open the seal',
  madeWithCare: 'Made with care',
  chapters: (n) => (n === 1 ? '1 chapter' : `${n} chapters`),
  minutes: (n) => `${n} min`,
  pageOf: (page, total) => `Page ${page} of ${total}`,
};

const VI: Labels = {
  volume: 'Tập',
  stories: 'Truyện',
  chapter: 'Chương',
  contents: 'Mục lục',
  library: 'Thư viện',
  exLibris: 'Ex Libris',
  belongsTo: 'Của',
  by: 'của',
  writtenFor: 'Tặng',
  firstEdition: 'Ấn bản đầu',
  titlePage: 'Trang tựa',
  fromBeginning: 'Từ đầu',
  finis: 'Hết',
  thanks: 'Cảm ơn đã đọc ♡',
  closeBook: 'Gấp sách',
  close: 'Đóng',
  musicPlay: 'Bật nhạc',
  musicPause: 'Tắt nhạc',
  openHint: 'Chạm để mở',
  turnHint: '← → hoặc vuốt',
  preparing: 'Chờ chút nhé…',
  previousPage: 'Trang trước',
  nextPage: 'Trang sau',
  beginReading: 'Đọc',
  continueReading: 'Đọc tiếp',
  readAgain: 'Đọc lại',
  finished: 'Đã đọc',
  justForYou: 'Dành cho bạn',
  theShelf: 'Kệ sách',
  yourStories: 'Truyện của bạn',
  openMe: 'Mở ra nhé',
  openTheSeal: 'Mở dấu niêm phong',
  madeWithCare: 'Gửi bạn',
  chapters: (n) => `${n} chương`,
  minutes: (n) => `${n} phút`,
  pageOf: (page, total) => `Trang ${page} / ${total}`,
};

const LABELS: Record<Lang, Labels> = { en: EN, vi: VI };

export const labelsFor = (lang: Lang): Labels => LABELS[lang] ?? EN;
