/**
 * trail-nav.js — TRAIL Game 共通ナビゲーション・認証・ALTモジュール
 * 全ゲームの <head> 内で読み込む
 * 
 * 使い方:
 *   <script src="trail-nav.js"></script>
 *   <script>
 *     TrailNav.init({
 *       gameName: '暗算パネル',
 *       gameEmoji: '🧮',
 *       gameHomeId: 'title',         // ゲーム内ホーム画面のID
 *       tgp32Url: 'https://trail-game-pro-3-2.onrender.com',
 *       apiBase:  'https://trail-game-pro-3-2.onrender.com/api',
 *       showHomeBtn: true,            // ゲーム中にホームボタンを出すか
 *       onAltUpdated: (alt) => {},    // ALT更新時コールバック
 *     });
 *   </script>
 */

const TrailNav = (() => {
  // ===== 設定 =====
  let config = {
    gameName: 'ゲーム',
    gameEmoji: '🎮',
    gameHomeId: 'title',
    tgp32Url: 'https://trail-game-pro-3-2.onrender.com',
    apiBase: 'https://trail-game-pro-3-2.onrender.com/api',
    showHomeBtn: true,
    onAltUpdated: null,
  };

  let currentAlt = 0;
  let pendingAlt = 0; // ゲーム内で獲得したが未送信のALT
  let navBarEl = null;

  // ===== 認証 =====
  function getToken() {
    // 1. URLパラメータから（TGP3.2からの遷移時）
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      saveToken(urlToken);
      // URLからtokenパラメータを除去（履歴を汚さない）
      const cleanUrl = new URL(window.location);
      cleanUrl.searchParams.delete('token');
      window.history.replaceState({}, '', cleanUrl.toString());
      return urlToken;
    }
    // 2. localStorageから
    return localStorage.getItem('trail_token');
  }

  function saveToken(token) {
    if (token) {
      localStorage.setItem('trail_token', token);
    }
  }

  function getStudentId() {
    return localStorage.getItem('trail_student_id');
  }

  function saveStudentId(id) {
    if (id) {
      localStorage.setItem('trail_student_id', id);
    }
  }

  function getPin() {
    return localStorage.getItem('trail_pin');
  }

  // URLからstudent_idとpinも受け取れるようにする
  function parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('student_id');
    const pin = urlParams.get('pin');
    if (studentId) {
      saveStudentId(studentId);
      localStorage.setItem('trail_pin', pin || '');
    }
  }

  function isLoggedIn() {
    return !!(getToken() || getStudentId());
  }

  // ===== ALT API =====
  async function fetchAlt() {
    const token = getToken();
    const studentId = getStudentId();
    if (!token && !studentId) return null;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const endpoint = token
        ? `${config.apiBase}/alt/balance`
        : `${config.apiBase}/alt/balance/${studentId}`;

      const res = await fetch(endpoint, { headers });
      if (!res.ok) throw new Error(`ALT fetch failed: ${res.status}`);
      const data = await res.json();
      currentAlt = data.alt || data.balance || 0;
      updateAltDisplay();
      if (config.onAltUpdated) config.onAltUpdated(currentAlt);
      return currentAlt;
    } catch (e) {
      console.warn('[TrailNav] ALT取得失敗:', e);
      return null;
    }
  }

  // ゲーム内でALTを加算（バッファに貯める）
  function earnAlt(amount, reason = '') {
    pendingAlt += amount;
    currentAlt += amount;
    updateAltDisplay();
    console.log(`[TrailNav] ALT +${amount} (pending: ${pendingAlt}) ${reason}`);
  }

  // 貯まったALTをサーバーに送信
  async function flushAlt() {
    if (pendingAlt <= 0) return true;

    const token = getToken();
    const studentId = getStudentId();
    if (!token && !studentId) return false;

    const sendAmount = pendingAlt;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${config.apiBase}/alt/add`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: studentId,
          amount: sendAmount,
          source: config.gameName,
          reason: `${config.gameName}プレイ報酬`,
        }),
      });

      if (!res.ok) throw new Error(`ALT送信失敗: ${res.status}`);
      pendingAlt -= sendAmount;
      console.log(`[TrailNav] ALT ${sendAmount} 送信完了`);
      return true;
    } catch (e) {
      console.warn('[TrailNav] ALT送信失敗（リトライ可）:', e);
      return false;
    }
  }

  // リトライ付きflush
  async function flushAltWithRetry(maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      const ok = await flushAlt();
      if (ok) return true;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
    console.error('[TrailNav] ALT送信 全リトライ失敗');
    return false;
  }

  // ===== ナビゲーション =====

  // TGP3.2に戻る（ALT送信してから）
  async function goToTGP32() {
    // ALT送信を待つ
    await flushAltWithRetry();

    const token = getToken();
    const studentId = getStudentId();
    const pin = getPin();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (studentId) params.set('student_id', studentId);
    if (pin) params.set('pin', pin);
    params.set('refresh_alt', '1'); // TGP3.2にALT再取得を指示

    window.location.href = `${config.tgp32Url}?${params.toString()}`;
  }

  // ゲーム内ホームに戻る
  function goToGameHome() {
    // ゲーム固有のホーム画面切替
    // 各ゲームの show() 関数等を呼ぶ
    if (typeof window.showGameHome === 'function') {
      window.showGameHome();
    } else {
      // fallback: 画面切替を試みる
      const homeEl = document.getElementById(config.gameHomeId);
      if (homeEl) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        homeEl.classList.add('active');
      }
    }
  }

  // ===== UI =====
  function createNavBar() {
    // 既存のnavbarがあれば除去
    const existing = document.getElementById('trail-nav-bar');
    if (existing) existing.remove();

    const nav = document.createElement('div');
    nav.id = 'trail-nav-bar';
    nav.innerHTML = `
      <style>
        #trail-nav-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 44px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(0,0,0,0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
          z-index: 9999;
          font-family: 'Zen Maru Gothic', sans-serif;
          box-sizing: border-box;
        }
        #trail-nav-bar .tn-left {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        #trail-nav-bar .tn-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 12px;
          border: none;
          border-radius: 20px;
          font-family: 'Zen Maru Gothic', sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        #trail-nav-bar .tn-btn:active {
          transform: scale(0.95);
        }
        #trail-nav-bar .tn-home-btn {
          background: rgba(68,170,255,0.1);
          color: #44aaff;
        }
        #trail-nav-bar .tn-home-btn:hover {
          background: rgba(68,170,255,0.2);
        }
        #trail-nav-bar .tn-tgp-btn {
          background: linear-gradient(135deg, #ff5577, #ff8844);
          color: #fff;
          box-shadow: 0 2px 6px rgba(255,85,119,0.25);
        }
        #trail-nav-bar .tn-tgp-btn:hover {
          box-shadow: 0 2px 10px rgba(255,85,119,0.35);
        }
        #trail-nav-bar .tn-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        #trail-nav-bar .tn-alt {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: linear-gradient(135deg, #ffcc22, #ffaa00);
          border-radius: 20px;
          font-size: 12px;
          font-weight: 900;
          color: #665500;
          box-shadow: 0 1px 4px rgba(255,170,0,0.2);
        }
        #trail-nav-bar .tn-alt-val {
          font-family: 'Dela Gothic One', sans-serif;
          font-size: 14px;
        }
        /* ナビバーの高さ分だけbodyにパディング */
        body.trail-nav-active {
          padding-top: 44px !important;
        }
      </style>
      <div class="tn-left">
        <button class="tn-btn tn-home-btn" id="tn-home-btn" title="ゲームホームに戻る">
          🏠 ホーム
        </button>
        <button class="tn-btn tn-tgp-btn" id="tn-tgp-btn" title="TRAIL Game Pro 3.2に戻る">
          🎮 他のゲームで学ぶ
        </button>
      </div>
      <div class="tn-right">
        <div class="tn-alt">
          💰 <span class="tn-alt-val" id="tn-alt-val">--</span> ALT
        </div>
      </div>
    `;

    document.body.prepend(nav);
    document.body.classList.add('trail-nav-active');

    // イベント
    document.getElementById('tn-home-btn').addEventListener('click', goToGameHome);
    document.getElementById('tn-tgp-btn').addEventListener('click', goToTGP32);

    navBarEl = nav;
  }

  function updateAltDisplay() {
    const el = document.getElementById('tn-alt-val');
    if (el) {
      el.textContent = currentAlt;
      // アニメーション
      el.style.transform = 'scale(1.3)';
      setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
    }
  }

  // ナビバーの表示/非表示（ゲーム中は隠したい場合等）
  function showNav() { if (navBarEl) navBarEl.style.display = 'flex'; }
  function hideNav() { if (navBarEl) navBarEl.style.display = 'none'; }

  // ===== 初期化 =====
  function init(userConfig = {}) {
    Object.assign(config, userConfig);
    parseUrlParams();
    getToken(); // URLからトークンを拾ってlocalStorageに保存
    createNavBar();
    fetchAlt(); // ALT残高を取得して表示
    console.log(`[TrailNav] 初期化完了: ${config.gameName} | ログイン: ${isLoggedIn()}`);
  }

  // ===== Public API =====
  return {
    init,
    getToken,
    getStudentId,
    isLoggedIn,
    fetchAlt,
    earnAlt,
    flushAlt,
    flushAltWithRetry,
    goToTGP32,
    goToGameHome,
    showNav,
    hideNav,
    get currentAlt() { return currentAlt; },
    get pendingAlt() { return pendingAlt; },
  };
})();
