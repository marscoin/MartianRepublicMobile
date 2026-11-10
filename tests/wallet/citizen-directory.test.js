import { uniqueCitizens } from '../../blue_modules/citizen-directory';
it('shows each citizen once when the feed includes multiple status records', () => {
  const newest = { address: 'public-a', tag: 'CT' };
  const other = { address: 'public-b', tag: 'GP' };
  expect(uniqueCitizens([newest, other, { address: 'public-a', tag: 'GP' }])).toEqual([newest, other]);
});
