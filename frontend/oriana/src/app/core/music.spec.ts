import { youtubeId } from './music';

describe('youtubeId', () => {
  it('reads the id from the links people actually paste', () => {
    expect(
      youtubeId('https://www.youtube.com/watch?v=YcEUd8mKYH8&list=RDYcEUd8mKYH8&start_radio=1'),
    ).toBe('YcEUd8mKYH8');
    expect(youtubeId('https://youtu.be/YcEUd8mKYH8?si=abc')).toBe('YcEUd8mKYH8');
    expect(youtubeId('https://www.youtube.com/embed/YcEUd8mKYH8')).toBe('YcEUd8mKYH8');
    expect(youtubeId('YcEUd8mKYH8')).toBe('YcEUd8mKYH8');
  });

  it('rejects anything that is not a video', () => {
    expect(youtubeId('https://www.youtube.com/@someone')).toBeNull();
    expect(youtubeId('not a link')).toBeNull();
  });
});
