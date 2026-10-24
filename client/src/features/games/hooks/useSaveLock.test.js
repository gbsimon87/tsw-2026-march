import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useSaveLock } from './useSaveLock';

describe('useSaveLock', () => {
  test('locks synchronously, before React commits the state', () => {
    const { result } = renderHook(() => useSaveLock());
    let lockedInSameTick;
    act(() => {
      result.current.beginSave();
      lockedInSameTick = result.current.isSavingNow();
    });
    expect(lockedInSameTick).toBe(true);
    expect(result.current.isSaving).toBe(true);
  });

  test('stays locked until the last overlapping save settles', () => {
    const { result } = renderHook(() => useSaveLock());
    let endPrimary;
    let endFollowUp;
    act(() => {
      endPrimary = result.current.beginSave();
      endFollowUp = result.current.beginSave();
    });
    act(() => endPrimary());
    expect(result.current.isSaving).toBe(true);
    expect(result.current.isSavingNow()).toBe(true);
    act(() => endFollowUp());
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isSavingNow()).toBe(false);
  });

  test('a release called twice only releases its own hold', () => {
    const { result } = renderHook(() => useSaveLock());
    let endFirst;
    act(() => {
      endFirst = result.current.beginSave();
      result.current.beginSave();
    });
    act(() => {
      endFirst();
      endFirst();
    });
    expect(result.current.isSavingNow()).toBe(true);
  });
});
