/* =====================================================================
   TRANG QUẢN LÝ CỦA CHỦ QUÁN
   #home   : các nút tính năng
   #menu   : bảng menu kiểu Excel (tên, ảnh, giá, ghi chú, khẩu vị, gợi ý đường đá, thành phần)
   #quanly : các tính năng quản lý
   #kho    : bảng kho nguyên liệu (nhập thêm, đếm thực tế, báo sắp hết)
   Mọi thao tác ghi đều qua hàm trong database (admin_save_menu, admin_save_stock),
   database tự kiểm tra quyền và dữ liệu.
   ===================================================================== */
(function () {
  'use strict';
  var SB_URL = 'https://mzzkohjxjammpihakwbz.supabase.co';
  var SB_KEY = 'sb_publishable_1Or6VXIVbaTN7li0oDe5kA_-1aQJWuX';
  var BUCKET = 'menu-images';
  var LOCAL_IMG = '../assets/picture/';
  /* storageKey riêng: đăng nhập ở đây không ảnh hưởng màn hình quầy mở trên cùng trình duyệt */
  var sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { storageKey: 'quanly-auth', persistSession: true, autoRefreshToken: true }
  });

  var app = document.getElementById('app');
  var S = { user: null, shops: [], shop: null, dirty: false, lastHash: '', skipHash: false, menu: null, stock: null };
  var UNIT = { g: 'g', ml: 'ml', piece: 'cái' };
  var STEPS = [0, 30, 50, 70, 100];
  var BARS = [['d', 'Độ đậm'], ['n', 'Độ ngọt'], ['y', 'Độ ngậy']];

  /* ---------------- tiện ích ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function errMsg(e) { return (e && (e.message || e.error_description)) || String(e) }
  function rpc(name, args) {
    return sb.rpc(name, args).then(function (r) { if (r.error) throw r.error; return r.data });
  }
  var toastT;
  function toast(msg, bad) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'on' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = '' }, bad ? 7000 : 3500);
  }
  function money(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('vi-VN') }
  function qty(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 3 }) }
  function digits(s) { return String(s == null ? '' : s).replace(/[^\d]/g, '') }
  /* Đọc số lượng: "1.000" = một nghìn, "1,5" hoặc "1.5" = một rưỡi */
  function parseQty(s) {
    s = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (s === '') return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
    if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
    return NaN;
  }
  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function imgUrl(p) {
    if (!p) return '';
    return p.indexOf('/') >= 0 ? SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + p : LOCAL_IMG + p;
  }
  function setDirty(on) {
    S.dirty = on;
    var st = document.getElementById('st');
    if (st) { st.textContent = on ? '● Có thay đổi chưa lưu' : 'Đã lưu hết'; st.className = 'st' + (on ? ' dirty' : '') }
  }
  var ICON = {
    menu: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5"/></svg>',
    manage: '<svg viewBox="0 0 24 24"><path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16 M7 16V9 M12 16V5 M17 16v-4"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1"/></svg>',
    off: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/></svg>',
    bill: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5 M16 4.5a3.5 3.5 0 0 1 0 7 M18 14.5c2 .6 3.2 2.5 3.5 5.5"/></svg>',
    screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8 M12 16v4"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 7v5l3 2"/></svg>'
  };

  /* ---------------- điều hướng ---------------- */
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = '' } });
  window.addEventListener('hashchange', function () {
    if (S.skipHash) { S.skipHash = false; return }
    if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Bỏ các thay đổi đó và rời trang?')) {
      S.skipHash = true; location.hash = S.lastHash; return;
    }
    setDirty(false); route();
  });
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h }
  function route() {
    if (!S.user) return viewLogin();
    if (!S.shop) return viewNoShop();
    var h = location.hash.replace('#', '') || 'home';
    S.lastHash = '#' + h;
    ({ home: viewHome, menu: viewMenu, quanly: viewManage, kho: viewStock }[h] || viewHome)();
  }

  function topbar() {
    var sel = S.shops.length > 1
      ? '<select id="shopSel">' + S.shops.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === S.shop.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join('') + '</select>'
      : '<span class="shop">' + esc(S.shop ? S.shop.name : '') + '</span>';
    return '<header class="top"><a class="brand" href="#home">Quản lý quán</a>' + sel +
      '<span class="sp"></span><span class="who">' + esc(S.user.email || '') + '</span>' +
      '<button id="logout" type="button">Đăng xuất</button></header>';
  }
  function bindTop() {
    var lo = document.getElementById('logout');
    if (lo) lo.onclick = function () {
      if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Vẫn đăng xuất?')) return;
      setDirty(false); sb.auth.signOut().then(function () { S.user = null; S.shop = null; location.hash = ''; route() });
    };
    var ss = document.getElementById('shopSel');
    if (ss) ss.onchange = function () {
      if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Vẫn đổi quán?')) { ss.value = S.shop.id; return }
      setDirty(false);
      S.shop = S.shops.filter(function (s) { return s.id === ss.value })[0];
      try { localStorage.setItem('quanly-shop', S.shop.id) } catch (e) {}
      go('home');
    };
  }

  /* ---------------- đăng nhập ---------------- */
  function viewLogin() {
    app.innerHTML = '<div class="center"><form class="login" id="lf">' +
      '<h1>Quản lý quán</h1><p class="muted" style="margin:0">Đăng nhập bằng tài khoản chủ quán.</p>' +
      '<label>Email<input type="email" id="em" autocomplete="username" required></label>' +
      '<label>Mật khẩu<input type="password" id="pw" autocomplete="current-password" required></label>' +
      '<button class="btn pri" id="lb" type="submit">Đăng nhập</button><p class="err" id="le"></p></form></div>';
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var b = document.getElementById('lb'), le = document.getElementById('le');
      b.disabled = true; le.textContent = '';
      sb.auth.signInWithPassword({ email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value })
        .then(function (r) {
          if (r.error) throw r.error;
          S.user = r.data.user;
          return loadShops();
        })
        .then(route)
        .catch(function (e) {
          var m = errMsg(e);
          if (/invalid login credentials/i.test(m)) m = 'Sai email hoặc mật khẩu';
          if (/email not confirmed/i.test(m)) m = 'Email chưa được xác nhận';
          le.textContent = m; b.disabled = false;
        });
    };
  }
  function loadShops() {
    return rpc('admin_my_shops').then(function (list) {
      S.shops = list || [];
      var saved = null; try { saved = localStorage.getItem('quanly-shop') } catch (e) {}
      S.shop = S.shops.filter(function (s) { return s.id === saved })[0] || S.shops[0] || null;
    });
  }
  function viewNoShop() {
    app.innerHTML = topbar() + '<div class="center"><p>Tài khoản này chưa là chủ quán hoặc quản lý của quán nào.</p></div>';
    bindTop();
  }

  /* ---------------- trang chính ---------------- */
  function soonTiles(list) {
    return '<p class="soon-title">Sắp có</p><div class="tiles soon">' + list.map(function (t) {
      return '<div class="tile" title="Đang phát triển">' + ICON[t[0]] + t[1] + '</div>';
    }).join('') + '</div>';
  }
  function viewHome() {
    var link = new URL('../', location.href).href; /* tạm thời không kèm mã: màn hình quầy tự kích hoạt */
    app.innerHTML = topbar() + '<div class="center">' +
      '<p class="tiles-title">' + esc(S.shop.name) + '</p>' +
      '<div class="tiles">' +
        '<a class="tile" href="#menu">' + ICON.menu + 'Menu<small>Món, giá, ảnh, khẩu vị, thành phần</small></a>' +
        '<a class="tile" href="#quanly">' + ICON.manage + 'Quản lý<small>Kho nguyên liệu và các mục khác</small></a>' +
      '</div>' +
      soonTiles([['chart', 'Báo cáo doanh thu'], ['gear', 'Cài đặt quán & tài khoản ngân hàng']]) +
      (link ? '<div class="kiosk-link"><b>Màn hình quầy</b><br><span class="muted">Mở link này trên máy đặt ở quầy. Mỗi máy mở link sẽ chiếm 1 chỗ màn hình theo gói cước.</span>' +
        '<div class="row"><a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">Mở menu ở tab mới ↗</a>' +
        '<button class="btn" id="cp" type="button">Sao chép link</button></div></div>' : '') +
      '</div>';
    bindTop();
    var cp = document.getElementById('cp');
    if (cp) cp.onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(function () { toast('Đã sao chép link màn hình quầy') }, function () { prompt('Sao chép link này:', link) });
    };
  }

  /* ---------------- quản lý ---------------- */
  function viewManage() {
    app.innerHTML = topbar() + '<div class="center">' +
      '<p class="tiles-title">Quản lý</p>' +
      '<div class="tiles"><a class="tile" href="#kho">' + ICON.box + 'Kho nguyên liệu<small>Nhập hàng, tồn kho tự trừ</small></a>' +
      '<a class="tile" href="#home" style="font-weight:500;font-size:15px">← Trang chính</a></div>' +
      soonTiles([['off', 'Món tạm hết (bật/tắt nhanh)'], ['bill', 'Đơn hàng & đối soát chuyển khoản'],
                 ['history', 'Lịch sử nhập kho & hao hụt'], ['chart', 'Giá vốn & lãi từng món'],
                 ['screen', 'Màn hình quầy đang chạy'], ['users', 'Nhân viên & phân quyền']]) +
      '</div>';
    bindTop();
  }

  /* =====================================================================
     BẢNG MENU
     ===================================================================== */
  function itemFrom(it) {
    var a = it.attributes || {}, rate = (a.rate && !Array.isArray(a.rate)) ? a.rate : {}, s = a.suggest;
    var extra = {}; Object.keys(a).forEach(function (k) { if (k !== 'rate' && k !== 'suggest') extra[k] = a[k] });
    function trip(x) { return x ? [String(x[0]), String(x[1]), String(x[2])] : ['', '', ''] }
    return {
      id: it.id, name: it.name || '', description: it.description || '', image_path: it.image_path || '',
      price: it.price == null ? '' : String(it.price), is_active: it.is_active !== false,
      sk: rate.tra ? 'tra' : 'dam',
      r: { d: trip(rate.dam || rate.tra), n: trip(rate.ngot), y: trip(rate.ngay) },
      sugar: s && s.sugar != null ? String(s.sugar) : '',
      ice: s ? (s.ice != null ? String(s.ice) : 'none') : '',
      recipe: (it.recipe || []).map(function (x) { return { ingredient_id: x.ingredient_id, quantity: x.quantity } }),
      extra: extra
    };
  }
  function newItem(cat) {
    var sib = cat.items[0];
    return { id: null, name: '', description: '', image_path: '', price: '', is_active: true, sk: sib ? sib.sk : 'dam',
             r: { d: ['', '', ''], n: ['', '', ''], y: ['', '', ''] }, sugar: '50', ice: '50', recipe: [], extra: {} };
  }
  function loadMenuData(d) {
    S.menu = {
      version: d.menu_version, ingredients: d.ingredients || [],
      cats: (d.categories || []).map(function (c) {
        return { id: c.id, name: c.name, is_active: c.is_active !== false, items: (c.items || []).map(itemFrom) };
      })
    };
  }
  function ingById(id) { return S.menu.ingredients.filter(function (i) { return i.id === id })[0] }
  function recipeText(rec) {
    if (!rec.length) return '';
    return rec.map(function (x) {
      var g = ingById(x.ingredient_id);
      return (g ? g.name : '?') + ' ' + qty(x.quantity) + (g ? UNIT[g.unit] : '');
    }).join('; ');
  }

  function viewMenu() {
    app.innerHTML = topbar() + '<div class="center"><p class="muted">Đang tải bảng menu…</p></div>';
    bindTop();
    rpc('admin_get_menu', { p_shop_id: S.shop.id }).then(function (d) { loadMenuData(d); renderMenu() })
      .catch(function (e) { app.innerHTML = topbar() + '<div class="center"><p>' + esc(errMsg(e)) + '</p><a class="btn" href="#home">← Trang chính</a></div>'; bindTop() });
  }

  var MCOLS = 20; /* tổng số cột của bảng menu */
  function renderMenu() {
    var scroll = document.querySelector('.wrap'), sx = scroll ? scroll.scrollLeft : 0, sy = scroll ? scroll.scrollTop : 0;
    var h = topbar() +
      '<div class="bar"><a class="btn" href="#home">←</a><h2>Menu</h2>' +
      '<span class="st" id="st"></span><span class="sp"></span>' +
      '<span class="muted" style="font-size:12px">Màn hình quầy đang ở phiên bản ' + (S.menu.version || 0) + '</span>' +
      '<button class="btn" id="reload" type="button">Bỏ thay đổi</button>' +
      '<button class="btn" id="saveOnly" type="button">Chỉ lưu</button>' +
      '<button class="btn pri" id="savePub" type="button">Lưu & cập nhật màn hình quầy</button></div>' +
      '<div class="hint">Khẩu vị chấm thang <b>1–10</b>. <b>Mức</b> là mức chuẩn của món, <b>Min/Max</b> là giới hạn khách được chỉnh. ' +
      'Để trống Mức nếu món không có thanh đó. Món trà thì cột Độ đậm hiện là “Độ đậm trà”. Nhấn Enter hoặc ↑ ↓ để đi giữa các dòng.</div>' +
      '<div class="wrap"><table class="sheet" id="sheet"><thead>' +
      '<tr><th rowspan="2" class="stick1">#</th><th rowspan="2" class="stick2" style="min-width:190px">Tên món</th>' +
      '<th rowspan="2">Ảnh</th><th rowspan="2" style="min-width:96px">Giá (đ)</th><th rowspan="2" style="min-width:220px">Ghi chú ngắn</th>' +
      BARS.map(function (b) { return '<th colspan="3">' + b[1] + '</th>' }).join('') +
      '<th colspan="2">Gợi ý</th><th rowspan="2" style="min-width:200px">Thành phần (1 ly)</th><th rowspan="2">Hiện</th><th rowspan="2"></th></tr>' +
      '<tr>' + BARS.map(function () { return '<th class="sub">Mức</th><th class="sub">Min</th><th class="sub">Max</th>' }).join('') +
      '<th class="sub">Đường</th><th class="sub">Đá</th></tr></thead><tbody>';
    var stt = 0;
    S.menu.cats.forEach(function (c, ci) {
      h += '<tr class="cat" data-c="' + ci + '"><td colspan="' + MCOLS + '"><div class="catbar">' +
        '<input type="text" data-cf="name" value="' + esc(c.name) + '" placeholder="Tên nhóm món">' +
        '<label><input type="checkbox" data-cf="is_active"' + (c.is_active ? ' checked' : '') + '> Hiện</label>' +
        '<button type="button" data-cact="up" title="Đưa nhóm lên">↑</button><button type="button" data-cact="down" title="Đưa nhóm xuống">↓</button>' +
        '<button type="button" class="del" data-cact="del">Xóa nhóm</button><span class="cnt">' + c.items.length + ' món</span></div></td></tr>';
      c.items.forEach(function (it, ii) {
        stt++;
        h += '<tr class="row' + (it.is_active ? '' : ' off') + '" data-c="' + ci + '" data-i="' + ii + '">' +
          '<td class="n stick1">' + stt + '</td>' +
          '<td class="stick2"><input type="text" data-f="name" value="' + esc(it.name) + '" placeholder="Tên món"></td>' +
          '<td class="img"><button type="button" data-act="img" class="' + (it.image_path ? 'has' : '') + '" title="Bấm để đổi ảnh">' +
            (it.image_path ? '<img src="' + esc(imgUrl(it.image_path)) + '" alt="">' : '+ Ảnh') + '</button></td>' +
          '<td class="num"><input type="text" inputmode="numeric" data-f="price" value="' + esc(money(it.price)) + '" placeholder="0"></td>' +
          '<td><input type="text" data-f="description" value="' + esc(it.description) + '" placeholder="VD: Cà phê đậm, béo thơm gạo rang"></td>' +
          BARS.map(function (b) {
            return [0, 1, 2].map(function (k) {
              return '<td class="rt"><input type="text" inputmode="numeric" maxlength="2" data-f="r.' + b[0] + '.' + k + '" value="' + esc(it.r[b[0]][k]) + '"' +
                (b[0] === 'd' && k === 0 && it.sk === 'tra' ? ' title="Độ đậm trà"' : '') + '></td>';
            }).join('');
          }).join('') +
          '<td class="sel"><select data-f="sugar"><option value="">—</option>' + STEPS.map(function (s) {
            return '<option value="' + s + '"' + (String(s) === it.sugar ? ' selected' : '') + '>' + s + '%</option>' }).join('') + '</select></td>' +
          '<td class="sel"><select data-f="ice"><option value="">—</option><option value="none"' + (it.ice === 'none' ? ' selected' : '') + '>Không đá</option>' +
            STEPS.map(function (s) { return '<option value="' + s + '"' + (String(s) === it.ice ? ' selected' : '') + '>' + s + '%</option>' }).join('') + '</select></td>' +
          '<td class="rec"><button type="button" data-act="recipe" class="' + (it.recipe.length ? '' : 'empty') + '" title="' + esc(recipeText(it.recipe)) + '">' +
            (it.recipe.length ? esc(recipeText(it.recipe)) : '+ Thêm thành phần') + '</button></td>' +
          '<td class="chk"><input type="checkbox" data-f="is_active"' + (it.is_active ? ' checked' : '') + ' title="Bỏ tích để ẩn món khỏi màn hình quầy"></td>' +
          '<td class="act"><button type="button" data-act="up" title="Lên">↑</button><button type="button" data-act="down" title="Xuống">↓</button>' +
            '<button type="button" data-act="del" class="del" title="Xóa món">✕</button></td></tr>';
      });
      h += '<tr class="add" data-c="' + ci + '"><td colspan="' + MCOLS + '"><button type="button" data-cact="add">+ Thêm món vào “' + esc(c.name || 'nhóm này') + '”</button></td></tr>';
    });
    h += '</tbody></table></div><div class="below"><button class="btn" id="addCat" type="button">+ Thêm nhóm món</button></div>' +
      '<input type="file" id="imgFile" accept="image/*" hidden>';
    app.innerHTML = h;
    bindTop(); setDirty(S.dirty);
    var w = document.querySelector('.wrap'); w.scrollLeft = sx; w.scrollTop = sy;
    bindMenu();
  }

  function itemAt(el) {
    var tr = el.closest('tr'); if (!tr) return null;
    var ci = +tr.getAttribute('data-c'), ii = tr.getAttribute('data-i');
    return { tr: tr, ci: ci, ii: ii == null ? null : +ii, cat: S.menu.cats[ci], it: ii == null ? null : S.menu.cats[ci].items[+ii] };
  }
  function clamp(v) { return Math.max(1, Math.min(10, v)) }

  function bindMenu() {
    var tb = document.querySelector('#sheet tbody');
    tb.addEventListener('input', function (e) {
      var t = e.target, p = itemAt(t); if (!p) return;
      var cf = t.getAttribute('data-cf'), f = t.getAttribute('data-f');
      if (cf === 'name') p.cat.name = t.value;
      else if (f === 'name' || f === 'description') p.it[f] = t.value;
      else if (f === 'price') p.it.price = digits(t.value);
      else if (f && f.indexOf('r.') === 0) {
        var a = f.split('.'), arr = p.it.r[a[1]], k = +a[2];
        t.value = digits(t.value).slice(0, 2); arr[k] = t.value;
        /* điền Mức mà Min/Max còn trống -> tự điền Mức ± 3 */
        if (k === 0 && t.value !== '' && arr[1] === '' && arr[2] === '') {
          var v = +t.value; arr[1] = String(clamp(v - 3)); arr[2] = String(clamp(v + 3));
          p.tr.querySelector('[data-f="r.' + a[1] + '.1"]').value = arr[1];
          p.tr.querySelector('[data-f="r.' + a[1] + '.2"]').value = arr[2];
        }
        t.parentNode.classList.remove('bad');
      } else return;
      if (t.parentNode.classList) t.parentNode.classList.remove('bad');
      setDirty(true);
    });
    tb.addEventListener('change', function (e) {
      var t = e.target, p = itemAt(t); if (!p) return;
      var cf = t.getAttribute('data-cf'), f = t.getAttribute('data-f');
      if (cf === 'is_active') p.cat.is_active = t.checked;
      else if (f === 'is_active') { p.it.is_active = t.checked; p.tr.classList.toggle('off', !t.checked) }
      else if (f === 'sugar' || f === 'ice') p.it[f] = t.value;
      else if (cf === 'name') { var b = tb.querySelector('tr.add[data-c="' + p.ci + '"] button'); if (b) b.textContent = '+ Thêm món vào “' + (p.cat.name || 'nhóm này') + '”' }
      else return;
      setDirty(true);
    });
    tb.addEventListener('focusout', function (e) {
      var t = e.target; if (t.getAttribute('data-f') !== 'price') return;
      var p = itemAt(t); if (p) t.value = money(p.it.price);
    });
    tb.addEventListener('focusin', function (e) {
      var t = e.target; if (t.getAttribute('data-f') !== 'price') return;
      var p = itemAt(t); if (p) t.value = p.it.price;
    });
    /* Enter / mũi tên lên xuống: sang ô cùng cột ở dòng món kế tiếp */
    tb.addEventListener('keydown', function (e) {
      var t = e.target, f = t.getAttribute('data-f');
      if (!f || t.tagName === 'SELECT' || ['Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var rows = [].slice.call(tb.querySelectorAll('tr.row')), i = rows.indexOf(t.closest('tr'));
      var j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return;
      e.preventDefault();
      var n = rows[j].querySelector('[data-f="' + f + '"]'); if (n) { n.focus(); if (n.select) n.select() }
    });
    tb.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var p = itemAt(b); if (!p) return;
      var act = b.getAttribute('data-act'), cact = b.getAttribute('data-cact'), L = S.menu.cats;
      if (act === 'up' || act === 'down') {
        var to = p.ii + (act === 'up' ? -1 : 1), items = p.cat.items;
        if (to >= 0 && to < items.length) { items.splice(to, 0, items.splice(p.ii, 1)[0]) }
        else if (act === 'up' && p.ci > 0) { L[p.ci - 1].items.push(items.splice(p.ii, 1)[0]) }       /* sang nhóm trên */
        else if (act === 'down' && p.ci < L.length - 1) { L[p.ci + 1].items.unshift(items.splice(p.ii, 1)[0]) } /* sang nhóm dưới */
        else return;
        setDirty(true); renderMenu();
      } else if (act === 'del') {
        if (p.it.id && !confirm('Xóa món “' + (p.it.name || 'chưa đặt tên') + '”? (Chỉ mất hẳn sau khi bấm Lưu)')) return;
        p.cat.items.splice(p.ii, 1); setDirty(true); renderMenu();
      } else if (act === 'img') { pickImage(p.it, b) }
      else if (act === 'recipe') { openRecipe(p.it) }
      else if (cact === 'up' || cact === 'down') {
        var t2 = p.ci + (cact === 'up' ? -1 : 1); if (t2 < 0 || t2 >= L.length) return;
        L.splice(t2, 0, L.splice(p.ci, 1)[0]); setDirty(true); renderMenu();
      } else if (cact === 'del') {
        if (!confirm('Xóa nhóm “' + p.cat.name + '”' + (p.cat.items.length ? ' và ' + p.cat.items.length + ' món trong nhóm' : '') + '? (Chỉ mất hẳn sau khi bấm Lưu)')) return;
        L.splice(p.ci, 1); setDirty(true); renderMenu();
      } else if (cact === 'add') {
        p.cat.items.push(newItem(p.cat)); setDirty(true); renderMenu();
        var rows = document.querySelectorAll('tr.row[data-c="' + p.ci + '"]'), last = rows[rows.length - 1];
        if (last) last.querySelector('[data-f="name"]').focus();
      }
    });
    document.getElementById('addCat').onclick = function () {
      S.menu.cats.push({ id: null, name: '', is_active: true, items: [] }); setDirty(true); renderMenu();
      var ins = document.querySelectorAll('tr.cat input[data-cf="name"]'); ins[ins.length - 1].focus();
    };
    document.getElementById('reload').onclick = function () {
      if (S.dirty && !confirm('Bỏ mọi thay đổi chưa lưu?')) return;
      setDirty(false); viewMenu();
    };
    document.getElementById('saveOnly').onclick = function () { saveMenu(false) };
    document.getElementById('savePub').onclick = function () { saveMenu(true) };
  }

  /* Kiểm tra trước khi gửi: tô đỏ ô sai, cuộn tới ô đầu tiên */
  function validateMenu() {
    var first = null, msg = null, names = {};
    document.querySelectorAll('#sheet td.bad').forEach(function (td) { td.classList.remove('bad') });
    function bad(ci, ii, sel, m) {
      var tr = ii == null ? document.querySelector('tr.cat[data-c="' + ci + '"]') : document.querySelector('tr.row[data-c="' + ci + '"][data-i="' + ii + '"]');
      var el = tr && tr.querySelector(sel); if (el) el.closest('td').classList.add('bad');
      if (!first) { first = el; msg = m }
    }
    var catNames = {};
    S.menu.cats.forEach(function (c, ci) {
      var cn = c.name.trim().toLowerCase();
      if (!cn) bad(ci, null, '[data-cf="name"]', 'Có nhóm món chưa có tên');
      else if (catNames[cn]) bad(ci, null, '[data-cf="name"]', 'Tên nhóm bị trùng: ' + c.name); else catNames[cn] = 1;
      c.items.forEach(function (it, ii) {
        var nm = it.name.trim(), key = nm.toLowerCase();
        if (!nm) bad(ci, ii, '[data-f="name"]', 'Có món chưa có tên (nhóm ' + c.name + ')');
        else if (names[key]) bad(ci, ii, '[data-f="name"]', 'Tên món bị trùng: ' + nm); else names[key] = 1;
        if (it.price === '') bad(ci, ii, '[data-f="price"]', 'Món “' + nm + '” chưa có giá');
        BARS.forEach(function (b) {
          var r = it.r[b[0]]; if (r[0] === '') return;
          var v = +r[0], lo = r[1] === '' ? NaN : +r[1], hi = r[2] === '' ? NaN : +r[2];
          [[v, 0], [lo, 1], [hi, 2]].forEach(function (x) {
            if (!(x[0] >= 1 && x[0] <= 10)) bad(ci, ii, '[data-f="r.' + b[0] + '.' + x[1] + '"]', 'Món “' + nm + '”: ' + b[1] + ' phải từ 1 đến 10');
          });
          if (lo > v || v > hi) bad(ci, ii, '[data-f="r.' + b[0] + '.0"]', 'Món “' + nm + '”: ' + b[1] + ' cần Min ≤ Mức ≤ Max');
        });
      });
    });
    if (first) { first.scrollIntoView({ block: 'center', inline: 'center' }); first.focus() }
    return msg;
  }
  function menuPayload() {
    return {
      categories: S.menu.cats.map(function (c) {
        return {
          id: c.id, name: c.name.trim(), is_active: c.is_active,
          items: c.items.map(function (it) {
            var a = JSON.parse(JSON.stringify(it.extra || {})), rate = {};
            BARS.forEach(function (b) {
              var r = it.r[b[0]]; if (r[0] === '') return;
              var key = b[0] === 'd' ? it.sk : (b[0] === 'n' ? 'ngot' : 'ngay');
              rate[key] = [+r[0], +r[1], +r[2]];
            });
            a.rate = rate;
            if (it.sugar !== '' || it.ice !== '') {
              a.suggest = {};
              if (it.sugar !== '') a.suggest.sugar = +it.sugar;
              if (it.ice !== '' && it.ice !== 'none') a.suggest.ice = +it.ice;
            }
            return { id: it.id, name: it.name.trim(), description: it.description.trim(), image_path: it.image_path || null,
                     price: it.price === '' ? null : +it.price, is_active: it.is_active, attributes: a, recipe: it.recipe };
          })
        };
      })
    };
  }
  function saveMenu(publish) {
    var m = validateMenu(); if (m) return toast(m, true);
    var btns = document.querySelectorAll('.bar button'); btns.forEach(function (b) { b.disabled = true });
    rpc('admin_save_menu', { p_shop_id: S.shop.id, p_data: menuPayload(), p_publish: publish })
      .then(function (d) {
        loadMenuData(d); setDirty(false); renderMenu();
        toast(publish ? 'Đã lưu. Màn hình quầy sẽ đổi sang phiên bản ' + d.published_version + ' khi không có khách đang gọi món.'
                      : 'Đã lưu. Màn hình quầy chưa đổi cho tới khi bấm “Lưu & cập nhật màn hình quầy”.');
      })
      .catch(function (e) { btns.forEach(function (b) { b.disabled = false }); toast(errMsg(e), true) });
  }

  /* ---------------- ảnh món: nén thành WebP rồi tải lên ---------------- */
  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') return res(b);
          c.toBlob(function (b2) { b2 ? res(b2) : rej(new Error('Không xử lý được ảnh này')) }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('File này không phải ảnh')) };
      img.src = url;
    });
  }
  function pickImage(it, btn) {
    var inp = document.getElementById('imgFile');
    inp.value = '';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      btn.textContent = 'Đang tải…'; btn.disabled = true;
      compress(f).then(function (blob) {
        var path = S.shop.id + '/' + uid() + (blob.type === 'image/webp' ? '.webp' : '.jpg');
        return sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
          .then(function (r) { if (r.error) throw r.error; return path });
      }).then(function (path) {
        it.image_path = path; setDirty(true);
        btn.disabled = false; btn.className = 'has'; btn.innerHTML = '<img src="' + esc(imgUrl(path)) + '" alt="">';
        toast('Đã tải ảnh lên. Nhớ bấm Lưu.');
      }).catch(function (e) {
        btn.disabled = false; btn.innerHTML = it.image_path ? '<img src="' + esc(imgUrl(it.image_path)) + '" alt="">' : '+ Ảnh';
        toast('Không tải được ảnh: ' + errMsg(e), true);
      });
    };
    inp.click();
  }

  /* ---------------- hộp thoại thành phần ---------------- */
  function openRecipe(it) {
    var rows = it.recipe.map(function (x) { return { ingredient_id: x.ingredient_id, q: qty(x.quantity) } });
    if (!rows.length) rows.push({ ingredient_id: '', q: '' });
    var m = document.createElement('div'); m.className = 'modal';
    document.body.appendChild(m);
    function opts(sel) {
      return '<option value="">— Chọn nguyên liệu —</option>' + S.menu.ingredients.map(function (g) {
        return '<option value="' + g.id + '"' + (g.id === sel ? ' selected' : '') + '>' + esc(g.name) + ' (' + UNIT[g.unit] + ')</option>';
      }).join('');
    }
    function draw() {
      m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3>Thành phần cho 1 ly “' + esc(it.name || 'món mới') + '”</h3>' +
        '<p class="muted" style="margin:0;font-size:13px">Mỗi ly bán ra sẽ tự trừ đúng các lượng này khỏi kho.</p>' +
        '<table><thead><tr><th>Nguyên liệu</th><th style="width:110px">Lượng</th><th></th><th></th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          var g = ingById(r.ingredient_id);
          return '<tr data-i="' + i + '"><td><select data-k="ingredient_id">' + opts(r.ingredient_id) + '</select></td>' +
            '<td><input data-k="q" inputmode="decimal" value="' + esc(r.q) + '" placeholder="VD: 20"></td>' +
            '<td class="u">' + (g ? UNIT[g.unit] : '') + '</td><td class="x"><button type="button" data-x="' + i + '" title="Bỏ dòng">✕</button></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div><button class="btn" type="button" id="rAdd">+ Thêm dòng</button></div>' +
        '<div class="newing"><span>Chưa có trong danh sách? Tạo nguyên liệu mới:</span>' +
        '<input id="nName" placeholder="Tên, VD: Sữa đặc"><select id="nUnit"><option value="g">g</option><option value="ml">ml</option><option value="piece">cái</option></select>' +
        '<button class="btn" type="button" id="nAdd">Tạo</button></div>' +
        '<div class="foot"><button class="btn" type="button" id="rCancel">Hủy</button><button class="btn pri" type="button" id="rOk">Xong</button></div></div>';
      m.querySelectorAll('[data-k]').forEach(function (el) {
        el.oninput = el.onchange = function () {
          var i = +el.closest('tr').getAttribute('data-i'); rows[i][el.getAttribute('data-k')] = el.value;
          if (el.tagName === 'SELECT') { var g = ingById(el.value); el.closest('tr').querySelector('.u').textContent = g ? UNIT[g.unit] : '' }
        };
      });
      m.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { rows.splice(+b.getAttribute('data-x'), 1); draw() } });
      m.querySelector('#rAdd').onclick = function () { rows.push({ ingredient_id: '', q: '' }); draw() };
      m.querySelector('#rCancel').onclick = close;
      m.querySelector('#nAdd').onclick = function () {
        var nm = m.querySelector('#nName').value.trim(), un = m.querySelector('#nUnit').value, b = this;
        if (!nm) return toast('Điền tên nguyên liệu', true);
        b.disabled = true;
        rpc('admin_save_stock', { p_shop_id: S.shop.id, p_rows: [{ name: nm, unit: un }] }).then(function (list) {
          S.menu.ingredients = list.filter(function (g) { return g.is_active }).map(function (g) { return { id: g.id, name: g.name, unit: g.unit } });
          var g = list.filter(function (x) { return x.name.toLowerCase() === nm.toLowerCase() })[0];
          var empty = rows.filter(function (r) { return !r.ingredient_id })[0];
          if (empty) empty.ingredient_id = g.id; else rows.push({ ingredient_id: g.id, q: '' });
          draw(); toast('Đã tạo nguyên liệu “' + g.name + '”');
        }).catch(function (e) { b.disabled = false; toast(errMsg(e), true) });
      };
      m.querySelector('#rOk').onclick = function () {
        var out = [], err = null;
        rows.forEach(function (r) {
          if (!r.ingredient_id && String(r.q).trim() === '') return;      /* dòng trống: bỏ qua */
          var q = parseQty(r.q);
          if (!r.ingredient_id) err = 'Có dòng chưa chọn nguyên liệu';
          else if (!(q > 0)) err = 'Lượng phải là số lớn hơn 0';
          else out.push({ ingredient_id: r.ingredient_id, quantity: q });
        });
        if (err) return toast(err, true);
        it.recipe = out; setDirty(true); close(); renderMenu();
      };
    }
    function close() { m.remove(); document.removeEventListener('keydown', esck) }
    function esck(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esck);
    draw();
  }

  /* =====================================================================
     BẢNG KHO NGUYÊN LIỆU
     ===================================================================== */
  function stockFrom(g) {
    return { id: g.id, name: g.name, unit: g.unit, cur: Number(g.current_stock), thr: g.low_stock_threshold == null ? '' : qty(g.low_stock_threshold),
             is_active: g.is_active, used: g.used_in || [], add: '', cost: '', cnt: '', dirty: false };
  }
  function viewStock() {
    app.innerHTML = topbar() + '<div class="center"><p class="muted">Đang tải kho…</p></div>';
    bindTop();
    rpc('admin_get_stock', { p_shop_id: S.shop.id }).then(function (list) { S.stock = list.map(stockFrom); renderStock() })
      .catch(function (e) { app.innerHTML = topbar() + '<div class="center"><p>' + esc(errMsg(e)) + '</p><a class="btn" href="#quanly">← Quản lý</a></div>'; bindTop() });
  }
  function isLow(r) { var t = parseQty(r.thr); return r.is_active && r.id && t != null && !isNaN(t) && r.cur <= t }
  function preview(r) {
    var c = parseQty(r.cnt), a = parseQty(r.add);
    if (c != null && !isNaN(c)) return c;
    if (a != null && !isNaN(a) && a > 0) return r.cur + a;
    return null;
  }
  function curCell(r) {
    var p = preview(r);
    return (r.id ? qty(r.cur) + ' ' + UNIT[r.unit] : '<span class="muted">mới</span>') +
      (isLow(r) ? ' ⚠' : '') + (p != null ? '<small>→ ' + qty(p) + ' ' + UNIT[r.unit] + '</small>' : '');
  }
  function renderStock() {
    var low = S.stock.filter(isLow);
    var h = topbar() +
      '<div class="bar"><a class="btn" href="#quanly">←</a><h2>Kho nguyên liệu</h2><span class="st" id="st"></span><span class="sp"></span>' +
      '<button class="btn" id="sReload" type="button">Bỏ thay đổi</button><button class="btn pri" id="sSave" type="button">Lưu</button></div>' +
      (low.length ? '<div class="alert">Sắp hết: ' + low.map(function (r) { return esc(r.name) + ' (còn ' + qty(r.cur) + ' ' + UNIT[r.unit] + ')' }).join(', ') + '</div>' : '') +
      '<div class="hint">Mỗi ly bán xong, kho <b>tự trừ</b> theo cột Thành phần ở bảng Menu. ' +
      'Sáng nhập hàng: điền <b>Nhập thêm</b>. Đếm lại kho: điền <b>Đếm thực tế</b> (số đếm sẽ thay cho tồn trên máy). Xong bấm <b>Lưu</b>. ' +
      'Đơn vị g/ml/cái: 1 kg = 1000 g, 1 lít = 1000 ml.</div>' +
      '<div class="wrap"><table class="sheet" id="stk"><thead><tr>' +
      '<th class="stick1">#</th><th class="stick2" style="min-width:200px">Tên nguyên liệu</th><th>Đơn vị</th><th style="min-width:120px">Tồn hiện tại</th>' +
      '<th style="min-width:120px">Báo sắp hết khi còn</th><th style="min-width:110px">Nhập thêm</th><th style="min-width:120px">Tiền nhập (đ)</th>' +
      '<th style="min-width:110px">Đếm thực tế</th><th>Dùng trong món</th><th>Đang dùng</th></tr></thead><tbody>' +
      S.stock.map(function (r, i) {
        var lockUnit = r.id && r.cur !== 0;
        return '<tr class="row' + (r.is_active ? '' : ' off') + '" data-i="' + i + '">' +
          '<td class="n stick1">' + (i + 1) + '</td>' +
          '<td class="stick2"><input type="text" data-f="name" value="' + esc(r.name) + '" placeholder="VD: Cà phê hạt"></td>' +
          '<td class="sel"><select data-f="unit"' + (lockUnit ? ' disabled title="Đã có tồn kho nên không đổi đơn vị"' : '') + '>' +
            ['g', 'ml', 'piece'].map(function (u) { return '<option value="' + u + '"' + (u === r.unit ? ' selected' : '') + '>' + UNIT[u] + '</option>' }).join('') + '</select></td>' +
          '<td class="ro' + (isLow(r) ? ' low' : '') + '" data-cur>' + curCell(r) + '</td>' +
          '<td class="num"><input type="text" inputmode="decimal" data-f="thr" value="' + esc(r.thr) + '" placeholder="—"></td>' +
          '<td class="num"><input type="text" inputmode="decimal" data-f="add" value="' + esc(r.add) + '" placeholder="0"></td>' +
          '<td class="num"><input type="text" inputmode="numeric" data-f="cost" value="' + esc(r.cost) + '" placeholder="không bắt buộc"></td>' +
          '<td class="num"><input type="text" inputmode="decimal" data-f="cnt" value="' + esc(r.cnt) + '" placeholder="—"></td>' +
          '<td class="used" title="' + esc(r.used.join(', ')) + '">' + (r.used.length ? esc(r.used.join(', ')) : '<span class="muted">chưa dùng</span>') + '</td>' +
          '<td class="chk"><input type="checkbox" data-f="is_active"' + (r.is_active ? ' checked' : '') + '></td></tr>';
      }).join('') +
      (S.stock.length ? '' : '<tr><td colspan="10" style="padding:16px;text-align:center" class="muted">Chưa có nguyên liệu nào. Bấm “+ Thêm nguyên liệu”.</td></tr>') +
      '</tbody></table></div><div class="below"><button class="btn" id="sAdd" type="button">+ Thêm nguyên liệu</button></div>';
    app.innerHTML = h; bindTop(); setDirty(S.dirty);
    var tb = document.querySelector('#stk tbody');
    function rowOf(t) { var tr = t.closest('tr'); return tr && tr.hasAttribute('data-i') ? { tr: tr, r: S.stock[+tr.getAttribute('data-i')] } : null }
    tb.addEventListener('input', function (e) {
      var t = e.target, p = rowOf(t), f = t.getAttribute('data-f'); if (!p || !f) return;
      if (f === 'cost') { t.value = money(digits(t.value)); p.r.cost = digits(t.value) }
      else if (f !== 'is_active' && f !== 'unit') p.r[f] = t.value;
      t.closest('td').classList.remove('bad');
      var cell = p.tr.querySelector('[data-cur]'); cell.innerHTML = curCell(p.r); cell.classList.toggle('low', isLow(p.r));
      p.r.dirty = true; setDirty(true);
    });
    tb.addEventListener('change', function (e) {
      var t = e.target, p = rowOf(t), f = t.getAttribute('data-f'); if (!p) return;
      if (f === 'is_active') { p.r.is_active = t.checked; p.tr.classList.toggle('off', !t.checked) }
      else if (f === 'unit') { p.r.unit = t.value; p.tr.querySelector('[data-cur]').innerHTML = curCell(p.r) }
      else return;
      p.r.dirty = true; setDirty(true);
    });
    tb.addEventListener('keydown', function (e) {
      var t = e.target, f = t.getAttribute('data-f');
      if (!f || t.tagName === 'SELECT' || ['Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var rows = [].slice.call(tb.querySelectorAll('tr.row')), i = rows.indexOf(t.closest('tr')), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return;
      e.preventDefault(); var n = rows[j].querySelector('[data-f="' + f + '"]'); if (n) { n.focus(); n.select && n.select() }
    });
    document.getElementById('sAdd').onclick = function () {
      S.stock.push({ id: null, name: '', unit: 'g', cur: 0, thr: '', is_active: true, used: [], add: '', cost: '', cnt: '', dirty: true });
      setDirty(true); renderStock();
      var ins = document.querySelectorAll('#stk input[data-f="name"]'); ins[ins.length - 1].focus();
    };
    document.getElementById('sReload').onclick = function () {
      if (S.dirty && !confirm('Bỏ mọi thay đổi chưa lưu?')) return;
      setDirty(false); viewStock();
    };
    document.getElementById('sSave').onclick = saveStock;
  }
  function saveStock() {
    var rows = [], first = null, msg = null, names = {};
    document.querySelectorAll('#stk td.bad').forEach(function (td) { td.classList.remove('bad') });
    S.stock.forEach(function (r, i) {
      var tr = document.querySelector('#stk tr[data-i="' + i + '"]');
      function bad(f, m) { var el = tr.querySelector('[data-f="' + f + '"]'); el.closest('td').classList.add('bad'); if (!first) { first = el; msg = m } }
      var nm = r.name.trim(), key = nm.toLowerCase();
      if (!nm) { if (!r.id) return; bad('name', 'Có nguyên liệu chưa có tên') }
      else if (names[key]) bad('name', 'Tên nguyên liệu bị trùng: ' + nm); else names[key] = 1;
      var thr = parseQty(r.thr), add = parseQty(r.add), cnt = parseQty(r.cnt);
      if (isNaN(thr) || thr < 0) bad('thr', 'Mức báo sắp hết phải là số');
      if (isNaN(add) || add < 0) bad('add', 'Nhập thêm phải là số dương');
      if (isNaN(cnt) || cnt < 0) bad('cnt', 'Đếm thực tế phải là số');
      if (!r.dirty) return;
      rows.push({ id: r.id, name: nm, unit: r.unit, low_stock_threshold: thr, is_active: r.is_active,
                  add_qty: add, add_cost: r.cost === '' ? null : +r.cost, counted: cnt });
    });
    if (first) { first.focus(); return toast(msg, true) }
    if (!rows.length) return toast('Không có gì thay đổi');
    var b = document.getElementById('sSave'); b.disabled = true;
    rpc('admin_save_stock', { p_shop_id: S.shop.id, p_rows: rows }).then(function (list) {
      S.stock = list.map(stockFrom); setDirty(false); renderStock(); toast('Đã lưu kho');
    }).catch(function (e) { b.disabled = false; toast(errMsg(e), true) });
  }

  /* ---------------- khởi động ---------------- */
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s || !s.user || s.user.is_anonymous) { S.user = null; return }
    S.user = s.user;
    return loadShops();
  }).catch(function () { S.user = null }).then(route);
})();
