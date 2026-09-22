// ============================================================
//  Gujarati input helpers — virtual keyboard layout + a simple
//  English→Gujarati transliteration user on typing convenience.
//  (No font conversion needed — server & UI both use Unicode.)
// ============================================================

export type GujaratiKeyGroup = { name: string; keys: string[] };

export const GUJARATI_KEYS: GujaratiKeyGroup[] = [
  {
    name: "Consonants",
    keys: [
      "ક", "ખ", "ગ", "ઘ", "ચ", "છ", "જ", "ઝ",
      "ટ", "ઠ", "ડ", "ઢ", "ણ", "ત", "થ", "દ",
      "ધ", "ન", "પ", "ફ", "બ", "ભ", "મ", "ય",
      "ર", "લ", "વ", "શ", "ષ", "સ", "હ", "ળ",
    ],
  },
  {
    name: "Vowels",
    keys: ["અ", "આ", "ઇ", "ઈ", "ઉ", "ઊ", "ઋ", "એ", "ઐ", "ઓ", "ઔ", "ઍ"],
  },
  {
    name: "Signs",
    keys: ["ા", "િ", "ી", "ુ", "ૂ", "ૃ", "ે", "ૈ", "ો", "ૌ", "ં", "ઃ"],
  },
  {
    name: "Digits",
    keys: ["૦", "૧", "૨", "૩", "૪", "૫", "૬", "૭", "૮", "૯"],
  },
];

// ------------------------------------------------------------
//  Transliteration (best-effort).
//  latin word → Gujarati: "namaste" → "નમસ્તે"
// ------------------------------------------------------------

const CONSONANTS: [string, string][] = [
  ["ksh", "ક્ષ"],
  ["kh", "ખ"], ["gh", "ઘ"], ["ch", "ચ"], ["jh", "ઝ"],
  ["th", "થ"], ["dh", "દ"], ["ph", "ફ"], ["bh", "ભ"],
  ["sh", "શ"], ["Sh", "ષ"], ["nn", "ણ"], ["tr", "ત્ર"],
  ["k", "ક"], ["g", "ગ"], ["c", "ચ"], ["j", "જ"],
  ["T", "ટ"], ["Th", "ઠ"], ["D", "ડ"], ["Dh", "ઢ"], ["N", "ણ"],
  ["t", "ત"], ["d", "દ"], ["n", "ન"],
  ["p", "પ"], ["b", "બ"], ["m", "મ"],
  ["y", "ય"], ["r", "ર"], ["l", "લ"], ["L", "ળ"],
  ["v", "વ"], ["s", "સ"], ["h", "હ"],
];

const VOWEL_KEYS: [string, string, string][] = [
  // latin, standalone, matra (after consonant)
  ["aa", "આ", "ા"],
  ["ii", "ઈ", "ી"],
  ["uu", "ઊ", "ૂ"],
  ["ai", "ઐ", "ૈ"],
  ["au", "ઔ", "ૌ"],
  ["ae", "ઍ", "ૅ"],
  ["a", "અ", ""],
  ["i", "ઇ", "િ"],
  ["u", "ઉ", "ુ"],
  ["e", "એ", "ે"],
  ["o", "ઓ", "ો"],
];

const DIGIT_MAP: Record<string, string> = {
  "0": "૦", "1": "૧", "2": "૨", "3": "૩", "4": "૪",
  "5": "૫", "6": "૬", "7": "૭", "8": "૮", "9": "૯",
};

const ANUSVARA: [string, string] = ["M", "ં"];
const VISARGA: [string, string] = ["H", "ઃ"];

const CONSONANT_MAP: [string, string][] = [...CONSONANTS, ANUSVARA, VISARGA].sort(
  (x, y) => y[0].length - x[0].length
);

export function transliterateWord(word: string): string {
  if (!word) return "";
  const raw = word.trim();
  let out = "";
  let i = 0;
  const lower = raw.toLowerCase();
  let prevWasConsonant = false;

  while (i < raw.length) {
    // digit
    if (/\d/.test(raw[i])) {
      out += DIGIT_MAP[raw[i]] ?? raw[i];
      prevWasConsonant = false;
      i += 1;
      continue;
    }
    // vowel (only when not a consonant residue)
    let vowel: [string, string, string] | undefined;
    for (const v of VOWEL_KEYS) {
      if (lower.startsWith(v[0], i) && raw.slice(i, i + v[0].length) === v[0]) {
        vowel = v;
        break;
      }
    }
    if (vowel) {
      if (prevWasConsonant) {
        if (vowel[2]) out += vowel[2];
      } else {
        out += vowel[1];
      }
      prevWasConsonant = false;
      i += vowel[0].length;
      continue;
    }
    // consonant (longest match first)
    let consonant: [string, string] | undefined;
    for (const c of CONSONANT_MAP) {
      if (lower.startsWith(c[0], i) && raw.slice(i, i + c[0].length) === c[0]) {
        consonant = c;
        break;
      }
    }
    if (consonant) {
      out += consonant[1];
      prevWasConsonant = true;
      i += consonant[0].length;
      continue;
    }
    // unknown → pass through
    out += raw[i];
    prevWasConsonant = false;
    i += 1;
  }

  // strip the implicit trailing "a" matra if a bare name ended in consonant
  return out;
}