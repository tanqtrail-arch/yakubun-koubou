import { useState, useCallback, useRef, useEffect } from "react";

// ─── TRAIL GP3 連携 ───
const TRAIL_API = 'https://trail-game-pro-3-2.onrender.com';
const TRAIL_PLAYER = new URLSearchParams(window.location.search).get('player') || null;

function calcAlt(score) {
  if (score >= 1000) return 30;
  if (score >= 500)  return 20;
  if (score >= 100)  return 10;
  return 5;
}

async function sendResultToTrail(score) {
  if (!TRAIL_PLAYER) return 0;
  const alt = calcAlt(score);
  try {
    await fetch(`${TRAIL_API}/api/external/game-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: TRAIL_PLAYER,
        game_id: 'yakubun-koubou',
        game_name: '約分工房',
        score: score,
        alt: alt
      })
    });
  } catch (e) {
    console.error('ALT送信失敗:', e);
  }
  return alt;
}

function goHome() {
  window.location.href = TRAIL_PLAYER
    ? 'https://trail-game-pro-3-2.onrender.com'
    : window.location.href.split('?')[0];
}

const HAND_MAX = 8;
const DECK_SIZE = 23;
const TURN_TIME = 60;

function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function rollDice(diff) {
  if (diff === "easy") { const p = [1,1,2,2,2,3,3,3,4,4]; return p[Math.floor(Math.random() * p.length)]; }
  if (diff === "hard") { const p = [1,2,3,3,4,4,5,5,6,6]; return p[Math.floor(Math.random() * p.length)]; }
  return Math.floor(Math.random() * 6) + 1;
}
function createDeck() {
  const c = [];
  for (let n = 1; n <= 9; n++) c.push({ type: "number", value: n });
  for (const n of [2, 3, 4, 5, 6]) c.push({ type: "number", value: n });
  for (let i = 0; i < 4; i++) c.push({ type: "multiply" });
  for (let i = 0; i < 5; i++) c.push({ type: "wild" });
  // 9 + 5 + 4 + 5 = 23枚 → 手札8枚引いて残り15枚
  return shuffle(c);
}
function cardLabel(c, wv) {
  if (c.type === "number") return String(c.value);
  if (c.type === "multiply") return "×"; if (c.type === "add") return "＋";
  if (c.type === "subtract") return "−"; if (c.type === "divide") return "÷";
  if (c.type === "wild") return wv != null ? `★${wv}` : "★";
  return "?";
}
const SPECIALS = [
  { id: "redraw", emoji: "🔄", name: "引き直し", cost: 10 },
  { id: "reroll", emoji: "🎲", name: "振り直し", cost: 10 },
  { id: "pick", emoji: "🔢", name: "好きな数字", cost: 15 },
  { id: "pickop", emoji: "✨", name: "好きな演算", cost: 15 },
];
const DIFF_LABELS = { easy: "かんたん", normal: "ふつう", hard: "むずかしい" };
const DIFF_COLORS = { easy: "#4caf50", normal: "#e8b84b", hard: "#e53935" };
function altForStars(s) { return s >= 3 ? 10 : s >= 2 ? 6 : 3; }
function getStars(sc) { return sc >= 300 ? 3 : sc >= 180 ? 2 : 1; }
const STAR_LABELS = ["", "⭐ なかなかの仕上がり！", "⭐⭐ 一流の腕前！", "⭐⭐⭐ 伝説の職人！"];

// Ranking helpers
const DIFFS = ["easy", "normal", "hard"];
function getWeekKey() {
  const now = new Date();
  // Find Monday 4:00 JST of current week
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = jst.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const mon = new Date(jst); mon.setUTCDate(mon.getUTCDate() - diff); mon.setUTCHours(4 - 9, 0, 0, 0); // 4:00 JST = 19:00 UTC prev day
  if (now < mon) mon.setUTCDate(mon.getUTCDate() - 7);
  return `w-${mon.toISOString().slice(0, 10)}`;
}
function rankKey(type, diff) { return `yakubun-rank-${type}-${diff}`; }

export default function YakubunKoubou() {
  const [phase, setPhase] = useState("title");
  const [mode, setMode] = useState("normal");
  const [diff, setDiff] = useState("normal");
  const [deck, setDeck] = useState([]);
  const [hand, setHand] = useState([]);
  const [diceNum, setDiceNum] = useState(null);
  const [diceDen, setDiceDen] = useState(null);
  const [numZone, setNumZone] = useState([]);
  const [denZone, setDenZone] = useState([]);
  const [msg, setMsg] = useState("");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [totalUsed, setTotalUsed] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [happeningMsg, setHappeningMsg] = useState(null);
  const [wildMap, setWildMap] = useState({});
  const [wildPicker, setWildPicker] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOff, setDragOff] = useState({ x: 0, y: 0 });
  const [dragFrom, setDragFrom] = useState(null);
  const [numHov, setNumHov] = useState(false);
  const [denHov, setDenHov] = useState(false);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [reorderTarget, setReorderTarget] = useState(null);
  const [scorePopup, setScorePopup] = useState(null);
  const [specials, setSpecials] = useState({ redraw: 3, reroll: 3, pick: 3, pickop: 3 });
  const [specialPenalty, setSpecialPenalty] = useState(0);
  const [pickPicker, setPickPicker] = useState(false);
  const [opPicker, setOpPicker] = useState(false);
  const [timer, setTimer] = useState(TURN_TIME);
  const [rollDisplay, setRollDisplay] = useState({ n: null, d: null });
  // ALT
  const [totalAlt, setTotalAlt] = useState(0);
  const [sessionAlt, setSessionAlt] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [clearedDiffs, setClearedDiffs] = useState({});
  const [trailAlt, setTrailAlt] = useState(0);
  // Ranking
  const [rankScreen, setRankScreen] = useState(false);
  const [rankTab, setRankTab] = useState("weekly"); // weekly | alltime
  const [rankDiff, setRankDiff] = useState("normal");
  const [rankings, setRankings] = useState({ weekly: { easy: [], normal: [], hard: [] }, alltime: { easy: [], normal: [], hard: [] } });
  const [rankRegistered, setRankRegistered] = useState(false);
  const [rankResult, setRankResult] = useState(null); // { weekly: N, alltime: N }
  const [rankName, setRankName] = useState("");

  const [winW, setWinW] = useState(typeof window !== "undefined" ? window.innerWidth : 400);
  useEffect(() => { const h = () => setWinW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  // Scale: 1.0 for phone (<500), up to 1.6 for tablet (768+)
  const S = winW >= 768 ? 1.6 : winW >= 600 ? 1.3 : 1.0;
  const s = (v) => Math.round(v * S);

  const timerRef = useRef(null);
  const rollAnimRef = useRef(null);
  const numRef = useRef(null);
  const denRef = useRef(null);
  const numCardRefs = useRef({});
  const denCardRefs = useRef({});
  const uidRef = useRef(0);
  const mkUid = () => ++uidRef.current;

  useEffect(() => {
    (async () => { try { const r = await window.storage.get("yakubun-alt"); if (r?.value) { const d = JSON.parse(r.value); setTotalAlt(d.a || 0); setHighScore(d.h || 0); setClearedDiffs(d.c || {}); } } catch {} })();
  }, []);
  const saveAlt = async (a, h, c) => { try { await window.storage.set("yakubun-alt", JSON.stringify({ a, h, c })); } catch {} };

  // Ranking functions
  const loadRankings = async () => {
    const wk = getWeekKey();
    const result = { weekly: { easy: [], normal: [], hard: [] }, alltime: { easy: [], normal: [], hard: [] } };
    for (const d of DIFFS) {
      try {
        const wr = await window.storage.get(rankKey("weekly", d), true);
        if (wr?.value) {
          const data = JSON.parse(wr.value);
          result.weekly[d] = data.week === wk ? (data.entries || []) : [];
        }
      } catch {}
      try {
        const ar = await window.storage.get(rankKey("alltime", d), true);
        if (ar?.value) result.alltime[d] = JSON.parse(ar.value) || [];
      } catch {}
    }
    setRankings(result);
    return result;
  };
  const saveRanking = async (type, d, entries) => {
    if (type === "weekly") {
      await window.storage.set(rankKey("weekly", d), JSON.stringify({ week: getWeekKey(), entries }), true);
    } else {
      await window.storage.set(rankKey("alltime", d), JSON.stringify(entries), true);
    }
  };
  const registerScore = async (name, sc, d) => {
    const r = await loadRankings();
    const update = (list) => {
      const existing = list.findIndex(e => e.name === name);
      if (existing >= 0) { if (sc > list[existing].score) list[existing].score = sc; }
      else list.push({ name, score: sc });
      list.sort((a, b) => b.score - a.score);
      return list.slice(0, 50);
    };
    const wList = update([...r.weekly[d]]);
    const aList = update([...r.alltime[d]]);
    await saveRanking("weekly", d, wList);
    await saveRanking("alltime", d, aList);
    const wRank = wList.findIndex(e => e.name === name) + 1;
    const aRank = aList.findIndex(e => e.name === name) + 1;
    setRankings({ ...r, weekly: { ...r.weekly, [d]: wList }, alltime: { ...r.alltime, [d]: aList } });
    setRankResult({ weekly: wRank, alltime: aRank });
    setRankRegistered(true);
  };

  useEffect(() => { loadRankings(); }, []);

  useEffect(() => {
    if (phase === "playing" && mode === "normal") { timerRef.current = setInterval(() => setTimer(t => { if (t <= 1) { clearInterval(timerRef.current); return 0; } return t - 1; }), 1000); return () => clearInterval(timerRef.current); } else clearInterval(timerRef.current);
  }, [phase, mode]);
  useEffect(() => {
    if (timer === 0 && phase === "playing" && mode === "normal") {
      const all = [...hand, ...numZone, ...denZone]; setNumZone([]); setDenZone([]); setWildMap({}); setCombo(0); setMsg("⏰ タイムオーバー！"); setRound(r => r + 1);
      const willEnd = deck.length <= 0 && all.length < HAND_MAX;
      if (willEnd) setTimeout(() => setPhase("gameOver"), 800);
      else { setPhase("autoRolling"); setTimeout(() => doRoll(all, deck), 1000); }
    }
  }, [timer]);
  useEffect(() => {
    if (phase === "title") return;
    const prevent = (e) => { if (e.target.closest?.("[data-scrollable]")) return; e.preventDefault(); };
    document.addEventListener("touchmove", prevent, { passive: false });
    const s = document.body.style; const p = { overflow: s.overflow, position: s.position, width: s.width, height: s.height };
    s.overflow = "hidden"; s.position = "fixed"; s.width = "100%"; s.height = "100%";
    return () => { document.removeEventListener("touchmove", prevent); Object.assign(s, p); };
  }, [phase]);

  // Game over ALT calc
  useEffect(() => {
    if (phase !== "gameOver") return;
    const st = getStars(score); const starB = altForStars(st);
    const key = `${diff}-${mode}`;
    const isFirst = !clearedDiffs[key];
    const firstB = isFirst ? 5 : 0;
    const earned = starB + firstB;
    setSessionAlt(earned);
    const newHi = Math.max(highScore, score);
    const newTotal = totalAlt + earned;
    const newCl = { ...clearedDiffs, [key]: true };
    setTotalAlt(newTotal); setHighScore(newHi); setClearedDiffs(newCl);
    saveAlt(newTotal, newHi, newCl);
    // TRAIL GP3: send result
    sendResultToTrail(score).then(alt => setTrailAlt(alt));
  }, [phase]);

  const startGame = useCallback((m, d) => {
    uidRef.current = 0;
    const dk = createDeck().map(c => ({ ...c, uid: mkUid() })); const h = dk.splice(0, HAND_MAX);
    setDeck(dk); setHand(h); setMode(m); setDiff(d);
    setDiceNum(null); setDiceDen(null); setNumZone([]); setDenZone([]);
    setMsg("サイコロを振ろう！"); setRound(1); setScore(0); setTotalUsed(0); setCombo(0); setMaxCombo(0);
    setPhase("rolling"); setWildMap({}); setWildPicker(null);
    setReorderTarget(null); setScorePopup(null); setPickPicker(false); setOpPicker(false);
    setSpecials({ redraw: 3, reroll: 3, pick: 3, pickop: 3 }); setSpecialPenalty(0); setSessionAlt(0); setTimer(TURN_TIME);
    setRankRegistered(false); setRankResult(null); setTrailAlt(0);
  }, []);

  const hit = (r, x, y) => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const getXY = (e) => { if (e.touches?.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY }; if (e.changedTouches?.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }; return { x: e.clientX, y: e.clientY }; };
  const findIns = (zone, zn, px) => { const refs = zn === "num" ? numCardRefs.current : denCardRefs.current; for (let i = 0; i < zone.length; i++) { const el = refs[zone[i].uid]; if (!el) continue; if (px < el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2) return i; } return zone.length; };
  const onPD = (e, card, from) => { if (phase !== "playing" || wildPicker || pickPicker || opPicker) return; e.preventDefault(); e.stopPropagation(); const { x, y } = getXY(e); const r = e.currentTarget.getBoundingClientRect(); setDragOff({ x: x - r.left, y: y - r.top }); setDragPos({ x, y }); setDragging(card); setDragFrom(from); setReorderTarget(null); };
  const onPM = (e) => { if (!dragging) return; e.preventDefault(); e.stopPropagation(); const { x, y } = getXY(e); setDragPos({ x, y }); const iN = hit(numRef.current?.getBoundingClientRect(), x, y), iD = hit(denRef.current?.getBoundingClientRect(), x, y); setNumHov(iN); setDenHov(iD); if (iN) setReorderTarget({ zone: "num", index: findIns(numZone.filter(c => c.uid !== dragging.uid), "num", x) }); else if (iD) setReorderTarget({ zone: "den", index: findIns(denZone.filter(c => c.uid !== dragging.uid), "den", x) }); else setReorderTarget(null); };
  const onPU = (e) => {
    if (!dragging) return; e.preventDefault(); e.stopPropagation();
    const card = dragging, from = dragFrom, { x, y } = getXY(e);
    const iN = hit(numRef.current?.getBoundingClientRect(), x, y), iD = hit(denRef.current?.getBoundingClientRect(), x, y);
    if (iN) {
      if (from === "hand") setHand(h => h.filter(c => c.uid !== card.uid)); else if (from === "den") setDenZone(z => z.filter(c => c.uid !== card.uid));
      const f = numZone.filter(c => c.uid !== card.uid), idx = reorderTarget?.zone === "num" ? Math.min(reorderTarget.index, f.length) : f.length; const nz = [...f]; nz.splice(idx, 0, card); setNumZone(nz);
      if (card.type === "wild" && wildMap[card.uid] == null && from !== "num" && from !== "den") setWildPicker(card.uid);
    } else if (iD) {
      if (from === "hand") setHand(h => h.filter(c => c.uid !== card.uid)); else if (from === "num") setNumZone(z => z.filter(c => c.uid !== card.uid));
      const f = denZone.filter(c => c.uid !== card.uid), idx = reorderTarget?.zone === "den" ? Math.min(reorderTarget.index, f.length) : f.length; const nz = [...f]; nz.splice(idx, 0, card); setDenZone(nz);
      if (card.type === "wild" && wildMap[card.uid] == null && from !== "num" && from !== "den") setWildPicker(card.uid);
    } else if (from !== "hand") {
      if (from === "num") setNumZone(z => z.filter(c => c.uid !== card.uid)); else if (from === "den") setDenZone(z => z.filter(c => c.uid !== card.uid));
      if (card.type === "wild") setWildMap(w => { const n = { ...w }; delete n[card.uid]; return n; }); setHand(h => [...h, card]);
    }
    setDragging(null); setDragFrom(null); setNumHov(false); setDenHov(false); setReorderTarget(null);
  };
  const refill = (h, d) => { const need = Math.max(0, HAND_MAX - h.length), dc = Math.min(need, d.length); if (dc <= 0) return { nh: h, nd: d }; return { nh: [...h, ...d.slice(0, dc)], nd: d.slice(dc) }; };
  const isGameEnd = (h, d) => d.length <= 0 && h.length < HAND_MAX;

  const doRoll = (cH, cD) => {
    setRolling(true); setNumZone([]); setDenZone([]); setWildMap({});
    const { nh, nd } = refill(cH, cD); setHand(nh); setDeck(nd); setTimer(TURN_TIME);
    // Game end check: deck empty and hand not full
    if (nd.length <= 0 && nh.length < HAND_MAX) {
      setRolling(false); setRollDisplay({ n: null, d: null });
      setTimeout(() => setPhase("gameOver"), 600); return;
    }
    let tick = 0;
    rollAnimRef.current = setInterval(() => { setRollDisplay({ n: Math.floor(Math.random() * 6) + 1, d: Math.floor(Math.random() * 6) + 1 }); tick++; if (tick > 5) { clearInterval(rollAnimRef.current); rollAnimRef.current = null; } }, 150);
    setTimeout(() => {
      clearInterval(rollAnimRef.current); rollAnimRef.current = null;
      const n = rollDice(diff), d = rollDice(diff); setDiceNum(n); setDiceDen(d); setRollDisplay({ n: null, d: null }); setRolling(false);
      if (d === 5) {
        const haps = { 1: { emoji: "🎉", text: "ボーナス！", detail: "+5pt", good: true }, 2: { emoji: "😱", text: "手札−1枚", detail: "", good: false }, 3: { emoji: "🃏", text: "ラッキー！", detail: "+2枚", good: true }, 4: { emoji: "🎁", text: "大当たり！", detail: "+15pt", good: true }, 5: { emoji: "💔", text: "コンボ消滅", detail: "", good: false }, 6: { emoji: "🌟", text: "ボーナス！", detail: "+10pt", good: true } };
        setHappeningMsg(haps[n]); setPhase("happeningShow");
        setTimeout(() => {
          if (n === 1) setScore(s => s + 5); if (n === 2) setHand(h => h.length > 0 ? h.slice(0, -1) : h);
          if (n === 3) setDeck(dk => { const x = Math.min(2, dk.length); if (x > 0) { setHand(hh => [...hh, ...dk.slice(0, x)]); return dk.slice(x); } return dk; });
          if (n === 4) setScore(s => s + 15); if (n === 5) setCombo(0); if (n === 6) setScore(s => s + 10);
          setTimeout(() => { setRound(r => r + 1); setDeck(dk => { setHand(hh => { if (dk.length <= 0 && hh.length < HAND_MAX) { setTimeout(() => setPhase("gameOver"), 100); } else { setPhase("rolling"); setMsg("次へ"); } return hh; }); return dk; }); }, 1500);
        }, 800);
      } else { setMsg(nd.length <= 0 ? "ラスト！" : `${n}/${d}`); setPhase("playing"); }
    }, 800);
  };
  const handleRoll = () => doRoll([...hand, ...numZone, ...denZone], deck);

  const isOp = (c) => c.type === "multiply" || c.type === "add" || c.type === "subtract" || c.type === "divide";
  const getVal = (c) => c.type === "wild" ? (wildMap[c.uid] != null ? wildMap[c.uid] : null) : c.value;
  const applyOp = (a, op, b) => { if (op === "add") return a + b; if (op === "subtract") return a - b; if (op === "multiply") return a * b; if (op === "divide") return b !== 0 && a % b === 0 ? a / b : null; return null; };
  const calcVal = (zone) => {
    if (zone.length === 0) return null;
    const tokens = []; let digitBuf = null;
    for (const c of zone) {
      if (isOp(c)) { if (digitBuf !== null) { tokens.push({ type: "val", v: digitBuf }); digitBuf = null; } tokens.push({ type: "op", op: c.type }); }
      else { const v = getVal(c); if (v == null) return null; digitBuf = digitBuf !== null ? digitBuf * 10 + v : v; }
    }
    if (digitBuf !== null) tokens.push({ type: "val", v: digitBuf });
    if (tokens.length === 0) return null;
    if (tokens.length === 1 && tokens[0].type === "val") return tokens[0].v;
    let result = null, pendingOp = null;
    for (const t of tokens) {
      if (t.type === "op") { if (result === null) return null; pendingOp = t.op; }
      else { if (result === null) result = t.v; else if (pendingOp) { result = applyOp(result, pendingOp, t.v); if (result === null) return null; pendingOp = null; } else return null; }
    }
    return pendingOp ? null : result;
  };

  const handleSubmit = () => {
    if (numZone.length === 0 || denZone.length === 0) { setMsg("分子と分母に置いてね"); return; }
    for (const c of [...numZone, ...denZone]) { if (c.type === "wild" && wildMap[c.uid] == null) { setMsg("化札の値を選んで"); return; } }
    const nv = calcVal(numZone), dv = calcVal(denZone);
    if (nv == null || dv == null || dv === 0) { setMsg("正しい数にして"); return; }
    if (Math.abs(nv / dv - diceNum / diceDen) > 0.0001) { setMsg(`${nv}/${dv} ≠ ${diceNum}/${diceDen}`); return; }
    const used = numZone.length + denZone.length, nc = combo + 1; if (nc > maxCombo) setMaxCombo(nc);
    const base = used * 10, cb = Math.floor(base * (nc - 1) * 0.3), pts = base + cb;
    setCombo(nc); setScore(s => s + pts); setTotalUsed(t => t + used);
    setScorePopup({ points: pts, combo: nc, key: Date.now() }); setTimeout(() => setScorePopup(null), 1400);
    const rem = [...hand]; setNumZone([]); setDenZone([]); setWildMap({}); setRound(r => r + 1);
    const willEnd = deck.length <= 0 && rem.length < HAND_MAX;
    if (willEnd) { setTimeout(() => setPhase("gameOver"), 1000); }
    else { setPhase("autoRolling"); setMsg(`+${pts}pt！`); setTimeout(() => doRoll(rem, deck), 1000); }
  };
  const handlePass = () => {
    setCombo(0);
    const all = [...hand, ...numZone, ...denZone]; setNumZone([]); setDenZone([]); setWildMap({}); setMsg("パス…"); setRound(r => r + 1);
    const willEnd = deck.length <= 0 && all.length < HAND_MAX;
    if (willEnd) setTimeout(() => setPhase("gameOver"), 600);
    else { setPhase("autoRolling"); setTimeout(() => doRoll(all, deck), 800); }
  };

  const canUseSpecial = (id) => specials[id] > 0 && phase !== "gameOver" && phase !== "title" && phase !== "happeningShow" && !rolling;
  const useSpecial = (id) => {
    if (!canUseSpecial(id)) return;
    const sp = SPECIALS.find(s => s.id === id);
    setSpecials(s => ({ ...s, [id]: s[id] - 1 })); setSpecialPenalty(p => p + sp.cost); setScore(s => Math.max(0, s - sp.cost));
    if (id === "redraw") { const all = shuffle([...deck, ...hand, ...numZone, ...denZone]); setNumZone([]); setDenZone([]); setWildMap({}); setHand(all.slice(0, HAND_MAX).map(c => ({ ...c, uid: c.uid || mkUid() }))); setDeck(all.slice(HAND_MAX)); setMsg(`🔄 引き直し（-${sp.cost}pt）`); }
    if (id === "reroll") { setHand(h => [...h, ...numZone, ...denZone]); setNumZone([]); setDenZone([]); setWildMap({}); setRolling(true); setTimer(TURN_TIME); let tick = 0; rollAnimRef.current = setInterval(() => { setRollDisplay({ n: Math.floor(Math.random() * 6) + 1, d: Math.floor(Math.random() * 6) + 1 }); tick++; if (tick > 5) clearInterval(rollAnimRef.current); }, 150); setTimeout(() => { clearInterval(rollAnimRef.current); const n = rollDice(diff), d = rollDice(diff); setDiceNum(n); setDiceDen(d); setRollDisplay({ n: null, d: null }); setRolling(false); setMsg(`🎲 ${n}/${d}（-${sp.cost}pt）`); if (phase === "rolling") setPhase("playing"); }, 800); }
    if (id === "pick") { setPickPicker(true); setMsg(`（-${sp.cost}pt）`); }
    if (id === "pickop") { setOpPicker(true); setMsg(`（-${sp.cost}pt）`); }
  };

  const nv = calcVal(numZone), dv = calcVal(denZone);
  const match = nv != null && dv != null && dv !== 0 && Math.abs(nv / dv - diceNum / diceDen) < 0.0001;
  const previewPts = match ? (numZone.length + denZone.length) * 10 + Math.floor((numZone.length + denZone.length) * 10 * combo * 0.3) : 0;

  const P = "#faf3e6", INK = "#3e2723", W = "linear-gradient(180deg,#d4a96a,#c49556 40%,#b8894d)", WD = "linear-gradient(180deg,#7a6340,#6b5636)", WM = "#e8b84b", RA = "#c0392b", BA = "#2e86ab";
  const ZW = s(36), ZH = s(50), HW = s(46), HH = s(58);

  const cSt = (card, sm) => {
    const isW = card.type === "wild", isOpc = isOp(card); const w = sm ? ZW : HW, h = sm ? ZH : HH;
    return { width: w, height: h, borderRadius: sm ? s(5) : s(7), background: isW ? "linear-gradient(180deg,#fff8e1,#ffe0b2)" : isOpc ? "linear-gradient(180deg,#f3e5f5,#e1bee7)" : `linear-gradient(180deg,${P},#f0e6d3)`, border: `2px solid ${isW ? "#e67e22" : isOpc ? "#8e44ad" : "#a08060"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: phase === "playing" ? "grab" : "default", fontFamily: "'Zen Maru Gothic',serif", color: isW ? "#e65100" : isOpc ? "#6a1b9a" : INK, userSelect: "none", touchAction: "none", WebkitUserSelect: "none", boxShadow: "1px 2px 4px rgba(62,39,35,0.18)", flexShrink: 0 };
  };
  const opLbl = { multiply: "乗札", add: "加札", subtract: "減札", divide: "除札" };
  const rCard = (card, from, refMap) => {
    const wv = wildMap[card.uid], isDrag = dragging?.uid === card.uid, sm = from === "num" || from === "den";
    return (<div key={card.uid} ref={el => { if (refMap) refMap[card.uid] = el; }} onPointerDown={e => onPD(e, card, from)} onTouchStart={e => onPD(e, card, from)} style={{ ...cSt(card, sm), opacity: isDrag ? 0.2 : 1 }}><span style={{ fontSize: sm ? s(15) : s(20), fontWeight: 800, lineHeight: 1 }}>{cardLabel(card, wv)}</span>{opLbl[card.type] && <span style={{ fontSize: s(7), fontWeight: 700, opacity: 0.6 }}>{opLbl[card.type]}</span>}{card.type === "wild" && wv == null && <span style={{ fontSize: s(7), fontWeight: 700, opacity: 0.6 }}>化札</span>}</div>);
  };
  const rGhost = () => { if (!dragging) return null; return (<div style={{ ...cSt(dragging, false), position: "fixed", left: dragPos.x - dragOff.x, top: dragPos.y - dragOff.y, boxShadow: "0 8px 28px rgba(62,39,35,0.35)", zIndex: 9999, pointerEvents: "none", transform: "rotate(3deg) scale(1.08)" }}><span style={{ fontSize: s(20), fontWeight: 800 }}>{cardLabel(dragging, wildMap[dragging.uid])}</span></div>); };
  const rZone = (label, zone, ref, hov, accent, crm) => {
    const val = calcVal(zone), zn = label === "分子" ? "num" : "den", si = reorderTarget?.zone === zn && dragging, ii = si ? reorderTarget.index : -1, dz = zone.filter(c => c.uid !== dragging?.uid);
    return (<div ref={ref} style={{ minHeight: ZH + s(10), borderRadius: s(9), width: "100%", background: hov ? "rgba(232,184,75,0.22)" : "rgba(255,255,255,0.3)", border: hov ? `2.5px solid ${WM}` : "2px dashed rgba(139,111,71,0.3)", padding: `${s(3)}px ${s(4)}px`, display: "flex", alignItems: "center", gap: s(4), transition: "all 0.15s" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: s(30) }}><span style={{ fontSize: s(10), fontWeight: 800, color: accent }}>{label}</span><span style={{ fontSize: s(16), fontWeight: 900, color: INK }}>{val ?? "—"}</span></div>
      <div style={{ display: "flex", gap: s(2), flex: 1, minHeight: ZH, alignItems: "center" }}>
        {dz.length === 0 && !si && <span style={{ fontSize: s(10), color: "rgba(139,111,71,0.3)", fontStyle: "italic" }}>{hov ? "＋" : "← ドラッグ"}</span>}
        {dz.map((c, i) => (<div key={c.uid} style={{ display: "flex", alignItems: "center" }}>{si && ii === i && <div style={{ width: 3, height: ZH - 4, background: WM, borderRadius: 2, flexShrink: 0 }} />}{rCard(c, zn, crm)}</div>))}
        {si && ii >= dz.length && <div style={{ width: 3, height: ZH - 4, background: WM, borderRadius: 2, flexShrink: 0 }} />}
      </div>
    </div>);
  };
  const tPct = mode === "normal" ? (timer / TURN_TIME) * 100 : 100;
  const tCol = timer <= 10 ? "#e53935" : timer <= 20 ? "#ff9800" : "#4caf50";

  // ========== TITLE ==========
  if (phase === "title") return (
    <div data-scrollable="true" style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f5e6c8,#e8d5a8 30%,#d4b88c)", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Zen Maru Gothic',serif", color: INK, padding: "16px 16px 24px", textAlign: "center", position: "relative", overflowY: "auto" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700;900&display=swap');@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}`}</style>

      {/* ALT badge */}
      <div style={{ position: "fixed", top: 10, right: 10, zIndex: 200, background: "linear-gradient(135deg,#1b5e20,#2e7d32)", color: "#a5d6a7", padding: "6px 14px", borderRadius: 12, fontSize: 15, fontWeight: 900, boxShadow: "0 2px 10px rgba(27,94,32,0.3)", border: "2px solid #4caf50" }}>🪙 {totalAlt} <span style={{ fontSize: 10, opacity: 0.8 }}>ALT</span></div>

      <div style={{ animation: "float 3s ease-in-out infinite", marginBottom: s(10), marginTop: s(32) }}>
        <div style={{ fontSize: s(48), fontWeight: 900, letterSpacing: 6, textShadow: "2px 2px 0 rgba(212,169,106,0.6)" }}>約分工房</div>
        <div style={{ width: 80, height: 3, background: WM, margin: "8px auto 0", borderRadius: 2 }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#8b6f47", fontWeight: 700, marginBottom: 6 }}>🎯 難易度</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {["easy", "normal", "hard"].map(d => (
            <button key={d} onClick={() => setDiff(d)} style={{ padding: "8px 14px", borderRadius: 10, cursor: "pointer", background: diff === d ? DIFF_COLORS[d] : "rgba(255,255,255,0.4)", color: diff === d ? "#fff" : "#5d4037", border: diff === d ? `2.5px solid ${DIFF_COLORS[d]}` : "2px solid rgba(160,128,96,0.3)", fontFamily: "'Zen Maru Gothic',serif", fontSize: 14, fontWeight: 900 }}>{DIFF_LABELS[d]}{clearedDiffs[`${d}-normal`] && " ✓"}</button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#a08060", marginTop: 4 }}>{diff === "easy" ? "目が小さめ（1〜4）" : diff === "hard" ? "目が大きめ" : "目は1〜6"}</div>
      </div>

      <div style={{ display: "flex", gap: s(12), marginBottom: s(10) }}>
        <button onClick={() => startGame("normal", diff)} style={{ padding: `${s(14)}px ${s(28)}px`, fontSize: s(18), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: W, color: "#fff", border: "3px solid #a08060", borderRadius: s(14), cursor: "pointer", letterSpacing: 3 }}>⏱️ 本番<br /><span style={{ fontSize: s(11) }}>60秒制</span></button>
        <button onClick={() => startGame("practice", diff)} style={{ padding: `${s(14)}px ${s(28)}px`, fontSize: s(18), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: "linear-gradient(180deg,#81c784,#66bb6a)", color: "#fff", border: "3px solid #4caf50", borderRadius: s(14), cursor: "pointer", letterSpacing: 3 }}>📝 練習<br /><span style={{ fontSize: s(11) }}>無制限</span></button>
      </div>

      <div style={{ background: `linear-gradient(180deg,${P},#f0e6d3)`, border: "2px solid #a08060", borderRadius: 12, padding: "10px 16px", maxWidth: 320, fontSize: 12, color: "#5d4037", lineHeight: 1.9, marginBottom: 12 }}>
        🎲 サイコロで分数の注文がくる<br />🃏 手札で同じ値の分数を作ろう<br />📦 カードを多く使うほど高得点<br />🪙 納品するとALTが貯まる！
      </div>

      <button onClick={() => { loadRankings(); setRankScreen(true); setRankDiff(diff); }} style={{ padding: `${s(10)}px ${s(24)}px`, fontSize: s(16), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: "linear-gradient(135deg,#e67e22,#d35400)", color: "#fff", border: "3px solid #bf6516", borderRadius: s(12), cursor: "pointer", letterSpacing: 3, marginBottom: 16, boxShadow: "0 2px 10px rgba(230,126,34,0.3)" }}>🏆 ランキング</button>

      {/* Ranking Screen */}
      {rankScreen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(3px)" }}>
          <div style={{ background: `linear-gradient(180deg,${P},#f0e6d3)`, borderRadius: 16, padding: "16px 14px", border: "3px solid #a08060", maxWidth: 380, width: "92%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: INK }}>🏆 ランキング</div>
              <button onClick={() => setRankScreen(false)} style={{ background: "rgba(139,111,71,0.12)", border: "none", color: "#8b6f47", padding: "4px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'Zen Maru Gothic',serif", fontWeight: 800 }}>✕</button>
            </div>
            {/* Type tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[["weekly", "📅 週間"], ["alltime", "👑 歴代"]].map(([k, l]) => (
                <button key={k} onClick={() => setRankTab(k)} style={{ flex: 1, padding: "6px", borderRadius: 8, fontSize: 13, fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: rankTab === k ? "linear-gradient(135deg,#e67e22,#d35400)" : "rgba(139,111,71,0.1)", color: rankTab === k ? "#fff" : "#8b6f47", border: rankTab === k ? "2px solid #bf6516" : "1.5px solid rgba(139,111,71,0.2)", cursor: "pointer" }}>{l}</button>
              ))}
            </div>
            {/* Diff tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {DIFFS.map(d => (
                <button key={d} onClick={() => setRankDiff(d)} style={{ flex: 1, padding: "5px", borderRadius: 8, fontSize: 11, fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: rankDiff === d ? DIFF_COLORS[d] : "rgba(139,111,71,0.06)", color: rankDiff === d ? "#fff" : "#8b6f47", border: rankDiff === d ? `2px solid ${DIFF_COLORS[d]}` : "1.5px solid rgba(139,111,71,0.15)", cursor: "pointer" }}>{DIFF_LABELS[d]}</button>
              ))}
            </div>
            {/* List */}
            <div data-scrollable="true" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {(rankings[rankTab]?.[rankDiff] || []).length === 0 && (
                <div style={{ textAlign: "center", color: "#a08060", fontSize: 13, padding: 20 }}>まだ記録がありません</div>
              )}
              {(rankings[rankTab]?.[rankDiff] || []).slice(0, 10).map((e, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                const isTop3 = i < 3;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: isTop3 ? "rgba(230,126,34,0.08)" : (i % 2 === 0 ? "rgba(255,255,255,0.3)" : "transparent"), borderRadius: 8, marginBottom: 2 }}>
                    <div style={{ width: 32, textAlign: "center", fontSize: isTop3 ? 20 : 14, fontWeight: 900, color: isTop3 ? "#e65100" : "#8b6f47" }}>{medal}</div>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: INK }}>{e.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: RA }}>{e.score}<span style={{ fontSize: 10 }}>pt</span></div>
                  </div>
                );
              })}
            </div>
            {rankTab === "weekly" && <div style={{ fontSize: 9, color: "#a08060", marginTop: 6, textAlign: "center" }}>毎週月曜 4:00にリセット</div>}
          </div>
        </div>
      )}
    </div>
  );

  // ========== GAME ==========
  const deckMax = DECK_SIZE - HAND_MAX;
  const deckPct = deckMax > 0 ? Math.round((deck.length / deckMax) * 100) : 0;
  const handTotal = hand.length + numZone.length + denZone.length;
  const finalScore = Math.max(0, score);
  const stars = getStars(finalScore);

  return (
    <div onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU} onTouchMove={onPM} onTouchEnd={onPU} onTouchCancel={onPU}
      style={{ height: "100vh", overflow: "hidden", background: "linear-gradient(180deg,#e8d5a8,#d4b88c 50%,#c4a87a)", fontFamily: "'Zen Maru Gothic',serif", color: INK, padding: "3px", display: "flex", flexDirection: "column", gap: 2, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", position: "relative", overscrollBehavior: "none", maxWidth: 700, margin: "0 auto", width: "100%" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700;900&display=swap');@keyframes diceRoll{0%{transform:rotate(0) scale(1)}50%{transform:rotate(180deg) scale(1.2)}100%{transform:rotate(360deg) scale(1)}}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes popUp{0%{opacity:0;transform:translate(-50%,-40%) scale(0.5)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}40%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1;transform:translate(-50%,-60%) scale(1)}100%{opacity:0;transform:translate(-50%,-80%) scale(0.8)}}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes altUp{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-40px)}}@keyframes slideInOut{0%{opacity:0;transform:translateX(30px)}10%{opacity:1;transform:translateX(0)}80%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(-30px)}}@keyframes countPop{0%{opacity:0;transform:scale(0.3)}30%{opacity:1;transform:scale(1.2)}60%{transform:scale(1)}100%{opacity:0.6;transform:scale(1)}}*{box-sizing:border-box;margin:0;padding:0}html,body{overflow:hidden;overscroll-behavior:none}`}</style>
      {rGhost()}
      {scorePopup && (<div key={scorePopup.key} style={{ position: "absolute", top: "35%", left: "50%", zIndex: 150, pointerEvents: "none", animation: "popUp 1.4s ease-out forwards" }}><div style={{ background: "linear-gradient(135deg,#ff6f00,#ff8f00)", color: "#fff", borderRadius: 16, padding: "14px 28px", textAlign: "center", boxShadow: "0 4px 24px rgba(255,111,0,0.4)", border: "3px solid #ffe082" }}><div style={{ fontSize: 36, fontWeight: 900 }}>+{scorePopup.points}<span style={{ fontSize: 16 }}>pt</span></div>{scorePopup.combo > 1 && <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>🔥{scorePopup.combo}コンボ！</div>}</div></div>)}

      {/* Header - NO ALT during play */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${s(4)}px ${s(8)}px`, background: WD, borderRadius: s(10), flexShrink: 0 }}>
        <div style={{ fontSize: s(15), fontWeight: 900, color: "#faf3e6", letterSpacing: 3 }}>🔨 約分工房</div>
        <div style={{ display: "flex", gap: s(6), alignItems: "center" }}>
          <span style={{ fontSize: s(9), color: DIFF_COLORS[diff], fontWeight: 800, background: `${DIFF_COLORS[diff]}22`, padding: "1px 5px", borderRadius: 4 }}>{DIFF_LABELS[diff]}</span>
          {mode === "practice" && <span style={{ fontSize: s(9), color: "#a5d6a7", fontWeight: 800, background: "rgba(165,214,167,0.15)", padding: "1px 5px", borderRadius: 4 }}>練習</span>}
          <span style={{ fontSize: s(11), color: "rgba(250,243,230,0.6)", fontWeight: 700 }}>R{round}</span>
          {combo > 1 && <span style={{ fontSize: s(11), color: "#ffd54f", fontWeight: 900 }}>🔥{combo}</span>}
          {mode === "normal" && phase === "playing" && <span style={{ fontSize: s(16), fontWeight: 900, color: timer <= 10 ? "#ff5252" : timer <= 20 ? "#ffab40" : "#faf3e6", minWidth: s(32), textAlign: "right", animation: timer <= 10 ? "pulse 0.5s infinite" : "none" }}>{timer}s</span>}
        </div>
        <button onClick={() => setPhase("title")} style={{ background: "rgba(250,243,230,0.15)", border: "none", color: "rgba(250,243,230,0.6)", padding: `${s(3)}px ${s(10)}px`, borderRadius: s(7), cursor: "pointer", fontSize: s(11), fontFamily: "'Zen Maru Gothic',serif", fontWeight: 700 }}>✕</button>
      </div>
      {mode === "normal" && phase === "playing" && (<div style={{ height: 5, background: "rgba(139,111,71,0.15)", borderRadius: 3, margin: "0 2px", flexShrink: 0 }}><div style={{ height: "100%", width: `${tPct}%`, background: tCol, borderRadius: 3, transition: "width 1s linear, background 0.3s" }} /></div>)}

      <div style={{ display: "flex", gap: 3, padding: "0 1px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.45)", borderRadius: 10, padding: "4px 10px", border: "2px solid rgba(192,57,43,0.15)", flex: 1.5 }}>
          <span style={{ fontSize: s(20) }}>🏆</span>
          <div><div style={{ fontSize: s(9), color: "#8b6f47", fontWeight: 700 }}>スコア</div><div style={{ fontSize: s(24), fontWeight: 900, color: RA, lineHeight: 1 }}>{score}<span style={{ fontSize: s(10) }}>pt</span></div>{specialPenalty > 0 && <div style={{ fontSize: s(8), color: "#999", fontWeight: 700 }}>スキル: -{specialPenalty}</div>}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, background: deck.length <= 5 ? "rgba(192,57,43,0.1)" : "rgba(255,255,255,0.35)", borderRadius: 10, padding: "4px 8px", border: deck.length <= 5 ? "2px solid rgba(192,57,43,0.3)" : "1px solid rgba(160,128,96,0.3)", flex: 1 }}>
          <span style={{ fontSize: s(16) }}>📦</span>
          <div><div style={{ fontSize: s(9), color: "#8b6f47", fontWeight: 700 }}>山札</div><div style={{ fontSize: s(18), fontWeight: 900, color: deck.length <= 5 ? RA : BA }}>残{deck.length}</div>{deck.length <= 5 && deck.length > 0 && <div style={{ fontSize: s(9), fontWeight: 800, color: RA }}>あと{deck.length}枚！</div>}{deck.length === 0 && <div style={{ fontSize: s(9), fontWeight: 800, color: RA }}>ラスト！</div>}</div>
        </div>
      </div>
      <div style={{ height: 4, background: "rgba(139,111,71,0.15)", borderRadius: 2, margin: "0 2px", flexShrink: 0 }}><div style={{ height: "100%", width: `${deckPct}%`, background: deck.length <= 5 ? RA : WM, borderRadius: 2, transition: "width 0.4s" }} /></div>

      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <div style={{ background: `linear-gradient(180deg,${P},#f0e6d3)`, border: "2px solid #a08060", borderRadius: s(12), padding: `${s(6)}px ${s(8)}px`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: s(3), minWidth: s(72) }}>
          <div style={{ fontSize: s(10), color: "#8b6f47", fontWeight: 800, letterSpacing: 2 }}>📋注文</div>
          <div style={{ width: s(54), height: s(54), borderRadius: s(10), background: "linear-gradient(135deg,#5c9ead,#4a8a99)", border: "3px solid #3d7a88", display: "flex", alignItems: "center", justifyContent: "center", fontSize: s(30), fontWeight: 900, color: "#fff", boxShadow: "1px 2px 8px rgba(0,0,0,0.2)", animation: rolling ? "diceRoll 0.4s" : "none" }}>{rolling ? (rollDisplay.n || "?") : (diceNum || "?")}</div>
          <div style={{ width: s(50), height: s(5), background: "#8b6f47", borderRadius: 3 }} />
          <div style={{ width: s(54), height: s(54), borderRadius: s(10), background: "linear-gradient(135deg,#c0392b,#a93226)", border: "3px solid #922b21", display: "flex", alignItems: "center", justifyContent: "center", fontSize: s(30), fontWeight: 900, color: "#fff", boxShadow: "1px 2px 8px rgba(0,0,0,0.2)", animation: rolling ? "diceRoll 0.4s" : "none" }}>{rolling ? (rollDisplay.d || "?") : (diceDen || "?")}</div>
          {phase === "rolling" && !rolling && (<button onClick={handleRoll} style={{ marginTop: s(3), padding: `${s(7)}px ${s(14)}px`, fontSize: s(14), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: W, color: "#fff", border: "2px solid #a08060", borderRadius: s(10), cursor: "pointer", letterSpacing: 2 }}>🎲振る</button>)}
          {(rolling || phase === "autoRolling") && <div style={{ fontSize: s(12), color: "#8b6f47", fontWeight: 700, marginTop: s(3) }}>🎲 コロコロ…</div>}
        </div>
        {(phase === "playing" || phase === "autoRolling") && (
          <div style={{ flex: 1, background: "rgba(255,255,255,0.22)", borderRadius: 12, border: "2px solid rgba(160,128,96,0.3)", padding: "4px 5px", display: "flex", flexDirection: "column", gap: 0, minWidth: 0, animation: "fadeIn 0.3s" }}>
            <div style={{ fontSize: 10, color: "#8b6f47", fontWeight: 700, textAlign: "center", letterSpacing: 2, marginBottom: 2 }}>🪵 作業台</div>
            {rZone("分子", numZone, numRef, numHov, BA, numCardRefs.current)}
            <div style={{ width: "95%", height: 4, background: "#8b6f47", borderRadius: 2, margin: "2px auto" }} />
            {rZone("分母", denZone, denRef, denHov, RA, denCardRefs.current)}
          </div>
        )}
        {phase === "happeningShow" && <div style={{ flex: 1, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 14, color: "#8b6f47", fontWeight: 700 }}>⚡…</div></div>}
      </div>

      {phase === "happeningShow" && happeningMsg && (
        <div style={{ position: "absolute", inset: 0, background: happeningMsg.good ? "rgba(27,94,32,0.55)" : "rgba(183,28,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, backdropFilter: "blur(3px)", animation: "fadeIn 0.3s" }}>
          <div style={{ textAlign: "center", padding: "28px 24px", background: happeningMsg.good ? "linear-gradient(180deg,#e8f5e9,#c8e6c9)" : "linear-gradient(180deg,#fce4ec,#f8bbd0)", border: `3px solid ${happeningMsg.good ? "#4caf50" : "#e53935"}`, borderRadius: 20, margin: "0 20px", maxWidth: 300, width: "100%" }}>
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>{happeningMsg.emoji}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: happeningMsg.good ? "#4caf50" : "#e53935", padding: "3px 14px", borderRadius: 12, display: "inline-block", letterSpacing: 3, marginBottom: 8 }}>⚡ ハプニング</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: happeningMsg.good ? "#2e7d32" : "#c62828", marginBottom: 6 }}>{happeningMsg.text}</div>
            {happeningMsg.detail && <div style={{ fontSize: 16, fontWeight: 800, color: happeningMsg.good ? "#388e3c" : "#d32f2f" }}>{happeningMsg.detail}</div>}
          </div>
        </div>
      )}

      {phase === "playing" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 }}>
          {nv != null && dv != null && <span style={{ fontSize: s(14), fontWeight: 900, color: match ? "#2e7d32" : "#c62828", background: match ? "rgba(46,125,50,0.12)" : "rgba(198,40,40,0.08)", padding: `${s(2)}px ${s(10)}px`, borderRadius: s(8) }}>{nv}/{dv} {match ? "✅" : "❌"}</span>}
          {match && <span style={{ fontSize: s(13), color: "#e65100", fontWeight: 900, background: "rgba(255,111,0,0.12)", padding: `${s(2)}px ${s(8)}px`, borderRadius: s(6) }}>+{previewPts}pt</span>}
          <button onClick={handleSubmit} disabled={!match} style={{ padding: `${s(7)}px ${s(18)}px`, fontSize: s(15), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: match ? "linear-gradient(135deg,#4caf50,#388e3c)" : "#999", color: "#fff", border: match ? "2px solid #2e7d32" : "2px solid #888", borderRadius: s(10), cursor: match ? "pointer" : "default", letterSpacing: 3 }}>📦納品</button>
          <button onClick={handlePass} style={{ padding: `${s(6)}px ${s(12)}px`, fontSize: s(13), fontWeight: 700, fontFamily: "'Zen Maru Gothic',serif", background: "rgba(139,111,71,0.12)", color: "#8b6f47", border: "1.5px solid rgba(139,111,71,0.3)", borderRadius: s(9), cursor: "pointer" }}>パス</button>
        </div>
      )}

      <div style={{ padding: "4px", minHeight: 0, flex: 1, background: "rgba(255,255,255,0.3)", borderRadius: 10, border: "2px solid rgba(160,128,96,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ fontSize: s(10), color: "#8b6f47", marginBottom: 2, paddingLeft: 3, fontWeight: 700, flexShrink: 0 }}>🃏 手札 ({handTotal})</div>
        <div data-scrollable="true" style={{ display: "flex", gap: s(4), flexWrap: "wrap", justifyContent: "center", alignContent: "flex-start", overflowY: "auto", flex: 1, padding: "1px 0" }}>{hand.map(c => rCard(c, "hand", null))}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: "0 1px", flexShrink: 0 }}>
        {SPECIALS.map(sp => { const cnt = specials[sp.id], dis = !canUseSpecial(sp.id); return (<button key={sp.id} onClick={() => useSpecial(sp.id)} disabled={dis} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: s(5), padding: `${s(6)}px ${s(4)}px`, borderRadius: s(10), cursor: dis ? "default" : "pointer", background: dis ? "rgba(139,111,71,0.06)" : "linear-gradient(180deg,#fff8e1,#ffcc80)", border: dis ? "2px solid rgba(139,111,71,0.12)" : "2.5px solid #e67e22", opacity: dis ? 0.3 : 1, fontFamily: "'Zen Maru Gothic',serif", boxShadow: dis ? "none" : "0 2px 8px rgba(230,126,34,0.25)" }}><span style={{ fontSize: s(22) }}>{sp.emoji}</span><div style={{ textAlign: "left" }}><div style={{ fontSize: s(11), fontWeight: 900, color: dis ? "#999" : "#e65100", lineHeight: 1.1 }}>{sp.name}</div><div style={{ fontSize: s(9), color: dis ? "#bbb" : "#c62828", fontWeight: 700 }}>残{cnt} / -{sp.cost}pt</div></div></button>); })}
      </div>
      {/* Last 10s warning - small banner at bottom, non-blocking */}
      {mode === "normal" && phase === "playing" && timer <= 10 && timer > 3 && (
        <div style={{ position: "absolute", bottom: s(50), left: "50%", transform: "translateX(-50%)", zIndex: 90, pointerEvents: "none" }}>
          <div style={{ background: "rgba(229,57,53,0.85)", color: "#fff", padding: `${s(4)}px ${s(16)}px`, borderRadius: s(20), fontSize: s(12), fontWeight: 900, letterSpacing: 2, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(229,57,53,0.3)" }}>⚠️ ラスト{timer}秒</div>
        </div>
      )}
      {/* Countdown 3-2-1 - semi-transparent, center but not blocking */}
      {mode === "normal" && phase === "playing" && timer > 0 && timer <= 3 && (
        <div key={`cd-${timer}`} style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 90, pointerEvents: "none", animation: "countPop 0.8s ease-out forwards" }}>
          <div style={{ fontSize: s(72), fontWeight: 900, color: "rgba(229,57,53,0.35)", textShadow: "0 0 20px rgba(229,57,53,0.15)" }}>{timer}</div>
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: 12, color: "#5d4037", padding: "1px", minHeight: 16, fontWeight: 700, flexShrink: 0 }}>{msg}</div>

      {/* GAME OVER */}
      {phase === "gameOver" && (<div style={{ position: "absolute", inset: 0, background: "rgba(62,39,35,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(3px)" }}><div style={{ textAlign: "center", padding: 24, background: `linear-gradient(180deg,${P},#f0e6d3)`, border: "3px solid #a08060", borderRadius: 16, margin: "0 14px", animation: "fadeIn 0.5s", maxWidth: 360, width: "100%" }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>🏆 工房閉店！</div>
        {mode === "practice" && <div style={{ fontSize: 11, color: "#4caf50", fontWeight: 700 }}>📝 練習</div>}
        <div style={{ fontSize: 10, color: DIFF_COLORS[diff], fontWeight: 800, marginBottom: 6 }}>{DIFF_LABELS[diff]}</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: RA, marginBottom: 2 }}>{finalScore}<span style={{ fontSize: 16 }}>pt</span></div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#5d4037", marginBottom: 8 }}>{STAR_LABELS[stars]}</div>
        <div style={{ fontSize: 12, color: "#8b6f47", marginBottom: 10 }}>{round - 1}R ・ {totalUsed}枚 ・ 最大{maxCombo}コンボ</div>
        <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", borderRadius: 16, padding: "16px 20px", marginBottom: 14, border: "2px solid #4caf50", animation: "fadeIn 0.8s" }}>
          <div style={{ fontSize: 14, color: "#81c784", fontWeight: 700, marginBottom: 4 }}>🪙 獲得ALT</div>
          <div style={{ fontSize: 48, fontWeight: 900, color: "#a5d6a7", lineHeight: 1 }}>+{sessionAlt}<span style={{ fontSize: 18 }}> ALT</span></div>
          <div style={{ fontSize: 11, color: "#81c784", marginTop: 8, lineHeight: 1.8 }}>
            <span>{stars >= 3 ? "★★★" : stars >= 2 ? "★★☆" : "★☆☆"} クリア報酬: +{altForStars(stars)}</span>
            {!clearedDiffs[`${diff}-${mode}`] || sessionAlt > altForStars(stars) ? <span style={{ display: "block" }}>🎁 初クリアボーナス: +5</span> : null}
          </div>
          <div style={{ fontSize: 12, color: "#a5d6a7", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8, fontWeight: 800 }}>累計: 🪙 {totalAlt} ALT</div>
        </div>
        {TRAIL_PLAYER && trailAlt > 0 && (
          <div style={{ background: "linear-gradient(135deg,#0d47a1,#1565c0)", borderRadius: 12, padding: "10px 16px", marginBottom: 14, border: "2px solid #42a5f5", animation: "fadeIn 1s" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#bbdefb" }}>🪙 {trailAlt} ALT を獲得！</div>
            <div style={{ fontSize: 10, color: "#90caf9", marginTop: 4 }}>TRAIL GP3 に送信しました</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setPhase("title")} style={{ padding: "12px 30px", fontSize: 17, fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: W, color: "#fff", border: "2px solid #a08060", borderRadius: 12, cursor: "pointer", letterSpacing: 4 }}>🔨 もう一度</button>
          <button onClick={goHome} style={{ padding: "12px 24px", fontSize: 15, fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: "linear-gradient(135deg,#546e7a,#455a64)", color: "#fff", border: "2px solid #78909c", borderRadius: 12, cursor: "pointer", letterSpacing: 2 }}>🏠 ホームに戻る</button>
        </div>

        {/* Ranking registration - normal mode only */}
        {mode === "normal" && !rankRegistered && (
          <div style={{ marginTop: 14, background: "rgba(139,111,71,0.08)", borderRadius: 12, padding: "10px 14px", border: "1.5px solid rgba(139,111,71,0.2)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#8b6f47", marginBottom: 6 }}>🏆 ランキングに登録</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={rankName} onChange={e => setRankName(e.target.value)} placeholder="なまえ" style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "2px solid #a08060", background: "#fff", fontSize: 14, fontFamily: "'Zen Maru Gothic',serif", fontWeight: 700, outline: "none" }} />
              <button onClick={() => { const n = rankName.trim(); if (n) { registerScore(n, finalScore, diff); } }} disabled={!rankName.trim()} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", background: rankName.trim() ? "linear-gradient(135deg,#e67e22,#d35400)" : "#ccc", color: "#fff", border: "none", cursor: rankName.trim() ? "pointer" : "default" }}>登録</button>
            </div>
          </div>
        )}
        {rankRegistered && rankResult && (
          <div style={{ marginTop: 14, background: "linear-gradient(135deg,#fff8e1,#ffe0b2)", borderRadius: 12, padding: "10px 14px", border: "2px solid #e67e22" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#e65100", marginBottom: 4 }}>🏆 ランキング登録完了！</div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#8b6f47" }}>週間</div><div style={{ fontSize: 22, fontWeight: 900, color: rankResult.weekly <= 3 ? "#e65100" : "#5d4037" }}>{rankResult.weekly}位</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#8b6f47" }}>歴代</div><div style={{ fontSize: 22, fontWeight: 900, color: rankResult.alltime <= 3 ? "#e65100" : "#5d4037" }}>{rankResult.alltime}位</div></div>
            </div>
          </div>
        )}
      </div></div>)}

      {/* Pickers */}
      {wildPicker !== null && (<div style={{ position: "fixed", inset: 0, background: "rgba(62,39,35,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(2px)" }}><div style={{ background: P, borderRadius: s(16), padding: s(24), border: "3px solid #a08060", textAlign: "center" }}><div style={{ fontSize: s(15), marginBottom: s(12), color: "#e65100", fontWeight: 800 }}>⭐ 化札の数字を選んでね</div><div style={{ display: "flex", gap: s(6), flexWrap: "wrap", justifyContent: "center" }}>{[0,1,2,3,4,5,6,7,8,9].map(v => (<button key={v} onClick={() => { setWildMap(w => ({ ...w, [wildPicker]: v })); setWildPicker(null); }} style={{ width: s(44), height: s(44), borderRadius: s(10), background: "linear-gradient(180deg,#fff8e1,#ffe0b2)", border: "2px solid #e67e22", color: "#e65100", fontSize: s(20), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", cursor: "pointer" }}>{v}</button>))}</div></div></div>)}
      {pickPicker && (<div style={{ position: "fixed", inset: 0, background: "rgba(62,39,35,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(2px)" }}><div style={{ background: P, borderRadius: s(16), padding: s(24), border: "3px solid #a08060", textAlign: "center" }}><div style={{ fontSize: s(15), marginBottom: s(12), color: "#2e7d32", fontWeight: 800 }}>🔢 手札に加える数字を選ぼう</div><div style={{ display: "flex", gap: s(6), flexWrap: "wrap", justifyContent: "center" }}>{[0,1,2,3,4,5,6,7,8,9].map(v => (<button key={v} onClick={() => { setHand(h => [...h, { type: "number", value: v, uid: mkUid() }]); setPickPicker(false); setMsg(`🔢 ${v}を追加！`); }} style={{ width: s(44), height: s(44), borderRadius: s(10), background: `linear-gradient(180deg,${P},#f0e6d3)`, border: "2px solid #a08060", color: INK, fontSize: s(20), fontWeight: 900, fontFamily: "'Zen Maru Gothic',serif", cursor: "pointer" }}>{v}</button>))}</div></div></div>)}
      {opPicker && (<div style={{ position: "fixed", inset: 0, background: "rgba(62,39,35,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(2px)" }}><div style={{ background: P, borderRadius: s(16), padding: s(24), border: "3px solid #a08060", textAlign: "center" }}><div style={{ fontSize: s(15), marginBottom: s(14), color: "#6a1b9a", fontWeight: 800 }}>✨ 手札に加える演算を選ぼう</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(8) }}>
        {[{ type: "add", sym: "＋", name: "加札" }, { type: "subtract", sym: "−", name: "減札" }, { type: "multiply", sym: "×", name: "乗札" }, { type: "divide", sym: "÷", name: "除札" }].map(op => (
          <button key={op.type} onClick={() => { setHand(h => [...h, { type: op.type, uid: mkUid() }]); setOpPicker(false); setMsg(`✨ ${op.name}を追加！`); }} style={{ width: s(72), height: s(72), borderRadius: s(14), background: "linear-gradient(180deg,#f3e5f5,#e1bee7)", border: "3px solid #8e44ad", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: "'Zen Maru Gothic',serif" }}>
            <span style={{ fontSize: s(30), fontWeight: 900, color: "#6a1b9a" }}>{op.sym}</span>
            <span style={{ fontSize: s(10), fontWeight: 800, color: "#6a1b9a" }}>{op.name}</span>
          </button>
        ))}
      </div></div></div>)}
    </div>
  );
}
