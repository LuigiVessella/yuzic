import { uniqueCatalogEntries, withoutCollaborationCredits } from './catalogEntries';

it('keeps ambiguous credits and real groups while filtering identifiable collaborations', () => {
  const names = ['Guè', 'Shiva', 'Guè feat. Shiva', 'Guè; Shiva', 'A & B', 'A, B',
    'Guest ft. Shiva', 'Guest', 'Guest', 'Guè; Missing'];
  const records = names.map((name, i) => ({ name, nativeId: String(i) }));
  const all = uniqueCatalogEntries([...records, records[0]]);
  expect(all).toEqual(records);
  expect(withoutCollaborationCredits(all).map(row => row.name)).toEqual([
    'Guè', 'Shiva', 'A & B', 'A, B', 'Guest ft. Shiva', 'Guest', 'Guest', 'Guè; Missing',
  ]);
});
