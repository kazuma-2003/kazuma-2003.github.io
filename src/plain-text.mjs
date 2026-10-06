// 説明文などの「数式を組まない場所」で、$...$ の LaTeX を読める文字に置き換える。
// 例：「つまり $A \rightarrow B$ と」→「つまり A → B と」
// ブログ（src/lib.ts）と管理画面（tools/writer/server.mjs）の両方から使う。

const SYMBOLS = {
  rightarrow: '→', to: '→', leftarrow: '←', gets: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔',
  Leftrightarrow: '⇔', mapsto: '↦', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥', approx: '≈',
  equiv: '≡', sim: '〜', propto: '∝', times: '×', div: '÷', pm: '±', cdot: '·', circ: '∘', cdots: '…', ldots: '…',
  dots: '…', infty: '∞', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', int: '∫', sqrt: '√', in: '∈', notin: '∉',
  subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
};

export function mathToText(tex) {
  return tex
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\([A-Za-z]+)/g, (all, name) => SYMBOLS[name] ?? '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/_\{([^{}]*)\}|_(\w)/g, (_, a, b) => a ?? b)
    .replace(/\^\{([^{}]*)\}|\^(\w)/g, (_, a, b) => `^${a ?? b}`)
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 文中の $...$ / $$...$$ を置き換える。説明文の途中で切れて閉じていない $ にも対応する。
export function plainText(s) {
  if (!s) return '';
  return String(s)
    .replace(/\$\$([\s\S]*?)(?:\$\$|$)/g, (_, m) => mathToText(m))
    .replace(/(?<!\\)\$([^$]*?)(?:(?<!\\)\$|$)/g, (_, m) => mathToText(m))
    .replace(/\\\$/g, '$')
    .replace(/\s+([。、，．])/g, '$1');
}
