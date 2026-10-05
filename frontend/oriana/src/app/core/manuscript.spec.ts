import { parseManuscript, smarten } from './manuscript';

describe('parseManuscript', () => {
  it('splits chapters on top-level headings and numbers them', () => {
    const { chapters } = parseManuscript('# Prologue {-}\n\nOnce.\n\n# The Reading Room\n\nTwice.');
    expect(chapters.map((c) => [c.title, c.numbered])).toEqual([
      ['Prologue', false],
      ['The Reading Room', true],
    ]);
  });

  it('keeps every line break as written', () => {
    const [chapter] = parseManuscript(
      '# One\n\nBut then I saw hers. \nMy name?\\\nTwice.',
    ).chapters;
    expect(chapter.html).toContain('But then I saw hers.<br>My name?<br>Twice.');
  });

  it('deepens the pause for every extra blank line', () => {
    const [chapter] = parseManuscript('# One\n\nJust her.\n\nAnd me.\n\n\n\nAlone.').chapters;
    expect(chapter.html).toBe(
      '<p>Just her.</p>\n<p>And me.</p>\n<p style="--blank-lines: 3">Alone.</p>',
    );
  });

  it('keeps every line break inside letters', () => {
    const [chapter] = parseManuscript('# One\n\n> Dear you,\n> still here.\n>\n> Yours.').chapters;
    expect(chapter.html).toBe(
      '<blockquote><p>Dear you,<br>still here.</p><p>Yours.</p></blockquote>',
    );
  });

  it('marks scene breaks, emphasis and plates', () => {
    const [chapter] = parseManuscript(
      '# One\n\n*Soft* and **loud**.\n\n* * *\n\n![A window](plates/w.svg)',
    ).chapters;
    expect(chapter.html).toContain('<em>Soft</em> and <strong>loud</strong>.');
    expect(chapter.html).toContain('<hr class="scene-break">');
    expect(chapter.html).toContain('<img src="plates/w.svg" alt="A window"');
  });

  it('escapes markup so a manuscript cannot inject HTML', () => {
    const [chapter] = parseManuscript('# One\n\n<script>alert(1)</script>').chapters;
    expect(chapter.html).not.toContain('<script>');
    expect(chapter.html).toContain('&lt;script&gt;');
  });

  it('refuses plates with unsafe sources', () => {
    const [chapter] = parseManuscript('# One\n\n![x](javascript:alert(1))').chapters;
    expect(chapter.html).not.toContain('<img');
  });

  it('counts words across chapters, Vietnamese included', () => {
    const { words } = parseManuscript('# Một\n\nNgọn đèn bên cửa sổ.\n\n# Hai\n\nHết.');
    expect(words).toBe(6);
  });
});

describe('smarten', () => {
  it('curls quotes and sets dashes and ellipses', () => {
    expect(smarten(`"It's late," she said -- and waited...`)).toBe(
      '“It’s late,” she said — and waited…',
    );
  });
});
