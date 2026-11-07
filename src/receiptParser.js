// 영수증 텍스트에서 날짜·시각·사용처·결제방식·금액·통화 "참고용 후보"를 뽑는 순수 함수 모듈.
// 입력을 저장하거나 출력하지 않는다(부수효과 없음).

const MAX_LINE = 60;
const NUM_LINE_KW = ["승인번호", "POS", "伝票", "承認番号", "処理通番", "登録番号", "No.", "TEL"];
const PAY_KW = ["합계", "총액", "결제금액", "승인금액", "청구액", "お買上", "お買い上げ", "合計", "総額", "税込", "金額", "AMOUNT", "請求", "会計"];
const EXC_KW = ["小計", "預り", "預かり", "お釣り", "釣銭", "ポイント", "포인트", "받은돈", "받은 돈", "거스름", "잔여", "적립", "가용", "부가세", "과세", "消費税", "内税", "本体", "割引", "値引", "할인"];
const UNIT_RE = /^\s?(?:일|日|P(?![A-Za-z])|点|個|개|枚|매|杯|%|회)/;
const SKIP_PM_LINE_KW = ["교환", "환불", "취소", "지참", "返品"];
const CASH_RES = [/現金/, /현금(?!영수증)/, /CASH/i, /お預か?り/];
const CARD_RES = [/交通系/, /Suica/i, /PASMO/i, /페이(?!지)/, /ペイ/, /VISA/i, /MASTER/i, /JCB/, /AMEX/i, /銀聯/, /クレジット/, /신용/, /체크/, /카드/, /カード/];
const TOKEN_CH = /[가-힣぀-ヿ一-鿿A-Za-z]/;
const HANGUL_RE = /[가-힣]/;
const JP_RE = /[぀-ヿ一-鿿]/;

const hasCI = (line, kws) => kws.some((k) => line.toLowerCase().includes(k.toLowerCase()));

function timeRegexes() {
  return [
    /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)/g,
    /(\d{1,2})時\s?(\d{1,2})分/g,
  ];
}

function timeSpans(line) {
  const spans = [];
  for (const re of timeRegexes()) {
    let m;
    while ((m = re.exec(line))) {
      if (+m[1] > 23 || +m[2] > 59) continue;
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

function extractNumbers(lines) {
  const cands = [];
  const aux = [];
  lines.forEach((raw, li) => {
    if (raw.length > MAX_LINE) return;
    if (NUM_LINE_KW.some((k) => raw.includes(k))) return;
    const s = raw.replace(/\d+(?:-\d+)+/g, (m) => " ".repeat(m.length));
    const spans = timeSpans(s);
    const re = /\d+(?:[,.]\s?\d+)*/g;
    let m;
    while ((m = re.exec(s))) {
      const tokStart = m.index;
      const prev = tokStart > 0 ? s[tokStart - 1] : "";
      if (prev === "," || prev === ".") continue;
      const parts = [];
      const r2 = /(\d+)(?:[,.]\s?)?/g;
      let mm;
      while ((mm = r2.exec(m[0]))) {
        parts.push({ str: mm[1], start: tokStart + mm.index, end: tokStart + mm.index + mm[1].length });
      }
      let i = 0;
      while (i < parts.length) {
        let str = parts[i].str;
        const start = parts[i].start;
        let end = parts[i].end;
        i++;
        let joined = false;
        if (str.length <= 3) {
          while (i < parts.length && parts[i].str.length === 3) {
            str += parts[i].str;
            end = parts[i].end;
            i++;
            joined = true;
          }
        }
        if (str.length > 1 && str[0] === "0") continue;
        const value = parseInt(str, 10);
        if (!(value > 0)) continue;
        if (s[start - 1] === "*" || s[end] === "*") continue;
        if (UNIT_RE.test(s.slice(end))) continue;
        if (!joined && str.length >= 7) continue;
        const before = s.slice(0, start).replace(/\s+$/, "");
        const hasMark = /[¥￥₩￦]$/.test(before) || /^\s?(?:円|원)/.test(s.slice(end));
        if (!joined && value < 100) {
          if (spans.some(([a, b]) => start < b && end > a)) continue;
          aux.push({ value, line: li });
          continue;
        }
        cands.push({ value, line: li, sym: joined || hasMark });
      }
    }
  });
  return { cands, aux };
}

function scoreAmounts(lines, cands, aux) {
  const seqSums = new Set();
  for (let i = 0; i < cands.length; i++) {
    let sum = 0;
    for (let j = i; j < cands.length; j++) {
      sum += cands[j].value;
      if (j > i) seqSums.add(sum);
    }
  }
  const byVal = new Map();
  for (const c of cands) {
    if (!byVal.has(c.value)) byVal.set(c.value, []);
    byVal.get(c.value).push(c);
  }
  const out = [];
  for (const [value, occ] of byVal) {
    const symCount = occ.filter((o) => o.sym).length;
    const pureCount = occ.length - symCount;
    const pay = occ.some((o) => hasCI(lines[o.line], PAY_KW));
    const exc = occ.some((o) => hasCI(lines[o.line], EXC_KW));
    const taxOk = aux.some((a) => [0.08, 0.1].some((r) => Math.abs(a.value - (value * r) / (1 + r)) <= 1));
    const itemOk = seqSums.has(value);
    const score =
      (pay ? 3 : 0) +
      (exc ? -3 : 0) +
      Math.min(4, symCount) +
      Math.min(1.5, pureCount * 0.5) +
      (taxOk ? 2 : 0) +
      (itemOk ? 2 : 0);
    out.push({ value, score, count: occ.length });
  }
  out.sort((a, b) => b.score - a.score || b.count - a.count || b.value - a.value);
  return out;
}

function findDates(lines) {
  const found = [];
  lines.forEach((l, li) => {
    if (/EXP DATE/i.test(l)) return;
    const res = [
      /(?<!\d)((?:19|20)\d{2})[/.-](\d{1,2})[/.-](\d{1,2})(?!\d)/g,
      /(?<!\d)((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日/g,
    ];
    for (const re of res) {
      let m;
      while ((m = re.exec(l))) {
        const mo = +m[2];
        const d = +m[3];
        if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
        found.push({ li, idx: m.index, v: `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
      }
    }
  });
  found.sort((a, b) => a.li - b.li || a.idx - b.idx);
  return [...new Set(found.map((f) => f.v))];
}

function findTimes(lines) {
  const found = [];
  lines.forEach((l, li) => {
    if (/EXP DATE/i.test(l)) return;
    for (const re of timeRegexes()) {
      let m;
      while ((m = re.exec(l))) {
        if (+m[1] > 23 || +m[2] > 59) continue;
        found.push({ li, idx: m.index, v: `${String(+m[1]).padStart(2, "0")}:${String(+m[2]).padStart(2, "0")}` });
      }
    }
  });
  found.sort((a, b) => a.li - b.li || a.idx - b.idx);
  return [...new Set(found.map((f) => f.v))];
}

function detectCurrency(lines, defaultCurrency) {
  const all = lines.join("\n");
  const yen = all.search(/[¥￥]/);
  const won = all.search(/[₩￦]/);
  if (yen >= 0 && (won < 0 || yen < won)) return "JPY";
  if (won >= 0) return "KRW";
  const hangul = HANGUL_RE.test(all);
  const jp = JP_RE.test(all);
  if (hangul && !jp) return "KRW";
  if (jp && !hangul) return "JPY";
  return defaultCurrency || "미정";
}

function merchantCandidates(lines) {
  const cut = (t) => {
    const m = t.match(/\d{3}-\d{2}-\d{5}/);
    return (m ? t.slice(0, m.index) : t).trim();
  };
  const labels = ["加盟店名", "매장", "[領収書]"];
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    for (const lb of labels) {
      const p = lines[i].indexOf(lb);
      if (p < 0) continue;
      const after = lines[i].slice(p + lb.length).replace(/^[\s:：]+/, "").trim();
      if (after) out.push(cut(after));
      else if (lines[i + 1]) out.push(cut(lines[i + 1]));
    }
  }
  if (out.length === 0) lines.slice(0, 5).forEach((l) => out.push(cut(l)));
  return out.filter(Boolean);
}

function expandToken(line, idx, len) {
  let s = idx;
  let e = idx + len;
  while (s > 0 && TOKEN_CH.test(line[s - 1]) && idx - s < 6) s--;
  while (e < line.length && TOKEN_CH.test(line[e]) && e - idx < 16) e++;
  return line.slice(s, e);
}

function detectPayment(lines) {
  const cash = [];
  const card = [];
  for (const l of lines) {
    if (l.length > MAX_LINE) continue;
    if (SKIP_PM_LINE_KW.some((k) => l.includes(k))) continue;
    for (const re of CASH_RES) {
      const m = re.exec(l);
      if (m) cash.push(expandToken(l, m.index, m[0].length));
    }
    for (const re of CARD_RES) {
      const m = re.exec(l);
      if (m) card.push(expandToken(l, m.index, m[0].length));
    }
  }
  const paymentMethod = cash.length && card.length ? "확인필요" : cash.length ? "현금" : card.length ? "카드" : "미정";
  const noteCandidates = [...new Set([...cash, ...card])]
    .filter((n) => n !== "카드" && !/(?:番号|번호)$/.test(n))
    .slice(0, 3);
  return { paymentMethod, noteCandidates };
}

export function parseReceipt(text, options = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const { cands, aux } = extractNumbers(lines);
  const amountCandidates = scoreAmounts(lines, cands, aux)
    .slice(0, 3)
    .map((c) => ({ value: c.value, score: c.score }));
  const { paymentMethod, noteCandidates } = detectPayment(lines);
  return {
    amountCandidates,
    date: findDates(lines)[0] || null,
    time: findTimes(lines)[0] || null,
    currency: detectCurrency(lines, options.defaultCurrency),
    merchant: merchantCandidates(lines)[0] || "",
    paymentMethod,
    noteCandidates,
  };
}
