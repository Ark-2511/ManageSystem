/* =====================================================================
   KIOSK: nối màn hình quầy với Supabase
   - TẠM THỜI không cần mã trên link: mã của quán nhúng sẵn ở SHOP_TOKEN, máy nào mở trang cũng tự kích hoạt
     (máy mới, hoặc máy quên phiên). Link có  ?k=<mã>  vẫn dùng được và được ưu tiên.
   - Đổi link ở trang quản lý (tạo mã mới) thì phải sửa SHOP_TOKEN bên dưới, nếu không màn hình sẽ báo link không hợp lệ.
   - Menu lấy từ bản đã xuất bản (menu_versions), lưu sẵn trong máy để mất mạng vẫn chạy.
   - Menu mới chỉ được áp dụng khi màn hình đang chờ và giỏ trống.
   ===================================================================== */
(function () {
  var SB_URL = 'https://mzzkohjxjammpihakwbz.supabase.co';
  var SB_KEY = 'sb_publishable_1Or6VXIVbaTN7li0oDe5kA_-1aQJWuX'; /* khóa công khai, an toàn để nằm trong trình duyệt */
  var SHOP_TOKEN = '41af800e6d094d9bfeafb3fc7cede9d2cc606db09005b45d25ca097e8379d8f3'; /* mã màn hình quầy của quán */
  var STORE = 'kiosk_state_v1', BEAT_MS = 60000, IDLE_CHECK_MS = 3000;

  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  var K = window.KIOSK = { sb: sb, shopId: null, terminalId: null, version: 0, pendingVersion: 0 };

  /* ---------- lưu trong máy ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null') } catch (e) { return null } }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)) } catch (e) {} }

  /* ---------- thông báo ---------- */
  var overlay = null, banner = null;
  function showMsg(title, text) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center;background:#fff8ee;color:#3b2a1a;font:500 22px "Be Vietnam Pro",system-ui,sans-serif';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<b style="font-size:30px">' + title + '</b><span style="max-width:640px;opacity:.8;font-size:20px">' + (text || '') + '</span>';
  }
  function hideMsg() { if (overlay) { overlay.remove(); overlay = null } }
  function setBanner(text) {
    if (!text) { if (banner) { banner.remove(); banner = null } return }
    if (!banner) {
      banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;padding:6px 12px;text-align:center;background:#b3261e;color:#fff;font:500 14px "Be Vietnam Pro",system-ui,sans-serif';
      document.body.appendChild(banner);
    }
    banner.textContent = text;
  }

  /* ---------- đổi bản menu thành các biến mà app.js đang dùng ---------- */
  function build(snap) {
    var cats = (snap.categories || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order });
    var byCat = {};
    (snap.items || []).forEach(function (it) { (byCat[it.category_id] = byCat[it.category_id] || []).push(it) });
    var MENU = {}, DESC = {}, RATE = {}, SUGGEST = {}, IMG = {}, BARS = {}, LIMIT = {};
    var ORDER = ['dam', 'tra', 'ngot', 'ngay'];
    cats.forEach(function (c) {
      MENU[c.name] = (byCat[c.id] || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order }).map(function (it) {
        var v = (it.variants || []).filter(function (x) { return x.is_default })[0] || (it.variants || [])[0];
        var a = it.attributes || {};
        DESC[it.name] = it.description || '';
        if (Array.isArray(a.rate)) RATE[it.name] = a.rate;          /* dạng cũ: mảng theo nhóm */
        else if (a.rate) {                                           /* dạng mới: {dam:[mức,min,max], ...} */
          var bars = ORDER.filter(function (b) { return a.rate[b] });
          BARS[it.name] = bars;
          RATE[it.name] = bars.map(function (b) { return a.rate[b][0] });
          LIMIT[it.name] = bars.map(function (b) { return [a.rate[b][1], a.rate[b][2]] });
        }
        if (a.suggest) SUGGEST[it.name] = [a.suggest.sugar == null ? null : a.suggest.sugar, a.suggest.ice == null ? null : a.suggest.ice];
        if (it.image_path) IMG[it.name] = it.image_path.indexOf('/') >= 0  /* ảnh tải lên từ trang quản lý */
          ? SB_URL + '/storage/v1/object/public/menu-images/' + it.image_path : it.image_path;
        it._variant = v;
        return [it.name, v ? v.price / 1000 : 0]; /* app.js tính giá theo nghìn đồng */
      });
    });
    window.CAT_NAMES = cats.map(function (c) { return c.name });
    window.KMENU = MENU; window.KDESC = DESC; window.KRATE = RATE; window.KSUGGEST = SUGGEST; window.IMG_MAP = IMG;
    window.KBARS = BARS; window.KLIMIT = LIMIT;
    K.snapshot = snap; K.version = snap.version;
  }

  /* ---------- tải menu mới nhất ---------- */
  function fetchLatest() {
    return sb.from('menu_versions').select('version,snapshot').eq('shop_id', K.shopId)
      .order('version', { ascending: false }).limit(1).then(function (r) {
        if (r.error) throw r.error;
        return r.data && r.data[0] || null;
      });
  }

  /* ---------- khởi động ---------- */
  function startApp() {
    hideMsg();
    var s = document.createElement('script'); s.src = 'js/app.js'; document.body.appendChild(s);
    setInterval(beat, BEAT_MS); beat();
    setInterval(applyWhenIdle, IDLE_CHECK_MS);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  function boot() {
    var st = load() || {};
    var urlToken = new URLSearchParams(location.search).get('k');
    showMsg('Đang mở menu…', '');
    return sb.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      /* Kích hoạt khi: link có mã, máy chưa kích hoạt, hoặc máy quên phiên (cần mạng). Mất mạng: dùng bản đã lưu. */
      var token = urlToken || ((!st.shopId || !session) && navigator.onLine ? SHOP_TOKEN : null);
      if (token) {
        /* Mở bằng link thiết bị: đăng nhập ẩn danh (nếu chưa) rồi kích hoạt máy này */
        var p = session ? Promise.resolve() : sb.auth.signInAnonymously().then(function (x) { if (x.error) throw x.error });
        return p.then(function () { return sb.rpc('activate_kiosk', { p_token: token, p_device_name: null }) }).then(function (x) {
          if (x.error) throw x.error;
          st = { shopId: x.data.shop_id, terminalId: x.data.terminal_id };
          save(st);
          if (urlToken) history.replaceState(null, '', location.pathname); /* bỏ mã khỏi thanh địa chỉ */
        });
      }
      if (!st.shopId) throw new Error(navigator.onLine ? 'NOLINK' : 'NOMENU');
    }).then(function () {
      K.shopId = st.shopId; K.terminalId = st.terminalId;
      return fetchLatest().then(function (row) {
        if (row) { st.snap = row.snapshot; st.ver = row.version; save(st) }
      }, function () { /* mất mạng: dùng bản đã lưu */ });
    }).then(function () {
      if (!st.snap) throw new Error('NOMENU');
      build(st.snap);
      startApp();
    }).catch(function (e) {
      var m = (e && e.message) || '';
      if (m === 'NOLINK') showMsg('Chưa kích hoạt màn hình', 'Hãy mở đường link màn hình quầy do chủ quán cung cấp.');
      else if (m === 'NOSESSION') showMsg('Cần mở lại link', 'Máy đã quên phiên đăng nhập. Hãy mở lại đường link màn hình quầy.');
      else if (m === 'NOMENU') showMsg('Chưa có menu', 'Quán chưa xuất bản menu, hoặc máy đang mất mạng lần đầu mở. Hãy kết nối mạng rồi tải lại.');
      else showMsg('Không mở được màn hình', m);
    });
  }

  /* ---------- tín hiệu mỗi phút + kiểm tra menu mới ---------- */
  function beat() {
    if (!K.terminalId || !navigator.onLine) return;
    sb.rpc('terminal_heartbeat', { p_terminal_id: K.terminalId, p_menu_version: K.version }).then(function (r) {
      if (r.error) {
        if (r.error.code === '42501') setBanner('Màn hình này đã bị ngắt hoặc máy khác đã thay chỗ. Hãy mở lại link do chủ quán cung cấp.');
        return;
      }
      setBanner('');
      return sb.from('menu_versions').select('version').eq('shop_id', K.shopId).order('version', { ascending: false }).limit(1).then(function (v) {
        var latest = v.data && v.data[0] && v.data[0].version;
        if (latest && latest > K.version && latest > K.pendingVersion) {
          return fetchLatest().then(function (row) {
            if (!row) return;
            var st = load() || {}; st.snap = row.snapshot; st.ver = row.version; save(st);
            K.pendingVersion = row.version;
          });
        }
      });
    }).catch(function () {});
  }

  /* Menu mới chỉ áp dụng khi không ai đang dùng: màn hình chờ, giỏ trống, không đang chạy hiệu ứng */
  function applyWhenIdle() {
    if (!K.pendingVersion) return;
    if (window.scene === 'wait' && !window.busy && window.cart && window.cart.length === 0) location.reload();
  }

  boot();
})();
