# ngramflow

An interactive web app to visualize how n-gram language models work; one token at a time.

Inspired by Claude Shannon's (1948) foundational work on information theory, **ngramflow** lets you:

- **Train** a model on any text corpus
- **Choose** between word-level and character-level tokens
- **Generate** text using unigram, bigram, or trigram models
- **Watch** the top-5 most probable next tokens with live probability bars
- **Understand** the exact conditional probability calculation behind each token

Perfect for teaching language modeling fundamentals before diving into transformers and neural approaches.

## Features

### Interactive Token Generation
- Click **Next Token** to generate one token at a time with a visual flash animation
- Enable **Auto** for continuous generation with configurable speed (0.2–8 tokens/second)
- Set max step limits to avoid runaway generations

### Switchable Token Levels
- **Word-level**: Classic n-gram models on vocabulary
- **Character-level**: See how Shannon's original experiments worked — trigram characters already produce nearly readable English

### Three N-gram Orders
- **Unigram** (P(w)): No context, pure frequency
- **Bigram** (P(w | w₋₁)): One-token lookback with fallback to unigram
- **Trigram** (P(w | w₋₂, w₋₁)): Two-token context with graceful degradation

### "How it Works" Panel
Click **ƒ How it works** to see:
- The exact mathematical formula for your chosen model order
- Live calculation with real corpus counts from the last step generated
- Context used and fallback warnings (when a context was never seen)

### Editable Corpus
Paste any text you like — Alice in Wonderland (included) is just the default. The model rebuilds instantly.

## Getting Started

Open `index.html` in any modern browser. No build step, no dependencies — pure HTML/CSS/JS.

```bash
# Clone or download
cd ngramflow

# Open in browser
open index.html
# or
firefox index.html
```

## How It Works

The core algorithm computes conditional probabilities from frequency tables:

```
P(w | context) = count(context, w) / count(context, *)
```

Then **weighted random sampling** (not greedy argmax) picks the next token proportionally to these probabilities. This mirrors Shannon's original approach and shows why even simple n-gram models produce surprisingly plausible text.

## Architecture

- **`index.html`** — DOM structure only
- **`style.css`** — Modern light design with smooth animations
- **`corpus.js`** — Default training corpus (Alice in Wonderland, Ch. I–III)
- **`model.js`** — Core `NgramModel` class with full JSDoc comments
- **`app.js`** — State management, rendering, event handling

Load order: `corpus.js` → `model.js` → `app.js` (all deferred in the HTML).

## Implementation Notes

### Tokenization

**Word-level**: Lowercase, strip punctuation (keep apostrophes), split on whitespace.  
**Character-level**: Lowercase, keep only a–z and space.

### Fallback Chain

If the exact context is not in the training corpus:
- Trigram → Bigram → Unigram → Use unigram distribution

This graceful degradation is shown in real time in the "How it Works" panel.

### Probability Display

The top-5 bars are **normalized to the highest probability** (100%), not absolute percentages. This makes relative differences visible even when absolute probabilities are small.

### Sampling, Not Greedy

We use weighted random sampling, so the same prompt can generate different outputs. This is intentional — it shows the stochastic nature of language generation and why pure n-gram models produce varied (and sometimes silly) results.

## Educational Use

Perfect for seminar or classroom settings:

1. **Show Shannon's Insight** — Start with character-level trigrams. The fact that readable English emerges from pure statistics is remarkable.
2. **Build Intuition** — Watch how bigrams > unigrams, trigrams > bigrams. Context matters.
3. **Fallback Behavior** — When does the model fall back? Why? This teaches the importance of sufficient training data.
4. **Segue to Neural Models** — Once students understand n-grams, explain transformers as "n-grams with infinite (learned) context and better probability estimates."

## Why N-Grams?

Before transformers, before LSTM, before RNNs — there were n-grams. They're:
- **Simple**: Frequency counting + conditional probability
- **Transparent**: You can see exactly why each token was chosen
- **Pedagogical**: The foundation for understanding all modern language models

ngramflow puts that foundation in your hands.

## Browser Support

Any modern browser (Chrome, Firefox, Safari, Edge). Requires ES6 JavaScript and CSS Grid.

## License

The default corpus (Alice's Adventures in Wonderland) is public domain.  
This tool is provided as-is for educational purposes.

---

**Inspired by:**
- C. E. Shannon, *A Mathematical Theory of Communication* (1948)
- The famous observation: *"If one chooses words at random ... one obtains reasonable sentences."*

Built for the Word Embeddings seminar, Lisbon 2026.
