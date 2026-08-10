const { toCsv, toCsvSection, joinSections } = require('../../utils/csv');

describe('csv util', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'pts', header: 'PTS' },
  ];

  test('toCsv emits a header line then one line per row, CRLF-joined', () => {
    const csv = toCsv([{ name: 'Alice', pts: 10 }], columns);
    expect(csv).toBe('Name,PTS\r\nAlice,10');
  });

  test('header defaults to key when no header provided', () => {
    const csv = toCsv([{ a: 1 }], [{ key: 'a' }]);
    expect(csv).toBe('a\r\n1');
  });

  test('quotes fields containing comma, quote, or newline and doubles quotes', () => {
    const csv = toCsv([{ name: 'Last, First', pts: 'says "hi"' }], columns);
    expect(csv).toBe('Name,PTS\r\n"Last, First","says ""hi"""');
  });

  test('null and undefined become empty cells', () => {
    const csv = toCsv([{ name: null, pts: undefined }], columns);
    expect(csv).toBe('Name,PTS\r\n,');
  });

  test('toCsvSection prefixes a title and a blank line', () => {
    const section = toCsvSection('Standings', [{ name: 'Alice', pts: 10 }], columns);
    expect(section).toBe('Standings\r\n\r\nName,PTS\r\nAlice,10');
  });

  test('joinSections separates sections with a blank line and drops falsy ones', () => {
    const joined = joinSections(['A\r\n1', false, 'B\r\n2']);
    expect(joined).toBe('A\r\n1\r\n\r\nB\r\n2');
  });
});
