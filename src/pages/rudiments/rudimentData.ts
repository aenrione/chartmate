export interface Rudiment {
  id: number;
  name: string;
  category: 'rolls' | 'diddles' | 'flams' | 'drags';
  sticking: string;
  chartFile: string;
}

export const categoryLabels: Record<Rudiment['category'], string> = {
  rolls: 'Roll Rudiments',
  diddles: 'Diddle Rudiments',
  flams: 'Flam Rudiments',
  drags: 'Drag Rudiments',
};

export const categoryDescriptions: Record<Rudiment['category'], string> = {
  rolls: 'Single, double, and multiple bounce strokes',
  diddles: 'Paradiddles and variations',
  flams: 'Grace note patterns',
  drags: 'Drag and ruff patterns',
};

export const rudiments: Rudiment[] = [
  // Roll Rudiments (1-15)
  { id: 1, name: 'Single Stroke Roll', category: 'rolls', sticking: 'R L R L R L R L', chartFile: '01-single-stroke-roll.chart' },
  { id: 2, name: 'Single Stroke Four', category: 'rolls', sticking: 'R L R L · L R L R', chartFile: '02-single-stroke-four.chart' },
  { id: 3, name: 'Single Stroke Seven', category: 'rolls', sticking: 'R L R L R L R', chartFile: '03-single-stroke-seven.chart' },
  { id: 4, name: 'Multiple Bounce Roll', category: 'rolls', sticking: 'zz zz zz zz', chartFile: '04-multiple-bounce-roll.chart' },
  { id: 5, name: 'Triple Stroke Roll', category: 'rolls', sticking: 'R R R L L L', chartFile: '05-triple-stroke-roll.chart' },
  { id: 6, name: 'Double Stroke Open Roll', category: 'rolls', sticking: 'R R L L R R L L', chartFile: '06-double-stroke-open-roll.chart' },
  { id: 7, name: 'Five Stroke Roll', category: 'rolls', sticking: 'R R L L R', chartFile: '07-five-stroke-roll.chart' },
  { id: 8, name: 'Six Stroke Roll', category: 'rolls', sticking: 'R L R R L R', chartFile: '08-six-stroke-roll.chart' },
  { id: 9, name: 'Seven Stroke Roll', category: 'rolls', sticking: 'R R L L R R L', chartFile: '09-seven-stroke-roll.chart' },
  { id: 10, name: 'Nine Stroke Roll', category: 'rolls', sticking: 'R R L L R R L L R', chartFile: '10-nine-stroke-roll.chart' },
  { id: 11, name: 'Ten Stroke Roll', category: 'rolls', sticking: 'R R L L R R L L R L', chartFile: '11-ten-stroke-roll.chart' },
  { id: 12, name: 'Eleven Stroke Roll', category: 'rolls', sticking: 'R R L L R R L L R R L', chartFile: '12-eleven-stroke-roll.chart' },
  { id: 13, name: 'Thirteen Stroke Roll', category: 'rolls', sticking: 'R R L L R R L L R R L L R', chartFile: '13-thirteen-stroke-roll.chart' },
  { id: 14, name: 'Fifteen Stroke Roll', category: 'rolls', sticking: 'R R L L R R L L R R L L R R L', chartFile: '14-fifteen-stroke-roll.chart' },
  { id: 15, name: 'Seventeen Stroke Roll', category: 'rolls', sticking: 'R R L L R R L L R R L L R R L L R', chartFile: '15-seventeen-stroke-roll.chart' },

  // Diddle Rudiments (16-20)
  { id: 16, name: 'Single Paradiddle', category: 'diddles', sticking: 'R L R R · L R L L', chartFile: '16-single-paradiddle.chart' },
  { id: 17, name: 'Double Paradiddle', category: 'diddles', sticking: 'R L R L R R · L R L R L L', chartFile: '17-double-paradiddle.chart' },
  { id: 18, name: 'Triple Paradiddle', category: 'diddles', sticking: 'R L R L R L R R · L R L R L R L L', chartFile: '18-triple-paradiddle.chart' },
  { id: 19, name: 'Single Paradiddle-Diddle', category: 'diddles', sticking: 'R L R R L L', chartFile: '19-single-paradiddle-diddle.chart' },
  { id: 20, name: 'Double Paradiddle-Diddle', category: 'diddles', sticking: 'R L R L R R L L', chartFile: '20-double-paradiddle-diddle.chart' },

  // Flam Rudiments (21-30)
  { id: 21, name: 'Flam', category: 'flams', sticking: 'lR rL', chartFile: '21-flam.chart' },
  { id: 22, name: 'Flam Accent', category: 'flams', sticking: 'lR L R · rL R L', chartFile: '22-flam-accent.chart' },
  { id: 23, name: 'Flam Tap', category: 'flams', sticking: 'lR R rL L', chartFile: '23-flam-tap.chart' },
  { id: 24, name: 'Flamacue', category: 'flams', sticking: 'lR L R L lR', chartFile: '24-flamacue.chart' },
  { id: 25, name: 'Flam Paradiddle', category: 'flams', sticking: 'lR L R R rL R L L', chartFile: '25-flam-paradiddle.chart' },
  { id: 26, name: 'Single Flammed Mill', category: 'flams', sticking: 'lR R rL L', chartFile: '26-single-flammed-mill.chart' },
  { id: 27, name: 'Flam Paradiddle-Diddle', category: 'flams', sticking: 'lR L R R L L rL R L L R R', chartFile: '27-flam-paradiddle-diddle.chart' },
  { id: 28, name: 'Pataflafla', category: 'flams', sticking: 'lR L R rL · rL R L lR', chartFile: '28-pataflafla.chart' },
  { id: 29, name: 'Swiss Army Triplet', category: 'flams', sticking: 'lR R L · rL L R', chartFile: '29-swiss-army-triplet.chart' },
  { id: 30, name: 'Inverted Flam Tap', category: 'flams', sticking: 'lR lR R rL rL L', chartFile: '30-inverted-flam-tap.chart' },

  // Drag Rudiments (31-40)
  { id: 31, name: 'Drag', category: 'drags', sticking: 'llR rrL', chartFile: '31-drag.chart' },
  { id: 32, name: 'Single Drag Tap', category: 'drags', sticking: 'llR L rrL R', chartFile: '32-single-drag-tap.chart' },
  { id: 33, name: 'Double Drag Tap', category: 'drags', sticking: 'llR llR L rrL rrL R', chartFile: '33-double-drag-tap.chart' },
  { id: 34, name: 'Lesson 25', category: 'drags', sticking: 'llR L R L · rrL R L R', chartFile: '34-lesson-25.chart' },
  { id: 35, name: 'Single Dragadiddle', category: 'drags', sticking: 'llR R · rrL L', chartFile: '35-single-dragadiddle.chart' },
  { id: 36, name: 'Drag Paradiddle #1', category: 'drags', sticking: 'R llR L R R · L rrL R L L', chartFile: '36-drag-paradiddle-1.chart' },
  { id: 37, name: 'Drag Paradiddle #2', category: 'drags', sticking: 'R llR L L R R · L rrL R R L L', chartFile: '37-drag-paradiddle-2.chart' },
  { id: 38, name: 'Single Ratamacue', category: 'drags', sticking: 'llR L R · rrL R L', chartFile: '38-single-ratamacue.chart' },
  { id: 39, name: 'Double Ratamacue', category: 'drags', sticking: 'llR llR L R · rrL rrL R L', chartFile: '39-double-ratamacue.chart' },
  { id: 40, name: 'Triple Ratamacue', category: 'drags', sticking: 'llR llR llR L R · rrL rrL rrL R L', chartFile: '40-triple-ratamacue.chart' },
];

export function getRudimentById(id: number): Rudiment | undefined {
  return rudiments.find(r => r.id === id);
}

export function getRudimentsByCategory(category: Rudiment['category']): Rudiment[] {
  return rudiments.filter(r => r.category === category);
}

export const categories: Rudiment['category'][] = ['rolls', 'diddles', 'flams', 'drags'];
