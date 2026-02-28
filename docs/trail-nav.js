/**
 * trail-nav.js — TRAIL Game 共通ナビゲーション・認証・ALTモジュール v2
 * ★ GAME_INTEGRATION_STANDARD.md 準拠版
 *
 * v1からの変更点:
 *   - goToTGP32(): window.location.href → window.close() に修正
 *   - ALT送信: /api/alt/add → /api/external/game-result に修正
 *   - earnAlt()/flushAlt() → reportGameResult() に統合
 *
 * 使い方:
 *   <script src="https://trail-game-pro-3-2.onrender.com/js/trail-nav.js"></script>
 *   <script>
 *     TrailNav.init({
 *       gameName: '約分工房',
 *       gameId: 'yakubun-koubou',
 *       gameEmoji: '🔧',
 *       gameHomeId: 'root',
 *     });
 *   </script>
 */

const TrailNav = (() => {
  // ===== 設定 =====
  let config = {
    gameName: 'ゲーム',
    gameId: '',
    gameEmoji: '🎮',
    gameHomeId: 'title',
    tgp32Url: '',
    apiBase: '',
    showHomeBtn: true,
    onAltUpdated: null,
  };

  let currentAlt = 0;
  let navBarEl = null;

  // ===== 認証 =====
  function getParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      token: p.get('token'),
      player: p.get('player'),
      studentId: p.get('student_id'),
      className: p.get('class_name'),
      tenantSlug: p.get('tenant_slug'),
      tenantId: p.get('tenant_id'),
      returnUrl: p.get('return_url'),
    };
  }

  const params = {};

  function isLoggedIn() {
    return !!(params.token || params.player);
  }

  // ===== API Base 自動検出 =====
  function getApiBase() {
    if (config.apiBase) return config.apiBase;
    // return_url からオリジンを推定
    if (params.returnUrl) {
      try {
        const url = new URL(params.returnUrl);
        return url.origin + '/api';
      } catch (e) {}
    }
    return '';
  }

  // ===== ALT送信（正規ルート: POST /api/external/game-result）=====
  /**
   * ゲーム終了時にスコアを送信する（★正規ルート★）
   * @param {Object} result
   * @param {number} result.score        - ゲーム内スコア
   * @param {number} result.correctCount - 正解数
   * @param {number} result.totalCount   - 総問題数
   * @param {number} [result.maxStreak]  - 最大連続正解数
   * @returns {Promise<Object>} ALT計算結果
   */
  async function reportGameResult(result) {
    const apiBase = getApiBase();
    if (!apiBase || !params.player) {
      console.warn('[TrailNav] APIまたはプレイヤー未設定、ALT送信スキップ');
      return null;
    }

    try {
      const res = await fetch(apiBase + '/external/game-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player: params.player,
          game_id: config.gameId || config.gameName,
          game_name: config.gameName,
          score: result.score ?? 0,
          correct_count: result.correctCount ?? 0,
          total_count: result.totalCount ?? 0,
          max_streak: result.maxStreak ?? 0,
        }),
      });

      if (!res.ok) throw new Error(`ALT送信失敗: ${res.status}`);
      const data = await res.json();
      if (data.alt) {
        currentAlt += data.alt;
        updateAltDisplay();
      }
      console.log(`[TrailNav] ALT +${data.alt || 0} / ${config.gameName}`);
      return data;
    } catch (e) {
      console.error('[TrailNav] ALT送信エラー:', e);
      return null;
    }
  }

  // ===== ナビゲーション =====

  // ★ TGP3.2に戻る（window.close()を使用・window.location.href禁止）
  function goToTGP32() {
    window.close();
    // window.close()が効かない場合のフォールバック
    setTimeout(() => {
      document.body.innerHTML = `
        <div style="text-align:center; padding:60px 20px; font-family:sans-serif;
                    background:#1a1a2e; color:#fff; min-height:100vh;
                    display:flex; flex-direction:column; justify-content:center;">
          <h2 style="font-size:24px; margin-bottom:16px;">🎮 ゲーム終了！</h2>
          <p style="font-size:16px; color:#aaa;">ブラウザのタブから<br>TRAILポータルに戻ってください。</p>
        </div>
      `;
    }, 500);
  }

  // ゲーム内ホームに戻る
  function goToGameHome() {
    if (typeof window.showGameHome === 'function') {
      window.showGameHome();
    } else {
      const homeEl = document.getElementById(config.gameHomeId);
      if (homeEl) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        homeEl.classList.add('active');
      }
    }
  }

  // ===== UI =====
  function createNavBar() {
    const existing = document.getElementById('trail-nav-bar');
    if (existing) existing.remove();

    const nav = document.createElement('div');
    nav.id = 'trail-nav-bar';
    nav.innerHTML = `
      <style>
        #trail-nav-bar {
          position: fixed; top: 0; left: 0; right: 0; height: 44px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(0,0,0,0.08);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 10px; z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          box-sizing: border-box;
        }
        #trail-nav-bar .tn-left { display: flex; align-items: center; gap: 6px; }
        #trail-nav-bar .tn-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 5px 12px; border: none; border-radius: 20px;
          font-size: 12px; font-weight: 700; cursor: pointer;
          transition: all 0.15s; white-space: nowrap;
          touch-action: manipulation; -webkit-tap-highlight-color: transparent;
        }
        #trail-nav-bar .tn-btn:active { transform: scale(0.95); }
        #trail-nav-bar .tn-home-btn { background: rgba(68,170,255,0.1); color: #44aaff; }
        #trail-nav-bar .tn-tgp-btn {
          background: linear-gradient(135deg, #ff5577, #ff8844);
          color: #fff; box-shadow: 0 2px 6px rgba(255,85,119,0.25);
        }
        #trail-nav-bar .tn-right { display: flex; align-items: center; gap: 6px; }
        #trail-nav-bar .tn-alt {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 10px; background: linear-gradient(135deg, #ffcc22, #ffaa00);
          border-radius: 20px; font-size: 12px; font-weight: 900; color: #665500;
        }
        body.trail-nav-active { padding-top: 44px !important; }
      </style>
      <div class="tn-left">
        ${config.showHomeBtn ? '<button class="tn-btn tn-home-btn" id="tn-home-btn">🏠 ホーム</button>' : ''}
        <button class="tn-btn tn-tgp-btn" id="tn-tgp-btn">🎮 他のゲームで学ぶ</button>
      </div>
      <div class="tn-right">
        <div class="tn-alt">💰 <span id="tn-alt-val">--</span> ALT</div>
      </div>
    `;

    document.body.prepend(nav);
    document.body.classList.add('trail-nav-active');

    if (config.showHomeBtn) {
      document.getElementById('tn-home-btn').addEventListener('click', goToGameHome);
    }
    document.getElementById('tn-tgp-btn').addEventListener('click', goToTGP32);

    navBarEl = nav;
  }

  function updateAltDisplay() {
    const el = document.getElementById('tn-alt-val');
    if (el) {
      el.textContent = currentAlt;
      el.style.transform = 'scale(1.3)';
      setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
    }
  }

  function showNav() { if (navBarEl) navBarEl.style.display = 'flex'; }
  function hideNav() { if (navBarEl) navBarEl.style.display = 'none'; }

  // ===== 初期化 =====
  function init(userConfig = {}) {
    Object.assign(config, userConfig);
    // URLパラメータを解析
    const p = getParams();
    Object.assign(params, p);
    // apiBase自動設定
    if (!config.apiBase && p.returnUrl) {
      try { config.apiBase = new URL(p.returnUrl).origin + '/api'; } catch (e) {}
    }
    createNavBar();
    console.log(`[TrailNav v2] 初期化完了: ${config.gameName} | ログイン: ${isLoggedIn()}`);
  }

  // ===== Public API =====
  return {
    init,
    isLoggedIn,
    reportGameResult,
    goToTGP32,
    goToGameHome,
    showNav,
    hideNav,
    get currentAlt() { return currentAlt; },
    get params() { return { ...params }; },
  };
})();
