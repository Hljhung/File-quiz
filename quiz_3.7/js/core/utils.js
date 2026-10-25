/* ============================================================================
 *  MODULE: js/core/utils.js — HÀM TIỆN ÍCH DÙNG CHUNG
 *  ---------------------------------------------------------------------------
 *  Vai trò:
 *    - Chứa các hàm "hạ tầng" được nhiều module khác sử dụng: escape HTML, tạo
 *      phần tử từ chuỗi, nhân bản sâu đối tượng, kẹp giá trị, sinh id, debounce.
 *    - Chứa hai nhóm hàm chuyên biệt cho câu hỏi "nối ô" (matching):
 *        · Hình học SVG  : đổi toạ độ viewport sang user space của SVG.
 *        · Đồ thị nối   : các hàm thuần xử lý danh sách cặp nối nhiều-nhiều.
 *  Quy ước:
 *    - Tất cả hàm ở đây KHÔNG phụ thuộc trạng thái ứng dụng (pure / gần pure),
 *      nhờ vậy có thể tái sử dụng trong builder, editor và player.
 *  Ghi chú cho AI:
 *    - File này phải được nạp TRƯỚC mọi module khác trong index.html.
 *    - Không khai báo biến toàn cục mới ở đây (chỉ hàm) để tránh xung đột.
 * ========================================================================== */

/**
 * Chuyển ký tự đặc biệt thành dạng an toàn để chèn vào HTML.
 * Dùng cho MỌI chuỗi do người dùng nhập trước khi nội suy vào innerHTML.
 *
 * @param {*} text - giá trị gốc (có thể là number, null, undefined)
 * @returns {string} chuỗi đã được escape (& < > " ' đều an toàn)
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text === undefined || text === null ? '' : String(text);
    return div.innerHTML;
}

/**
 * Tạo một HTMLElement từ chuỗi HTML (chỉ lấy phần tử đầu tiên).
 * Tiện cho việc dựng UI động mà không cần thư viện.
 *
 * @param {string} html - mã HTML cần chuyển
 * @returns {HTMLElement} phần tử đầu tiên trong chuỗi
 */
function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
}

/**
 * Nhân bản sâu một đối tượng "thuần dữ liệu" (JSON-serializable).
 * Được dùng khi chạy quiz: mỗi lượt chơi làm việc trên bản sao để không
 * làm hỏng dữ liệu gốc mà người dùng đã thiết kế trong builder.
 *
 * @param {*} obj - đối tượng cần nhân bản
 * @returns {*} bản sao độc lập
 */
function deepClone(obj) {
    return obj === undefined ? obj : JSON.parse(JSON.stringify(obj));
}

/**
 * Kẹp một số trong khoảng [min, max].
 *
 * @param {number} value - giá trị cần kẹp
 * @param {number} min - cận dưới
 * @param {number} max - cận trên
 * @returns {number} giá trị sau khi kẹp
 */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/** Bộ đếm dùng cho các id tạm (khối lệnh, dòng nhập...) */
let __uidCounter = 0;

/**
 * Sinh id duy nhất trong phiên làm việc.
 * @param {string} [prefix='id'] - tiền tố mong muốn
 * @returns {string} ví dụ 'node-12'
 */
function uid(prefix) {
    __uidCounter += 1;
    return (prefix || 'id') + '-' + __uidCounter;
}

/**
 * Trì hoãn gọi hàm cho tới khi người dùng ngừng thao tác (dùng cho ô nhập).
 *
 * @param {Function} fn - hàm cần gọi
 * @param {number} wait - thời gian chờ (ms)
 * @returns {Function} hàm đã bọc
 */
function debounce(fn, wait) {
    let timer = null;

    return function () {
        const args = arguments;
        const self = this;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
}

/* ==========================================================================
 *  HÀM DÙNG CHUNG CHO CÂU HỎI "NỐI Ô" (MATCHING)
 * --------------------------------------------------------------------------
 *  Bài toán: đường nối được vẽ bằng một thẻ <svg> phủ đè lên hai cột.
 *  Toạ độ điểm nối phải nằm trong "user space" của SVG (tức là bằng đơn vị
 *  bố cục của vùng chứa), còn getBoundingClientRect() trả về toạ độ ĐÃ BỊ
 *  BIẾN ĐỔI khi vùng chứa nằm trong một phép scale/translate.
 *
 *  Ví dụ thật trong dự án:
 *    · Modal cấu hình có animation "sbPopIn" (scale .6 → 1.06 → 1).
 *    · Bản xem trước trong sân khấu dùng transform: scale(...).
 *  Nếu lấy thẳng số đo từ getBoundingClientRect() rồi đưa vào <path>,
 *  đường nối sẽ bị lệch (đúng bằng hệ số scale tại thời điểm vẽ).
 *
 *  Giải pháp: chuyển toạ độ viewport thành toạ độ user space của SVG bằng
 *  ma trận getScreenCTM() của chính thẻ SVG. Cách này đúng với MỌI phép
 *  biến đổi nên đường nối luôn bám chặt vào điểm nối.
 * ========================================================================== */

/**
 * Chuyển một điểm trong toạ độ viewport (clientX/clientY) sang hệ toạ độ
 * user space của thẻ SVG.
 *
 * @param {SVGGraphicsElement} svgEl - thẻ <svg> đích
 * @param {number} clientX - toạ độ X theo viewport
 * @param {number} clientY - toạ độ Y theo viewport
 * @returns {{x: number, y: number}|null} điểm trong user space (null nếu chưa render)
 */
function svgPointFromClient(svgEl, clientX, clientY) {
    if (!svgEl || typeof svgEl.getScreenCTM !== 'function') return null;
    var ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    /* Đảo ma trận affine [a c e; b d f; 0 0 1] */
    var det = ctm.a * ctm.d - ctm.b * ctm.c;
    if (!det) return null;
    var x = clientX - ctm.e;
    var y = clientY - ctm.f;
    return {
        x: (ctm.d * x - ctm.c * y) / det,
        y: (-ctm.b * x + ctm.a * y) / det
    };
}

/**
 * Tính hai đầu đoạn nối giữa cúc tròn bên trái và cúc tròn bên phải,
 * trả về theo hệ toạ độ user space của thẻ SVG overlay.
 *
 * @param {SVGGraphicsElement} svgEl - thẻ <svg> overlay
 * @param {Element} leftEl - cúc tròn bên trái
 * @param {Element} rightEl - cúc tròn bên phải
 * @returns {{x1:number,y1:number,x2:number,y2:number}|null} toạ độ hai đầu đoạn
 */
function matchConnectorPoints(svgEl, leftEl, rightEl) {
    if (!svgEl || !leftEl || !rightEl) return null;
    var lr = leftEl.getBoundingClientRect();
    var rr = rightEl.getBoundingClientRect();
    if (!lr.width || !rr.width) return null;
    var p1 = svgPointFromClient(svgEl, lr.right, lr.top + lr.height / 2);
    var p2 = svgPointFromClient(svgEl, rr.left, rr.top + rr.height / 2);
    if (!p1 || !p2) return null;
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/**
 * Dựng lệnh path của đường nối (cung cong nhô về giữa khoảng trống hai cột).
 *
 * @param {number} x1 - toạ độ X đầu (mép phải cúc trái)
 * @param {number} y1 - toạ độ Y đầu
 * @param {number} x2 - toạ độ X cuối (mép trái cúc phải)
 * @param {number} y2 - toạ độ Y cuối
 * @returns {string} chuỗi thuộc tính "d" cho thẻ <path>
 */
function matchConnectorPath(x1, y1, x2, y2) {
    var mx = (x1 + x2) / 2;
    return 'M ' + x1 + ' ' + y1
        + ' Q ' + mx + ' ' + y1 + ' ' + mx + ' ' + ((y1 + y2) / 2)
        + ' T ' + x2 + ' ' + y2;
}

/**
 * Cập nhật kích thước thực (không bị transform) của thẻ SVG overlay theo
 * kích thước bố cục của vùng chứa, để 1 đơn vị user space = 1 px bố cục.
 *
 * @param {SVGGraphicsElement} svgEl - thẻ <svg> overlay
 * @param {Element} hostEl - vùng chứa (position: relative)
 */
function syncSvgOverlaySize(svgEl, hostEl) {
    if (!svgEl || !hostEl) return;
    var w = hostEl.clientWidth || 0;
    var h = hostEl.clientHeight || 0;
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));
    svgEl.style.width = w + 'px';
    svgEl.style.height = h + 'px';
}

/* ==========================================================================
 *  HÀM DÙNG CHUNG CHO QUAN HỆ NỐI Ô NHIỀU-NHIỀU (MATCHING MANY-TO-MANY)
 *  ---------------------------------------------------------------------------
 *  Cấu trúc chuẩn của `block.data.answers` là DANH SÁCH MẢNG, mỗi mảng là
 *  một cặp nối [idKháiNiệm, nộiDungGiảiThích]:
 *
 *      answers: [['c1', 'Giải thích A'],
 *                ['c1', 'Giải thích B'],
 *                ['c2', 'Giải thích A']]
 *
 *  Nhờ vậy MỘT khái niệm có thể nối N giải thích và MỘT giải thích có thể
 *  nối N khái niệm, mà không cặp nào đã thiết lập trước đó bị mất đi.
 *
 *  Mọi hàm dưới đây là hàm thuần (pure): chỉ đọc/ghi trên mảng cặp nối được
 *  truyền vào, không đụng tới trạng thái ứng dụng.
 * ========================================================================== */

/** Khoá duy nhất cho một cặp nối (dùng để so sánh nhanh và loại trùng). */
function matchingLinkKey(leftId, rightText) {
    return leftId + '' + rightText;
}

/**
 * Chuẩn hoá danh sách cặp nối về dạng mảng [idKháiNiệm, giảiThích].
 * Chấp nhận cả định dạng mới (danh sách mảng) lẫn định dạng cũ
 * ({ idKháiNiệm: [giải thích, ...] }) và luôn loại bỏ cặp trùng.
 *
 * @param {*} raw - dữ liệu cặp nối thô (mảng hoặc object cũ)
 * @returns {Array<Array>} danh sách cặp nối đã chuẩn hoá
 */
function matchingNormalizeLinks(raw) {
    const out = [];
    const seen = Object.create(null);
    const push = function (leftId, rightText) {
        if (typeof leftId !== 'string' || !leftId) return;
        if (typeof rightText !== 'string' || !rightText) return;
        const key = matchingLinkKey(leftId, rightText);
        if (seen[key]) return;
        seen[key] = true;
        out.push([leftId, rightText]);
    };
    if (Array.isArray(raw)) {
        raw.forEach(function (pair) {
            if (Array.isArray(pair)) push(pair[0], pair[1]);
            else if (pair && typeof pair === 'object') push(pair.left, pair.right);
        });
    } else if (raw && typeof raw === 'object') {
        /* Định dạng cũ: { idKháiNiệm: [giải thích, ...] } */
        Object.keys(raw).forEach(function (cid) {
            const list = raw[cid];
            if (Array.isArray(list)) list.forEach(function (exp) { push(cid, exp); });
        });
    }
    return out;
}

/**
 * Thêm MỘT cặp nối mà không đụng tới các cặp đã có (quan hệ nhiều-nhiều).
 *
 * @param {Array<Array>} links - danh sách cặp nối (được sửa tại chỗ)
 * @param {string} leftId - id khái niệm
 * @param {string} rightText - nội dung giải thích
 * @returns {boolean} true nếu vừa thêm mới (false nếu cặp đó đã tồn tại)
 */
function matchingAddLink(links, leftId, rightText) {
    if (!Array.isArray(links)) return false;
    if (typeof leftId !== 'string' || !leftId) return false;
    if (typeof rightText !== 'string' || !rightText) return false;
    const key = matchingLinkKey(leftId, rightText);
    for (let i = 0; i < links.length; i++) {
        if (matchingLinkKey(links[i][0], links[i][1]) === key) return false;
    }
    links.push([leftId, rightText]);
    return true;
}

/**
 * Gỡ đúng MỘT cặp nối.
 *
 * @param {Array<Array>} links - danh sách cặp nối (được sửa tại chỗ)
 * @param {string} leftId - id khái niệm
 * @param {string} rightText - nội dung giải thích
 * @returns {boolean} true nếu đã gỡ
 */
function matchingRemoveLink(links, leftId, rightText) {
    if (!Array.isArray(links)) return false;
    const key = matchingLinkKey(leftId, rightText);
    let removed = false;
    const kept = [];
    links.forEach(function (pair) {
        if (matchingLinkKey(pair[0], pair[1]) === key) { removed = true; return; }
        kept.push(pair);
    });
    links.length = 0;
    kept.forEach(function (p) { links.push(p); });
    return removed;
}

/**
 * Gỡ MỌI cặp nối đi tới một giải thích (dùng khi người chơi bỏ nối một ô
 * bên phải đang gắn với nhiều khái niệm).
 *
 * @param {Array<Array>} links - danh sách cặp nối (được sửa tại chỗ)
 * @param {string} rightText - nội dung giải thích
 * @returns {number} số cặp đã gỡ
 */
function matchingRemoveLinksTo(links, rightText) {
    if (!Array.isArray(links)) return 0;
    let count = 0;
    const kept = [];
    links.forEach(function (pair) {
        if (pair[1] === rightText) { count += 1; return; }
        kept.push(pair);
    });
    links.length = 0;
    kept.forEach(function (p) { links.push(p); });
    return count;
}

/**
 * Danh sách giải thích đang nối với một khái niệm.
 * @param {Array<Array>} links - danh sách cặp nối
 * @param {string} leftId - id khái niệm
 * @returns {Array<string>} các giải thích đang nối
 */
function matchingTargetsOf(links, leftId) {
    if (!Array.isArray(links)) return [];
    return links.filter(function (p) { return p[0] === leftId; })
        .map(function (p) { return p[1]; });
}

/**
 * Danh sách khái niệm đang nối với một giải thích.
 * @param {Array<Array>} links - danh sách cặp nối
 * @param {string} rightText - nội dung giải thích
 * @returns {Array<string>} các id khái niệm đang nối
 */
function matchingOwnersOf(links, rightText) {
    if (!Array.isArray(links)) return [];
    return links.filter(function (p) { return p[1] === rightText; })
        .map(function (p) { return p[0]; });
}

/**
 * Đếm số khái niệm đang nối với một giải thích.
 * @param {Array<Array>} links - danh sách cặp nối
 * @param {string} rightText - nội dung giải thích
 * @returns {number} số khái niệm đang nối
 */
function matchingOwnerCount(links, rightText) {
    if (!Array.isArray(links)) return 0;
    let n = 0;
    links.forEach(function (p) { if (p[1] === rightText) n += 1; });
    return n;
}
