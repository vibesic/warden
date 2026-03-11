import { describe, it, expect, vi, afterEach } from 'vitest';
import { fisherYatesShuffle } from '@src/utils/shuffle';

describe('fisherYatesShuffle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a new array, not mutate the original', () => {
    const original = [1, 2, 3, 4, 5];
    const frozen = Object.freeze([...original]);
    const result = fisherYatesShuffle(frozen);

    expect(result).not.toBe(frozen);
    expect(frozen).toEqual(original);
  });

  it('should return an array with the same elements', () => {
    const input = [10, 20, 30, 40, 50];
    const result = fisherYatesShuffle(input);

    expect(result).toHaveLength(input.length);
    expect(result.sort((a, b) => a - b)).toEqual(input.sort((a, b) => a - b));
  });

  it('should return an empty array for empty input', () => {
    expect(fisherYatesShuffle([])).toEqual([]);
  });

  it('should return a single-element array unchanged', () => {
    expect(fisherYatesShuffle([42])).toEqual([42]);
  });

  it('should handle arrays with duplicate elements', () => {
    const input = [1, 1, 2, 2, 3];
    const result = fisherYatesShuffle(input);

    expect(result).toHaveLength(input.length);
    expect(result.sort((a, b) => a - b)).toEqual([1, 1, 2, 2, 3]);
  });

  it('should work with string arrays', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = fisherYatesShuffle(input);

    expect(result).toHaveLength(4);
    expect(result.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should produce a deterministic result when Math.random is mocked', () => {
    // Mock Math.random to always return 0 → j is always 0, so swap i with 0
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const input = [1, 2, 3, 4];
    const result = fisherYatesShuffle(input);

    // With random() === 0, j === 0 for every iteration
    // i=3: swap(3,0) → [4,2,3,1]
    // i=2: swap(2,0) → [3,2,4,1]
    // i=1: swap(1,0) → [2,3,4,1]
    expect(result).toEqual([2, 3, 4, 1]);
  });

  it('should use Fisher-Yates swap pattern (n-1 calls to Math.random)', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    fisherYatesShuffle([1, 2, 3, 4, 5]);

    // Fisher-Yates calls Math.random once per iteration: i = n-1 down to 1
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('should accept ReadonlyArray input', () => {
    const input: ReadonlyArray<number> = [1, 2, 3];
    const result = fisherYatesShuffle(input);

    expect(result).toHaveLength(3);
  });
});
