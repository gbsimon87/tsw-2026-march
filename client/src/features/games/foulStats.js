// FOUL is retained for existing events and represents a personal foul.
export const FOUL_TYPES = [
  { type: 'FOUL', label: 'Personal foul' },
  { type: 'TECHNICAL_FOUL', label: 'Technical foul' },
  { type: 'FLAGRANT_FOUL', label: 'Flagrant foul' },
];
export const isFoulStat = (type) => FOUL_TYPES.some((foul) => foul.type === type);
export const FOUL_STAT_FIELDS = [
  { id: 'personalFoul', label: 'Personal fouls' },
  { id: 'technicalFoul', label: 'Technical fouls' },
  { id: 'flagrantFoul', label: 'Flagrant fouls' },
  { id: 'foulDrawn', label: 'Fouls drawn' },
];
export const FOUL_STAT_COLUMNS = FOUL_STAT_FIELDS.map(({ id, label }) => ({
  id,
  label,
  align: 'right',
  sortKey: id,
  render: (row) => row[id] || 0,
}));
