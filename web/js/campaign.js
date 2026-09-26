// Sequence is taken from the original bb.lst, including both bonus stages.
export const CAMPAIGN = [
  { name: 'Smurf village', subtitle: 'Forest, village & confrontation', parts: [1,3], files: ['snuf1','snuf2'] },
  { name: 'The Dorks', subtitle: 'Bonus stage', parts: [5], files: ['dork'] },
  { name: 'Care Bears', subtitle: 'Three stages above the clouds', parts: [7,9,10], files: ['bisous1','bisous2','bisous3'] },
  { name: 'Snork territory', subtitle: 'Two stages under the sea', parts: [12,13], files: ['snorkniv','snorkniv2'] },
  { name: 'Lemmings', subtitle: 'Bonus stage', parts: [15], files: ['lem'] },
  { name: 'Video game land', subtitle: 'Old icons. New enemies.', parts: [17,19], files: ['video','videoboss'] },
  { name: 'The final fight', subtitle: 'One last showdown', parts: [21], files: ['finalboss'] },
];
export const partName = part => CAMPAIGN.find(s=>s.parts.includes(part))?.name ?? 'Campaign';
