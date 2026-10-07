import { youtubeId, youtubeIds } from './music';

describe('youtubeId', () => {
  it('reads the id from the links people actually paste', () => {
    expect(
      youtubeId('https://www.youtube.com/watch?v=YcEUd8mKYH8&list=RDYcEUd8mKYH8&start_radio=1'),
    ).toBe('YcEUd8mKYH8');
    expect(youtubeId('https://youtu.be/YcEUd8mKYH8?si=abc')).toBe('YcEUd8mKYH8');
    expect(youtubeId('https://www.youtube.com/embed/YcEUd8mKYH8')).toBe('YcEUd8mKYH8');
    expect(youtubeId('YcEUd8mKYH8')).toBe('YcEUd8mKYH8');
  });

  it('reads several links in order, skipping any that are not videos', () => {
    expect(
      youtubeIds([
        'https://www.youtube.com/watch?v=oFFFL9EMpBM&list=PLqmQfBdlieG6Voy_53q1FGwfqkqU0D0SU&index=4',
        'not a link',
        'https://www.youtube.com/watch?v=aarD1Qc6nG8&list=PLqmQfBdlieG6Voy_53q1FGwfqkqU0D0SU&index=5',
      ]),
    ).toEqual(['oFFFL9EMpBM', 'aarD1Qc6nG8']);
    expect(youtubeIds('https://youtu.be/YcEUd8mKYH8')).toEqual(['YcEUd8mKYH8']);
    expect(youtubeIds(undefined)).toEqual([]);
  });

  it('rejects anything that is not a video', () => {
    expect(youtubeId('https://www.youtube.com/@someone')).toBeNull();
    expect(youtubeId('not a link')).toBeNull();
  });
});
