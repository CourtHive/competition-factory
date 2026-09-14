import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { addNotes, removeNotes } from '@Mutate/base/addRemoveNotes';
import { expect, it, describe } from 'vitest';

describe('addNotes', () => {
  it('adds notes to an element', () => {
    const element: any = { id: 'test' };
    const notes = 'Test notes';

    const result: any = addNotes({ element, notes });

    expect(result.success).toEqual(true);
    expect(element.notes).toEqual(notes);
  });

  it('returns error when params is not an object', () => {
    const result: any = addNotes('not an object' as any);
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when params is null', () => {
    const result: any = addNotes(null);
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when params is undefined', () => {
    const result: any = addNotes();
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when notes is missing', () => {
    const element: any = { id: 'test' };
    const result: any = addNotes({ element });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when element is not an object', () => {
    const result: any = addNotes({ element: 'not an object', notes: 'test' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when element is null', () => {
    const result: any = addNotes({ element: null, notes: 'test' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when element is undefined', () => {
    const result: any = addNotes({ element: undefined, notes: 'test' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when notes is not a string', () => {
    const element: any = { id: 'test' };
    const result: any = addNotes({ element, notes: 123 as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when notes is an array', () => {
    const element: any = { id: 'test' };
    const result: any = addNotes({ element, notes: ['note1', 'note2'] as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when notes is an object without testing flag', () => {
    const element: any = { id: 'test' };
    const result: any = addNotes({ element, notes: { text: 'note' } as any });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('allows object notes with testing flag', () => {
    const element: any = { id: 'test' };
    const notes = { text: 'note', testing: true };

    const result: any = addNotes({ element, notes: notes as any });

    expect(result.success).toEqual(true);
    expect(element.notes).toEqual(notes);
  });

  it('overwrites existing notes', () => {
    const element: any = { id: 'test', notes: 'old notes' };
    const newNotes = 'new notes';

    const result: any = addNotes({ element, notes: newNotes });

    expect(result.success).toEqual(true);
    expect(element.notes).toEqual(newNotes);
  });

  it('handles empty string notes', () => {
    const element: any = { id: 'test' };
    const notes = '';

    const result: any = addNotes({ element, notes });

    expect(result.error).toBeDefined(); // missing value
    expect(element.notes).toEqual(undefined);
  });
});

describe('removeNotes', () => {
  it('removes notes from an element', () => {
    const element: any = { id: 'test', notes: 'Test notes' };

    const result: any = removeNotes({ element });

    expect(result.success).toEqual(true);
    expect(element.notes).toBeUndefined();
  });

  it('returns error when params is not an object', () => {
    const result: any = removeNotes('not an object' as any);
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when params is null', () => {
    const result: any = removeNotes(null);
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when params is undefined', () => {
    const result: any = removeNotes();
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when element is not an object', () => {
    const result: any = removeNotes({ element: 'not an object' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when element is null', () => {
    const result: any = removeNotes({ element: null });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when element is undefined', () => {
    const result: any = removeNotes({ element: undefined });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('succeeds when element has no notes', () => {
    const element: any = { id: 'test' };

    const result: any = removeNotes({ element });

    expect(result.success).toEqual(true);
    expect(element.notes).toBeUndefined();
  });

  it('does not affect other properties', () => {
    const element: any = { id: 'test', name: 'Test Element', notes: 'Test notes' };

    const result: any = removeNotes({ element });

    expect(result.success).toEqual(true);
    expect(element.id).toEqual('test');
    expect(element.name).toEqual('Test Element');
    expect(element.notes).toBeUndefined();
  });

  it('handles element with multiple properties', () => {
    const element: any = {
      id: 'test',
      name: 'Test',
      notes: 'Notes to remove',
      data: { nested: 'value' },
    };

    const result: any = removeNotes({ element });

    expect(result.success).toEqual(true);
    expect(element.notes).toBeUndefined();
    expect(Object.keys(element)).toEqual(['id', 'name', 'data']);
  });
});
