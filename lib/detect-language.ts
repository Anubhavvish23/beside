export const code_languages = ['Python', 'JavaScript', 'Java', 'C++', 'C'] as const;
export type CodeLanguage = (typeof code_languages)[number];

const signals: Record<CodeLanguage, [RegExp, number][]> = {
  Python: [
    [/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w\[\], ]+)?\s*:\s*$/m, 3],
    [/^\s*(if|elif|else|for|while|try|except|with|class)\b.*:\s*$/m, 2],
    [/^\s*(from\s+\w+(\.\w+)*\s+)?import\s+\w+(\s+as\s+\w+)?\s*$/m, 2],
    [/\bprint\s*\(/, 1],
    [/\belif\b|\bself\.|\bNone\b|\bTrue\b|\bFalse\b/, 2],
    [/\binput\s*\(|\brange\s*\(|\blen\s*\(/, 1],
  ],
  JavaScript: [
    [/\b(const|let|var)\s+\w+\s*=/, 2],
    [/\bfunction\s+\w*\s*\(/, 2],
    [/=>/, 2],
    [/\bconsole\.log\s*\(/, 3],
    [/===|!==/, 2],
    [/\b(document|window|require|module\.exports|prompt)\b/, 2],
  ],
  Java: [
    [/\bpublic\s+(static\s+)?(class|void|int|String|boolean)\b/, 3],
    [/\bSystem\.out\.print(ln)?\s*\(/, 4],
    [/\bString\[\]\s+\w+/, 3],
    [/^\s*import\s+java\./m, 4],
    [/\bnew\s+(Scanner|ArrayList|HashMap|int\[)/, 3],
    [/\b(ArrayList|HashMap|List|Map)<\w+/, 2],
  ],
  'C++': [
    [/#include\s*<(iostream|vector|string|bits\/stdc\+\+\.h|algorithm|map|unordered_map)>/, 4],
    [/\bstd::|\busing\s+namespace\s+std\b/, 4],
    [/\bcout\s*<<|\bcin\s*>>/, 4],
    [/\bvector\s*</, 3],
    [/^\s*public:\s*$/m, 3],
    [/\bnullptr\b|\bauto\s+\w+\s*=/, 2],
  ],
  C: [
    [/#include\s*<(stdio|stdlib|string|math)\.h>/, 4],
    [/\bprintf\s*\(|\bscanf\s*\(/, 3],
    [/\bmalloc\s*\(|\bfree\s*\(/, 2],
    [/\bint\s+main\s*\(\s*(void)?\s*\)/, 1],
  ],
};

export function detect_language(code: string): CodeLanguage | null {
  if (code.trim().length < 6) return null;
  const scores = code_languages.map((language) => ({
    language,
    score: signals[language].reduce((sum, [pattern, weight]) => sum + (pattern.test(code) ? weight : 0), 0),
  }));
  if (scores.find((item) => item.language === 'C++')!.score > 0) {
    scores.find((item) => item.language === 'C')!.score -= 2;
  }
  scores.sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (best.score < 3 || best.score - next.score < 2) return null;
  return best.language;
}
