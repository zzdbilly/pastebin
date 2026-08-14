// --- Language auto-detection (language.js) ---

export const LANGUAGE_PATTERNS = [
  { lang: 'javascript', patterns: [/^\s*function\s+/m, /=>\s*[{(]/, /\bconst\s+\w+\s*=/, /\blet\s+\w+\s*=/, /console\.log\(/, /require\(['"]/] },
  { lang: 'typescript', patterns: [/\binterface\s+\w+/, /:\s*(string|number|boolean|void)\b/, /\bas\s+(string|number|any)\b/, /\btype\s+\w+\s*=/] },
  { lang: 'python', patterns: [/^\s*def\s+\w+\s*\(/m, /^\s*import\s+\w+/m, /^\s*from\s+\w+\s+import/m, /print\s*\(/, /\bif\s+__name__\s*==\s*['"]__main__['"]:/, /\belif\b/, /\bself\./] },
  { lang: 'go', patterns: [/^\s*package\s+\w+/m, /^\s*func\s+\w+\s*\(/m, /^\s*import\s*["(]/m, /\bfmt\.(Print|Sprint|Fprint)/, /\bfunc\s+main\s*\(\)/] },
  { lang: 'java', patterns: [/^\s*public\s+(class|static|void)/m, /System\.out\.(print|println)/, /\bimport\s+java\./, /private\s+(static\s+)?\w+\s+\w+\s*;/] },
  { lang: 'c', patterns: [/#include\s*<.*\.h>/, /\bint\s+main\s*\(\s*(void|int\s+argc)/, /\bprintf\s*\(/, /\bscanf\s*\(/, /\bmalloc\s*\(/] },
  { lang: 'cpp', patterns: [/#include\s*<iostream>/, /#include\s*<vector>/, /\bstd::/, /\bcout\s*<</, /\bcin\s*>>/, /\btemplate\s*</] },
  { lang: 'csharp', patterns: [/\busing\s+System/, /\bnamespace\s+\w+/, /\bpublic\s+class\s+\w+/, /Console\.(Write|ReadLine)/, /\bstring\s+\w+\s*=/] },
  { lang: 'php', patterns: [/<\?php/, /^\s*\$\w+/m, /\becho\s+/, /\bfunction\s+\w+\s*\(/, /\barray\s*\(/] },
  { lang: 'ruby', patterns: [/^\s*def\s+\w+/m, /\bputs\s+/, /\brequire\s+['"]/, /\bend\s*$/, /\bmodule\s+\w+/, /\|.*\|/] },
  { lang: 'rust', patterns: [/^\s*fn\s+\w+/m, /^\s*use\s+\w+/m, /\blet\s+mut\s+/, /\bprintln!\s*\(/, /\bpub\s+(fn|struct|enum)/] },
  { lang: 'bash', patterns: [/^#!/, /\becho\s+/, /\bif\s+\[.*\];\s*then/, /\bfor\s+\w+\s+in\s/, /\bdone\s*$/, /\bexport\s+\w+=/] },
  { lang: 'html', patterns: [/<html/i, /<!DOCTYPE\s+html/i, /<\/(div|span|body|head|table)>/i] },
  { lang: 'css', patterns: [/[.#]\w+\s*\{/, /\b(media|keyframes)\s+/, /:\s*(hover|active|focus)\b/, /\bflex|grid\b/] },
  { lang: 'json', patterns: [/^\s*[\[{]/, /"[^"]+"\s*:\s*("(?:[^"\\]|\\.)*"|[\d.+-eEtruefalsenull]+)/] },
  { lang: 'yaml', patterns: [/^\s*\w+:\s+.+/m, /^\s*-\s+\w+/m, /\bindentation/, /^---/m] },
  { lang: 'sql', patterns: [/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/im, /\bFROM\s+\w+/i, /\bWHERE\s+\w+/i, /\bJOIN\s+\w+/i] },
  { lang: 'dockerfile', patterns: [/^\s*FROM\s+/im, /^\s*RUN\s+/im, /^\s*COPY\s+/im, /^\s*CMD\s+/im, /^\s*ENTRYPOINT\s+/im] },
  { lang: 'markdown', patterns: [/^#{1,6}\s+/m, /^\s*[-*]\s+/m, /```/, /\[.+?\]\(.+?\)/] },
  { lang: 'xml', patterns: [/<\?xml/, /<\/?\w+[\s>]/, /\sxmlns=/] },
];

export function detectLanguage(content) {
  const scores = {};
  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) score++;
    }
    if (score > 0) scores[lang] = score;
  }
  const entries = Object.entries(scores);
  if (entries.length === 0) return 'plaintext';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// Common languages for the dropdown
export const LANGUAGE_OPTIONS = [
  'plaintext', 'javascript', 'typescript', 'python', 'go', 'java', 'c', 'cpp',
  'csharp', 'php', 'ruby', 'rust', 'bash', 'sql', 'html', 'css', 'json',
  'yaml', 'markdown', 'xml', 'dockerfile',
];
