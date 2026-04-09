/**
 * NgramModel
 *
 * A statistical language model based on conditional frequency counts.
 * Supports word-level and character-level tokenisation, and uni-/bi-/trigrams.
 *
 * Core idea (Shannon, 1948):
 *   P(w | context) = count(context, w) / count(context, *)
 *
 * If the exact context was never seen in the corpus we fall back:
 *   trigram → bigram → unigram
 */
class NgramModel {
  constructor() {
    this.vocab    = new Map();  // token  → count
    this.bigrams  = new Map();  // token  → Map(next_token → count)
    this.trigrams = new Map();  // "t1 t2" → Map(next_token → count)
    this.tokens   = [];
    this.level    = 'word';
    this.built    = false;
  }

  // ── Tokenisers ───────────────────────────────────────────

  /** Word-level: lowercase, strip punctuation (keep apostrophes), split on whitespace. */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, ' ')
      .replace(/--+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  /** Character-level: lowercase, keep only a–z and space. */
  charTokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .split('');
  }

  // ── Build ────────────────────────────────────────────────

  /**
   * Build frequency tables from a corpus string.
   * @param {string} corpusText - Raw text to train on.
   * @param {'word'|'char'} level - Tokenisation level.
   */
  build(corpusText, level = 'word') {
    this.level  = level;
    this.tokens = level === 'char'
      ? this.charTokenize(corpusText)
      : this.tokenize(corpusText);

    this.vocab.clear();
    this.bigrams.clear();
    this.trigrams.clear();

    for (let i = 0; i < this.tokens.length; i++) {
      const w = this.tokens[i];

      // Unigram counts
      this.vocab.set(w, (this.vocab.get(w) || 0) + 1);

      // Bigram counts: P(w | prev)
      if (i >= 1) {
        const prev = this.tokens[i - 1];
        if (!this.bigrams.has(prev)) this.bigrams.set(prev, new Map());
        const bg = this.bigrams.get(prev);
        bg.set(w, (bg.get(w) || 0) + 1);
      }

      // Trigram counts: P(w | prev2, prev1)
      if (i >= 2) {
        const key = this.tokens[i - 2] + ' ' + this.tokens[i - 1];
        if (!this.trigrams.has(key)) this.trigrams.set(key, new Map());
        const tg = this.trigrams.get(key);
        tg.set(w, (tg.get(w) || 0) + 1);
      }
    }

    this.built = true;
  }

  // ── Inference ────────────────────────────────────────────

  /**
   * Look up the conditional distribution for the given context and n-gram order.
   * Falls back to lower-order models if the context was not seen.
   *
   * @param {string[]} context - Tokens generated so far (prompt + output).
   * @param {1|2|3} order - Requested n-gram order.
   * @returns {{ dist: Map, contextUsed: string, usedContext: string[], usedOrder: number }}
   */
  _getFullDist(context, order) {
    if (order === 3 && context.length >= 2) {
      const k0  = context[context.length - 2];
      const k1  = context[context.length - 1];
      const key = k0 + ' ' + k1;
      if (this.trigrams.has(key)) {
        return {
          dist: this.trigrams.get(key),
          contextUsed: `"${key}" (trigram)`,
          usedContext: [k0, k1],
          usedOrder: 3,
        };
      }
    }

    if (order >= 2 && context.length >= 1) {
      const key          = context[context.length - 1];
      const fallbackNote = (order === 3) ? ' (bigram fallback)' : ' (bigram)';
      if (this.bigrams.has(key)) {
        return {
          dist: this.bigrams.get(key),
          contextUsed: `"${key}"${fallbackNote}`,
          usedContext: [key],
          usedOrder: 2,
        };
      }
    }

    return {
      dist: this.vocab,
      contextUsed: 'unigram (no context)',
      usedContext: [],
      usedOrder: 1,
    };
  }

  /**
   * Sample one token from a frequency distribution using weighted random sampling.
   * Each token is chosen proportionally to its count — not always the most probable one.
   * This mirrors Shannon's original experiment (1948).
   *
   * @param {Map<string, number>} dist - Token → count map.
   * @returns {string} The sampled token.
   */
  weightedSample(dist) {
    let total = 0;
    for (const c of dist.values()) total += c;
    let r = Math.random() * total;
    for (const [word, count] of dist) {
      r -= count;
      if (r <= 0) return word;
    }
    return [...dist.keys()][dist.size - 1]; // floating-point safety fallback
  }

  /**
   * Generate one token given the current context and return diagnostic info.
   *
   * @param {string[]} contextTokens - Full context (prompt + previous output).
   * @param {1|2|3} order - N-gram order to use.
   * @returns {{
   *   chosen: string,
   *   top5: Array<{word: string, prob: number}>,
   *   contextUsed: string,
   *   chosenCount: number,
   *   contextTotal: number,
   *   usedContext: string[],
   *   usedOrder: number
   * }}
   */
  step(contextTokens, order) {
    const { dist, contextUsed, usedContext, usedOrder } =
      this._getFullDist(contextTokens, order);

    const chosen = this.weightedSample(dist);

    // Compute total for probability normalisation
    let total = 0;
    for (const c of dist.values()) total += c;

    const chosenCount = dist.get(chosen) || 0;

    // Top-5 most probable next tokens (for the UI probability bars)
    const top5 = [...dist.entries()]
      .map(([word, count]) => ({ word, prob: count / total }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 5);

    return { chosen, top5, contextUsed, chosenCount, contextTotal: total, usedContext, usedOrder };
  }

  // ── Stats ────────────────────────────────────────────────

  get vocabSize()       { return this.vocab.size; }
  get tokenCount()      { return this.tokens.length; }
  get bigramCoverage()  { return this.bigrams.size; }
  get trigramCoverage() { return this.trigrams.size; }
}
