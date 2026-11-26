import { uniqueNameMatch } from './catalogueMatch';

it('accepts a unique normalized name and rejects namesakes and loose hits', () => {
  const read = (item: { name: string }) => item.name;
  const band = { name: 'Nirvana' };
  expect(uniqueNameMatch([band, { name: 'Nirvana Tribute' }], ' nirvana ', read)).toBe(band);
  expect(uniqueNameMatch([band, { name: 'Nirvana' }], 'Nirvana', read)).toBeNull();
  expect(uniqueNameMatch([{ name: 'Nirvana Tribute' }], 'Nirvana', read)).toBeNull();
});
