import {test, expect} from '@playwright/experimental-ct-react';
import {MemoryRouter} from 'react-router-dom';
import {SetlistEditor} from '../SetlistsPage';
import type {Setlist, SetlistItem} from '@/lib/local-db/setlists';

// ── Fixtures ─────────────────────────────────────────────────────────

const mockSetlist: Setlist = {
  id: 1,
  name: 'Test Setlist',
  description: null,
  sourceType: 'custom',
  sourceId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  itemCount: 3,
};

function makeItem(id: number, name: string, position: number): SetlistItem {
  return {
    id,
    setlistId: 1,
    itemType: 'chart',
    chartMd5: `md5-${id}`,
    compositionId: null,
    pdfLibraryId: null,
    name,
    artist: 'Test Artist',
    charter: 'Test Charter',
    position,
    speed: 100,
    addedAt: '2024-01-01T00:00:00Z',
  };
}

const THREE_ITEMS: SetlistItem[] = [
  makeItem(1, 'Song A', 0),
  makeItem(2, 'Song B', 1),
  makeItem(3, 'Song C', 2),
];

// ── Helper: drag via grip handle (pointer events, works with @dnd-kit) ─

async function dragItem(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  fromIndex: number,
  toIndex: number,
) {
  const source = page.locator(`[data-testid="setlist-item-${fromIndex}"] [data-testid="grip"]`);
  const target = page.locator(`[data-testid="setlist-item-${toIndex}"]`);

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Could not get bounding boxes');

  // Pointer-event drag: triggers @dnd-kit PointerSensor
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  // Move gradually to satisfy the 5px activation constraint
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    {steps: 15},
  );
  await page.mouse.up();
}

// ── Tests ─────────────────────────────────────────────────────────────

test('renders items in correct order', async ({mount, page}) => {
  await mount(
    <MemoryRouter>
      <SetlistEditor
        setlist={mockSetlist}
        items={THREE_ITEMS}
        onAddItems={() => {}}
        onRemoveItem={() => {}}
        onReorder={() => {}}
        onChangeSpeed={() => {}}
      />
    </MemoryRouter>,
  );

  await expect(page.locator('[data-testid="setlist-item-0"]')).toContainText('Song A');
  await expect(page.locator('[data-testid="setlist-item-1"]')).toContainText('Song B');
  await expect(page.locator('[data-testid="setlist-item-2"]')).toContainText('Song C');
});

test('each item has a draggable grip handle', async ({mount, page}) => {
  await mount(
    <MemoryRouter>
      <SetlistEditor
        setlist={mockSetlist}
        items={THREE_ITEMS}
        onAddItems={() => {}}
        onRemoveItem={() => {}}
        onReorder={() => {}}
        onChangeSpeed={() => {}}
      />
    </MemoryRouter>,
  );

  // Every item should have a grip handle
  await expect(page.locator('[data-testid="grip"]')).toHaveCount(3);
});

test('drag first item to last position calls onReorder', async ({mount, page}) => {
  const calls: [number, number][] = [];

  await mount(
    <MemoryRouter>
      <SetlistEditor
        setlist={mockSetlist}
        items={THREE_ITEMS}
        onAddItems={() => {}}
        onRemoveItem={() => {}}
        onReorder={(id, pos) => calls.push([id, pos])}
        onChangeSpeed={() => {}}
      />
    </MemoryRouter>,
  );

  await dragItem(page, 0, 2);

  expect(calls).toHaveLength(1);
  // Song A (id=1) dragged to where Song C (index 2) is
  expect(calls[0]).toEqual([1, 2]);
});

test('drag last item to first position calls onReorder', async ({mount, page}) => {
  const calls: [number, number][] = [];

  await mount(
    <MemoryRouter>
      <SetlistEditor
        setlist={mockSetlist}
        items={THREE_ITEMS}
        onAddItems={() => {}}
        onRemoveItem={() => {}}
        onReorder={(id, pos) => calls.push([id, pos])}
        onChangeSpeed={() => {}}
      />
    </MemoryRouter>,
  );

  await dragItem(page, 2, 0);

  expect(calls).toHaveLength(1);
  // Song C (id=3) dragged to where Song A (index 0) is
  expect(calls[0]).toEqual([3, 0]);
});

test('drag middle item down calls onReorder', async ({mount, page}) => {
  const calls: [number, number][] = [];

  await mount(
    <MemoryRouter>
      <SetlistEditor
        setlist={mockSetlist}
        items={THREE_ITEMS}
        onAddItems={() => {}}
        onRemoveItem={() => {}}
        onReorder={(id, pos) => calls.push([id, pos])}
        onChangeSpeed={() => {}}
      />
    </MemoryRouter>,
  );

  await dragItem(page, 1, 2);

  expect(calls).toHaveLength(1);
  // Song B (id=2) dragged to where Song C (index 2) is
  expect(calls[0]).toEqual([2, 2]);
});

test('dragging item makes it ghost (opacity reduced)', async ({mount, page}) => {
  await mount(
    <MemoryRouter>
      <SetlistEditor
        setlist={mockSetlist}
        items={THREE_ITEMS}
        onAddItems={() => {}}
        onRemoveItem={() => {}}
        onReorder={() => {}}
        onChangeSpeed={() => {}}
      />
    </MemoryRouter>,
  );

  const source = page.locator('[data-testid="setlist-item-0"] [data-testid="grip"]');
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('No bounding box');

  // Start drag but don't release
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  // Move enough to activate
  await page.mouse.move(sourceBox.x + 50, sourceBox.y + 80, {steps: 10});

  // The dragging item should be ghosted (opacity-30 class)
  await expect(page.locator('[data-testid="setlist-item-0"]')).toHaveClass(/opacity-30/);

  await page.mouse.up();
});
