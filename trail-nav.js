/**
 * Darwin's Labo Game Bridge v2.0
 * ゲーム側はこのスクリプトを読み込むだけでプラットフォームと通信できる。
 *
 * 使い方:
 *   <script src="https://YOUR_DOMAIN/darwin-game-bridge.js"></script>
 *
 * API:
 *   DarwinBridge.ready()                    — ゲーム準備完了を通知
 *   DarwinBridge.stageClear({score, correct, total}) — ステージクリア
 *   DarwinBridge.exit()                     — ゲーム終了
 *   DarwinBridge.stage                      — 現在のステージ番号 (1-5)
 *   DarwinBridge.stageParams                — プラットフォームから渡されたステージパラメータ
 *   DarwinBridge.user                       — ユーザー情報 (DARWIN_USER_INFO受信後)
 *   window.onDarwinUserInfo = function(data) {} — ユーザー情報受信コールバック
 *
 * TrailNav互換:
 *   TrailNav.earnAlt(amount)  → 何もしない（プラットフォーム側で管理）
 *   TrailNav.showNav() / hideNav() → 何もしない
 *   TrailNav.init() → DarwinBridge.ready() を呼ぶ
 */
(function () {
  // URLから ?stage=N を読み取り
  var params = new URLSearchParams(window.location.search);
  var stageNum = parseInt(params.get("stage"), 10) || 1;

  var DarwinBridge = {
    stage: stageNum,
    stageParams: {},
    user: null,

    _send: function (type, data) {
      try {
        window.parent.postMessage({ type: type, data: data || {} }, "*");
      } catch (e) {
        console.warn("[DarwinBridge] postMessage failed:", e);
      }
    },

    /** ゲームの準備が完了したら呼ぶ */
    ready: function () {
      this._send("GAME_READY");
    },

    /** ステージクリア時に呼ぶ */
    stageClear: function (data) {
      this._send("STAGE_CLEAR", {
        score: data.score || 0,
        correct: data.correct || data.correctCount || 0,
        total: data.total || data.totalCount || 0,
      });
    },

    /** ゲームを終了してホームに戻るとき呼ぶ */
    exit: function () {
      this._send("GAME_EXIT");
    },
  };

  window.DarwinBridge = DarwinBridge;

  // プラットフォームからのメッセージ受信
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "DARWIN_USER_INFO") {
      var info = e.data.data || {};
      DarwinBridge.user = info;
      DarwinBridge.stageParams = info.stageParams || {};
      DarwinBridge.stage = info.stage || stageNum;
      if (typeof window.onDarwinUserInfo === "function") {
        window.onDarwinUserInfo(info);
      }
    }
  });

  // --- TrailNav 互換シム ---
  var noop = function () { return Promise.resolve(); };
  window.TrailNav = {
    init: function () { DarwinBridge.ready(); },
    earnAlt: noop,
    flushAltWithRetry: noop,
    showNav: function () {},
    hideNav: function () {},
    reportGameResult: function (data) {
      DarwinBridge.stageClear({
        score: data.score || 0,
        correct: data.correct || data.correctCount || 0,
        total: data.total || data.totalCount || 0,
      });
    },
    goToTGP32: function () { DarwinBridge.exit(); },
      });
    },
  };

  // --- TrailSDK 互換シム ---
  window.TrailSDK = {
    init: function () { DarwinBridge.ready(); },
    ready: function () { DarwinBridge.ready(); },
    gameOver: function (data) {
      DarwinBridge.stageClear({
        score: (data && data.score) || 0,
        correct: (data && data.correct) || 0,
        total: (data && data.total) || 0,
      });
    },
    endSession: function () { DarwinBridge.exit(); },
  };

  // showGameHome — 多くのゲームがこれを定義して「ホームに戻る」に使う
  if (!window.showGameHome) {
    window.showGameHome = function () { DarwinBridge.exit(); };
  }
})();
