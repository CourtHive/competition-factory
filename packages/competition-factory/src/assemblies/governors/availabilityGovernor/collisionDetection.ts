/**
 * Collision Detection & Clamping
 *
 * Implements collision-aware clamping for drag-create operations.
 *
 * Core Principles:
 * - Half-open intervals: [start, end) where start < end
 * - Adjacency allowed: end === start is valid (not an overlap)
 * - No overlaps permitted: intervals cannot share internal time points
 * - Clamping: new blocks stop at the first collision boundary
 *
 * Rules:
 * A. Drag outside -> enters block -> clamp to boundary
 * B. Drag starts inside block -> invalid, do not create
 * C. Drag spans multiple blocks -> create first valid segment only
 */

import type { Block, TimeRange } from './types';

function toTimestamp(isoString: string): number {
  return new Date(isoString?.endsWith('Z') ? isoString : isoString + 'Z').getTime();
}

export function intervalsOverlap(a: TimeRange, b: TimeRange): boolean {
  return toTimestamp(a.start) < toTimestamp(b.end) && toTimestamp(a.end) > toTimestamp(b.start);
}

export function timeInsideBlock(time: number, block: Block): boolean {
  return toTimestamp(block?.start) <= time && time < toTimestamp(block?.end);
}

export function findBlocksContainingTime(time: number, blocks: Block[]): Block[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((block) => timeInsideBlock(time, block));
}

export function clampDragToCollisions(
  anchorTime: number,
  cursorTime: number,
  blocks: Block[],
): {
  start: number;
  end: number;
  clamped: boolean;
  clampedBy?: Block;
  direction: 'forward' | 'backward';
} {
  const direction = cursorTime >= anchorTime ? 'forward' : 'backward';
  const rawStart = Math.min(anchorTime, cursorTime);
  const rawEnd = Math.max(anchorTime, cursorTime);

  if (direction === 'forward') {
    return clampForward(anchorTime, rawEnd, blocks);
  }

  return clampBackward(anchorTime, rawStart, blocks);
}

function clampForward(
  anchorTime: number,
  rawEnd: number,
  blocks: Block[],
): { start: number; end: number; clamped: boolean; clampedBy?: Block; direction: 'forward' | 'backward' } {
  let minClampEnd = rawEnd;
  let clamped = false;
  let clampedBy: Block | undefined;

  for (const block of blocks) {
    const blockStart = toTimestamp(block.start);

    if (blockStart > anchorTime && blockStart < rawEnd && blockStart < minClampEnd) {
      minClampEnd = blockStart;
      clamped = true;
      clampedBy = block;
    }

    const blockEnd = toTimestamp(block.end);
    if (blockStart < rawEnd && blockEnd > anchorTime && blockStart < minClampEnd && blockStart > anchorTime) {
      minClampEnd = blockStart;
      clamped = true;
      clampedBy = block;
    }
  }

  return { start: anchorTime, end: minClampEnd, clamped, clampedBy, direction: 'forward' };
}

function clampBackward(
  anchorTime: number,
  rawStart: number,
  blocks: Block[],
): { start: number; end: number; clamped: boolean; clampedBy?: Block; direction: 'forward' | 'backward' } {
  let maxClampStart = rawStart;
  let clamped = false;
  let clampedBy: Block | undefined;

  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      const blockEnd = toTimestamp(block.end);

      if (blockEnd < anchorTime && blockEnd > rawStart && blockEnd > maxClampStart) {
        maxClampStart = blockEnd;
        clamped = true;
        clampedBy = block;
      }

      const blockStart = toTimestamp(block.start);
      if (blockStart < anchorTime && blockEnd > rawStart && blockEnd > maxClampStart && blockEnd < anchorTime) {
        maxClampStart = blockEnd;
        clamped = true;
        clampedBy = block;
      }
    }
  }

  return { start: maxClampStart, end: anchorTime, clamped, clampedBy, direction: 'backward' };
}

export function sortBlocksByStart(blocks: Block[]): void {
  if (!Array.isArray(blocks)) return;
  blocks.sort((a, b) => toTimestamp(a.start) - toTimestamp(b.start));
}
