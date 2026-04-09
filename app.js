/**
 * app.js — UI state, rendering, and event handling.
 *
 * Depends on: corpus.js (DEFAULT_CORPUS), model.js (NgramModel)
 * Load order in index.html: corpus.js → model.js → app.js  (all with defer)
 */

// ══════════════════════════════════════════════════════════════
//  MODEL INSTANCE + STATE
// ══════════════════════════════════════════════════════════════

const model = new NgramModel();

const state = {
  outputTokens: [],   // tokens generated so far (not including the prompt)
  ngramOrder:   2,    // 1 = unigram, 2 = bigram, 3 = trigram
  tokenLevel:   'word', // 'word' | 'char'
  isAuto:       false,
  autoTimer:    null,
  speed:        2.0,  // tokens per second (auto mode)
  maxSteps:     80,
  stepCount:    0,
  lastStepInfo: null, // most recent result from model.step() — used by theory panel
};

// ══════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ══════════════════════════════════════════════════════════════

const theoryPanel        = document.getElementById('theory-panel');
const theoryFormulaTitle = document.getElementById('theory-formula-title');
const theoryFormulaBody  = document.getElementById('theory-formula-body');
const theoryCalcBody     = document.getElementById('theory-calc-body');
const btnTheory          = document.getElementById('btn-theory');
const corpusInput        = document.getElementById('corpus-input');
const btnBuild           = document.getElementById('btn-build');
const modelStats         = document.getElementById('model-stats');
const promptInput        = document.getElementById('prompt-input');
const btnReset           = document.getElementById('btn-reset');
const speedSlider        = document.getElementById('speed-slider');
const speedVal           = document.getElementById('speed-val');
const maxStepsInput      = document.getElementById('max-steps');
const stepCounter        = document.getElementById('step-counter');
const btnNext            = document.getElementById('btn-next');
const btnAuto            = document.getElementById('btn-auto');
const outputArea         = document.getElementById('output-area');
const top5Rows           = document.getElementById('top5-rows');
const contextBadge       = document.getElementById('context-badge');

// Pre-create 5 persistent top-5 row elements so CSS transitions animate smoothly
const rowEls = [];
{
  top5Rows.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div');
    row.className = 'top5-row';
    row.innerHTML = `
      <span class="top5-word">—</span>
      <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
      <span class="top5-pct">—</span>
      <span class="chosen-mark"></span>
    `;
    top5Rows.appendChild(row);
    rowEls.push(row);
  }
}

// ══════════════════════════════════════════════════════════════
//  CORE FUNCTIONS
// ══════════════════════════════════════════════════════════════

function buildModel() {
  btnBuild.textContent = 'Building…';
  btnBuild.disabled    = true;

  // Yield to the browser so the button label updates before the (synchronous) build
  setTimeout(() => {
    model.build(corpusInput.value, state.tokenLevel);

    btnBuild.textContent       = '✓ Model Built';
    btnBuild.style.background  = 'var(--success)';
    setTimeout(() => {
      btnBuild.textContent      = 'Build Model';
      btnBuild.style.background = '';
      btnBuild.disabled         = false;
    }, 1500);

    const typeLabel = state.tokenLevel === 'char' ? 'symbols' : 'types';
    modelStats.innerHTML =
      `<span>${model.vocabSize.toLocaleString()}</span> ${typeLabel} &middot; ` +
      `<span>${model.tokenCount.toLocaleString()}</span> tokens &middot; ` +
      `<span>${model.bigramCoverage.toLocaleString()}</span> bigrams &middot; ` +
      `<span>${model.trigramCoverage.toLocaleString()}</span> trigrams`;

    btnNext.disabled = false;
    btnAuto.disabled = false;
    renderTop5([], null, '—');
  }, 10);
}

/** Returns the full context: prompt tokens + generated tokens. */
function getContext() {
  const promptToks = state.tokenLevel === 'char'
    ? model.charTokenize(promptInput.value)
    : model.tokenize(promptInput.value);
  return [...promptToks, ...state.outputTokens];
}

/** Generate and append one token. */
function nextToken() {
  if (!model.built) return;
  if (state.stepCount >= state.maxSteps) { stopAuto(); return; }

  const context    = getContext();
  const stepResult = model.step(context, state.ngramOrder);
  const { chosen, top5, contextUsed } = stepResult;

  state.outputTokens.push(chosen);
  state.stepCount++;
  state.lastStepInfo = stepResult;

  renderOutput();
  renderTop5(top5, chosen, contextUsed);
  updateStepCounter();
  updateTheoryCalc();
}

// ══════════════════════════════════════════════════════════════
//  RENDER FUNCTIONS
// ══════════════════════════════════════════════════════════════

function renderOutput() {
  // Deactivate previous flash classes
  outputArea.querySelectorAll('.token--new, .token--recent').forEach(el => {
    el.classList.remove('token--new', 'token--recent');
  });

  const isChar    = state.tokenLevel === 'char';
  const promptToks = isChar
    ? model.charTokenize(promptInput.value)
    : model.tokenize(promptInput.value);

  outputArea.innerHTML = '';

  // Prompt shown in muted colour
  if (promptToks.length > 0) {
    const span      = document.createElement('span');
    span.className  = 'output-prompt';
    span.textContent = isChar ? promptToks.join('') : promptToks.join(' ') + ' ';
    outputArea.appendChild(span);
  }

  // Generated tokens — no spaces between chars in char mode
  state.outputTokens.forEach((word, i) => {
    if (!isChar && i > 0) outputArea.appendChild(document.createTextNode(' '));

    const span      = document.createElement('span');
    span.className  = 'token';
    span.textContent = word;

    if (i === state.outputTokens.length - 1) {
      span.classList.add('token--new');
      setTimeout(() => {
        span.classList.remove('token--new');
        span.classList.add('token--recent');
      }, 560);
    }

    outputArea.appendChild(span);
  });

  outputArea.scrollTop = outputArea.scrollHeight;
}

/**
 * Update the 5 persistent top-5 rows in place.
 * Using persistent DOM elements lets CSS transitions animate bar widths smoothly.
 */
function renderTop5(top5, chosen, contextUsed) {
  contextBadge.textContent = contextUsed || '—';
  const maxProb = top5.length > 0 ? top5[0].prob : 1;

  rowEls.forEach((row, i) => {
    const wordEl = row.querySelector('.top5-word');
    const fillEl = row.querySelector('.bar-fill');
    const pctEl  = row.querySelector('.top5-pct');
    const markEl = row.querySelector('.chosen-mark');

    if (i < top5.length) {
      const { word, prob } = top5[i];
      const isChosen = (word === chosen);
      row.className        = 'top5-row' + (isChosen ? ' chosen' : '');
      wordEl.textContent   = word === ' ' ? '·' : word;  // show space as middle dot
      fillEl.style.width   = ((prob / maxProb) * 100).toFixed(1) + '%';
      pctEl.textContent    = (prob * 100).toFixed(1) + '%';
      markEl.textContent   = isChosen ? '✓' : '';
    } else {
      row.className        = 'top5-row';
      wordEl.textContent   = '—';
      fillEl.style.width   = '0%';
      pctEl.textContent    = '—';
      markEl.textContent   = '';
    }
  });
}

function updateStepCounter() {
  stepCounter.innerHTML = `Step: <b>${state.stepCount}</b> / ${state.maxSteps}`;
}

// ── Theory panel ──────────────────────────────────────────────

/** Render the static formula card (depends on model order + token level). */
function updateFormulaPanel() {
  const order = state.ngramOrder;
  const isChar = state.tokenLevel === 'char';
  const tok    = isChar ? 'char' : 'word';
  const names  = ['', 'Unigram', 'Bigram', 'Trigram'];
  theoryFormulaTitle.textContent = `Formula — ${names[order]} (${tok} level)`;

  if (order === 1) {
    theoryFormulaBody.innerHTML = `
      <div class="math-line">
        P(<span class="mvar">w</span>) <span class="op">=</span>
        <span class="frac">
          <span class="num">count(<span class="mvar">w</span>)</span>
          <span class="denom">total tokens</span>
        </span>
      </div>
      <p style="font-size:.75rem;color:var(--text-secondary);margin-top:8px">
        No context — probability depends only on how often <em>w</em> appears in the corpus.
      </p>`;
  } else if (order === 2) {
    theoryFormulaBody.innerHTML = `
      <div class="math-line">
        P(<span class="mvar">w</span> <span class="op">|</span> <span class="mvar">w</span><sub>−1</sub>) <span class="op">=</span>
        <span class="frac">
          <span class="num">count(<span class="mvar">w</span><sub>−1</sub>, <span class="mvar">w</span>)</span>
          <span class="denom">count(<span class="mvar">w</span><sub>−1</sub>, &thinsp;*)</span>
        </span>
      </div>
      <p style="font-size:.75rem;color:var(--text-secondary);margin-top:8px">
        How often does <em>w</em> follow the previous ${tok}?
        Falls back to unigram if the context was never seen in the corpus.
      </p>`;
  } else {
    theoryFormulaBody.innerHTML = `
      <div class="math-line">
        P(<span class="mvar">w</span> <span class="op">|</span> <span class="mvar">w</span><sub>−2</sub>, <span class="mvar">w</span><sub>−1</sub>) <span class="op">=</span>
        <span class="frac">
          <span class="num">count(<span class="mvar">w</span><sub>−2</sub> <span class="mvar">w</span><sub>−1</sub>, <span class="mvar">w</span>)</span>
          <span class="denom">count(<span class="mvar">w</span><sub>−2</sub> <span class="mvar">w</span><sub>−1</sub>, &thinsp;*)</span>
        </span>
      </div>
      <p style="font-size:.75rem;color:var(--text-secondary);margin-top:8px">
        How often does <em>w</em> follow the previous two ${tok}s?
        Falls back to bigram, then unigram if the context was never seen.
      </p>`;
  }
}

/** Render the live calculation card with actual corpus counts from the last step. */
function updateTheoryCalc() {
  if (!state.lastStepInfo) return;
  const { chosen, chosenCount, contextTotal, usedContext, usedOrder, contextUsed } =
    state.lastStepInfo;

  const isChar = state.tokenLevel === 'char';
  const q      = isChar ? "'" : '"';
  const disp   = t  => (t === ' ' ? '·' : t);
  const fmt    = t  => `<span class="mctx">${q}${disp(t)}${q}</span>`;

  const chosenFmt = `<span class="hi">${q}${disp(chosen)}${q}</span>`;
  const prob      = (chosenCount / contextTotal * 100).toFixed(2);
  const probFrac  = `${chosenCount} / ${contextTotal}`;

  let ctxLabel, formulaHtml;
  if (usedOrder === 1) {
    ctxLabel    = 'none (unigram fallback)';
    formulaHtml = `
      P(${chosenFmt})
      <span class="eq">=</span> count(${chosenFmt}) / total
      <span class="eq">=</span> <span class="hi">${probFrac} = ${prob}%</span>`;
  } else if (usedOrder === 2) {
    ctxLabel    = fmt(usedContext[0]);
    formulaHtml = `
      P(${chosenFmt} | ${fmt(usedContext[0])})
      <span class="eq">=</span> count(${fmt(usedContext[0])} → ${chosenFmt}) / count(${fmt(usedContext[0])} → *)
      <span class="eq">=</span> <span class="hi">${probFrac} = ${prob}%</span>`;
  } else {
    ctxLabel    = `${fmt(usedContext[0])} ${isChar ? '' : ' '}${fmt(usedContext[1])}`;
    formulaHtml = `
      P(${chosenFmt} | ${fmt(usedContext[0])}, ${fmt(usedContext[1])})
      <span class="eq">=</span> count(${fmt(usedContext[0])} ${fmt(usedContext[1])} → ${chosenFmt}) / count(${fmt(usedContext[0])} ${fmt(usedContext[1])} → *)
      <span class="eq">=</span> <span class="hi">${probFrac} = ${prob}%</span>`;
  }

  const fallbackNote = contextUsed.includes('fallback') || usedOrder < state.ngramOrder
    ? `<p class="calc-note">⚠ Fell back to ${['', 'unigram', 'bigram'][usedOrder]} — context not seen in corpus.</p>`
    : '';

  theoryCalcBody.innerHTML = `
    <div class="calc-row">
      <span class="calc-label">Context used</span>
      <span class="calc-val">${ctxLabel || '<em style="color:var(--text-tertiary)">none</em>'}</span>
      <span class="calc-label">Calculation</span>
      <span class="calc-val">${formulaHtml}</span>
      <span class="calc-label">Sampling</span>
      <span class="calc-val">weighted random draw from full distribution (not always the top token)</span>
    </div>
    ${fallbackNote}`;
}

// ══════════════════════════════════════════════════════════════
//  AUTO MODE
// ══════════════════════════════════════════════════════════════

function stopAuto() {
  clearTimeout(state.autoTimer);
  state.isAuto = false;
  btnAuto.textContent = 'Auto';
  btnAuto.classList.remove('active');
  btnNext.disabled = !model.built;
}

function toggleAuto() {
  if (state.isAuto) { stopAuto(); return; }
  state.isAuto = true;
  btnAuto.textContent = 'Stop';
  btnAuto.classList.add('active');
  btnNext.disabled = true;
  scheduleNext();
}

function scheduleNext() {
  if (!state.isAuto) return;
  if (state.stepCount >= state.maxSteps) { stopAuto(); return; }
  nextToken();
  // Recursive setTimeout (not setInterval) so delay is measured between completions
  state.autoTimer = setTimeout(scheduleNext, 1000 / state.speed);
}

// ══════════════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════════════

function reset() {
  stopAuto();
  state.outputTokens = [];
  state.stepCount    = 0;
  state.lastStepInfo = null;
  outputArea.innerHTML = '';
  renderTop5([], null, '—');
  updateStepCounter();
  theoryCalcBody.innerHTML =
    '<p class="theory-placeholder">Generate a token to see the live calculation.</p>';
}

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════════

btnBuild.addEventListener('click', buildModel);
btnNext.addEventListener('click', nextToken);
btnAuto.addEventListener('click', toggleAuto);
btnReset.addEventListener('click', reset);

btnTheory.addEventListener('click', () => {
  const isOpen = theoryPanel.classList.toggle('open');
  btnTheory.classList.toggle('active', isOpen);
  if (isOpen) { updateFormulaPanel(); updateTheoryCalc(); }
});

document.querySelectorAll('input[name="ngram"]').forEach(radio => {
  radio.addEventListener('change', e => {
    state.ngramOrder = parseInt(e.target.value);
    if (model.built && state.outputTokens.length > 0) {
      const { top5, contextUsed } = model.step(getContext(), state.ngramOrder);
      renderTop5(top5, null, contextUsed);
    }
    updateFormulaPanel();
  });
});

document.querySelectorAll('input[name="level"]').forEach(radio => {
  radio.addEventListener('change', e => {
    state.tokenLevel = e.target.value;
    // Suggest sensible default step counts per level
    if (state.tokenLevel === 'char' && state.maxSteps < 150) {
      state.maxSteps = 150;
      maxStepsInput.value = 150;
    } else if (state.tokenLevel === 'word' && state.maxSteps === 150) {
      state.maxSteps = 80;
      maxStepsInput.value = 80;
    }
    updateStepCounter();
    updateFormulaPanel();
    reset();
    buildModel();
  });
});

speedSlider.addEventListener('input', e => {
  state.speed = parseFloat(e.target.value);
  speedVal.textContent = state.speed.toFixed(1);
});

maxStepsInput.addEventListener('change', e => {
  const v = parseInt(e.target.value);
  if (!isNaN(v) && v >= 1) { state.maxSteps = v; updateStepCounter(); }
});

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && model.built) nextToken();
});

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

corpusInput.value = DEFAULT_CORPUS;
updateStepCounter();
updateFormulaPanel();
setTimeout(buildModel, 200); // slight delay so the page paints before the build runs
