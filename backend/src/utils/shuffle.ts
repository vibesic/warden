/**
 * Fisher-Yates (Knuth) shuffle — returns a new array.
 * Unbiased O(n) shuffle, unlike the common sort(() => 0.5 - Math.random()).
 */
export const fisherYatesShuffle = <T>(array: ReadonlyArray<T>): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
