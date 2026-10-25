/* ============================================================================
 *  MODULE: js/coding/coding-ui.js — GIAO DIỆN KÉO THẢ KHỐI LỆNH (SCRATCH-LIKE)
 *  ============================================================================
 *  Nhiệm vụ: dựng "Vùng lập trình khối" bên trong bảng cấu hình câu hỏi.
 *
 *  Bố cục giao diện:
 *    ┌────────────────────────────────────────────────────────────────┐
 *    │ Thanh công cụ: [Biến: a, b]     [▶ Chạy thử] [🧹 Xoá hết]      │
 *    ├───────────────┬────────────────────────────────────────────────┤
 *    │  DANH MỤC     │  3 CHƯƠNG TRÌNH (chồng lệnh)                   │
 *    │  📦 Biến      │   🏁 khi bắt đầu câu hỏi                       │
 *    │  🧮 Toán      │   ✅ khi trả lời đúng                          │
 *    │  🔀 Điều kiện │   ❌ khi trả lời sai                           │
 *    │  🔤 Chuỗi     │                                                │
 *    │  ❓ Câu hỏi   │                                                │
 *    │  🎮 Trò chơi  │  (kéo khối thả vào DANH MỤC này = XOÁ)          │
 *
 *  QUY TẮC XOÁ KHỐI LỆNH (bản 2.1):
 *    - Đã BỎ nút ✕ trên mỗi khối và vùng 🗑️ riêng.
 *    - Muốn xoá: kéo khối từ vùng lập trình thả trở lại DANH MỤC bên trái;
 *      danh mục sáng đỏ (class .is-over-trash) rồi khối bị xoá ngay khi thả.
 *    ├───────────────┴────────────────────────────────────────────────┤
 *    │ Kết quả "Chạy thử" (biến, câu hỏi sau random, điểm, lời nhắn)  │
 *    └────────────────────────────────────────────────────────────────┘
 *
 *  KỸ THUẬT KÉO THẢ:
 *    - Dùng HTML5 Drag & Drop (draggable + dragover + drop) => không cần thư
 *      viện ngoài, hoạt động mượt trong phạm vi một modal.
 *    - Mỗi danh sách khối (chồng lệnh hoặc thân khối C) có các "khe" (gap)
 *      giữa các khối. Khe mang data-list-id + data-index, nhờ vậy việc chèn
 *      đúng vị trí không phụ thuộc vào tính toán hình học.
 *    - Ổ nhập (slot) cũng là vùng thả: kéo khối tròn (reporter) vào để lồng
 *      biểu thức, giống Scratch.
 *    - Sau mỗi thay đổi cấu trúc, giao diện được vẽ lại toàn bộ; riêng khi
 *      người dùng GÕ vào ô nhập thì chỉ cập nhật mô hình (không vẽ lại) để
 *      không mất con trỏ.
 *
 *  API công khai:
 *      QuizCodingUI.mount(container, block)  // dựng giao diện cho một khối
 *      QuizCodingUI.sync()                   // ghi mô hình trở lại block.data
 *      QuizCodingUI.refresh()                // vẽ lại (dùng cho test)
 *      QuizCodingUI.unmount()                // dọn dẹp khi đóng modal
 * ========================================================================== */

(function (global) {
    'use strict';

    /** Tham chiếu engine (đã nạp trước trong index.html) */
    const Engine = global.QuizCoding;

    /** Mô tả 3 chồng lệnh */
    const STACKS = [
        {
            id: 'setup', icon: '🏁', title: 'khi bắt đầu câu hỏi', color: '#ffbf00',
            hint: 'Chạy khi câu hỏi xuất hiện: tạo số ngẫu nhiên, đặt nội dung câu hỏi/ghi chú.'
        },
        {
            id: 'correct', icon: '✅', title: 'khi trả lời đúng', color: '#59c059',
            hint: 'Tính điểm thưởng. Không có khối nào => dùng điểm ở tab "Cấu hình".'
        },
        {
            id: 'wrong', icon: '❌', title: 'khi trả lời sai', color: '#ff6680',
            hint: 'Có thể đặt lời nhắn/gợi ý hiển thị sau khi người chơi trả lời sai.'
        }
    ];

    /* --------------------------- TRẠNG THÁI NỘI BỘ ------------------------- */
    let root = null;          // phần tử chứa toàn bộ giao diện
    let blockRef = null;      // khối câu hỏi đang chỉnh sửa
    let program = null;       // chương trình (tham chiếu tới block.data.program)
    let drag = null;          // thông tin thao tác kéo hiện tại
    let boundRoot = null;     // phần tử đã gắn sự kiện (tránh gắn trùng)

    /* ========================================================================
     *  1. DỰNG KHUNG GIAO DIỆN
     * ====================================================================== */

    /**
     * Dựng giao diện lập trình khối cho một câu hỏi.
     * @param {HTMLElement} container - nơi chứa (thường là #editor-code-container)
     * @param {Object} block - khối câu hỏi đang chỉnh sửa
     */
    function mount(container, block) {
        if (!container || !block) return;

        root = container;
        blockRef = block;
        program = Engine.ensureProgram(block.data);
        drag = null;

        root.innerHTML =
            '<div class="coding-panel">'
            +   '<div class="coding-toolbar">'
            +     '<div class="coding-vars">'
            +       '<label for="coding-vars-input">📦 Biến:</label>'
            +       '<input id="coding-vars-input" type="text" class="form-input"'
            +         ' placeholder="a, b, ketQua (cách nhau bởi dấu phẩy)">'
            +       '<span class="coding-sysvars"></span>'
            +     '</div>'
            +     '<div class="coding-actions">'
            +       '<button type="button" class="btn btn-primary" data-coding-action="run">▶ Chạy thử</button>'
            +       '<button type="button" class="btn btn-ghost" data-coding-action="clear">🧹 Xoá hết</button>'
            +     '</div>'
            +   '</div>'
            +   '<div class="coding-hint">'
            +     'Kéo khối từ danh mục bên trái vào một trong ba chương trình · '
            +     'kéo khối trả lại danh mục để <b>xoá</b> · '
            +     'dùng <code>{{tenBien}}</code> trong nội dung câu hỏi/đáp án để chèn giá trị ngẫu nhiên.'
            +   '</div>'
            +   '<div class="coding-main">'
            +     '<aside class="coding-palette" id="coding-palette"></aside>'
            +     '<div class="coding-workspace" id="coding-workspace"></div>'
            +   '</div>'
            +   '<div class="coding-output" id="coding-output" hidden></div>'
            + '</div>';

        bindEvents();
        renderAll();

        /* Chú thích hai biến hệ thống (luôn có sẵn, người dùng không cần khai báo) */
        const legend = root.querySelector('.coding-sysvars');
        if (legend) {
            legend.textContent = '🔒 Có sẵn: ' + Engine.SYSTEM_VARS.map(function (v) {
                return v.icon + ' ' + v.name;
            }).join(' · ');
            legend.title = Engine.SYSTEM_VARS.map(function (v) {
                return v.name + ': ' + v.desc;
            }).join('\n');
        }
    }

    /**
     * Gắn toàn bộ sự kiện (uỷ quyền) cho giao diện. Chỉ gắn một lần.
     */
    function bindEvents() {
        if (boundRoot === root) return;
        boundRoot = root;

        /* --- Nút trên thanh công cụ --- */
        root.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-coding-action]');
            if (!btn) return;

            const action = btn.dataset.codingAction;
            if (action === 'run') runPreview();
            if (action === 'clear') clearAll();
        });

        /* --- Thay đổi danh sách biến --- */
        root.addEventListener('change', function (e) {
            if (e.target.id !== 'coding-vars-input') return;
            setVariablesFromInput(e.target.value);
        });

        /* --- Bắt đầu kéo --- */
        root.addEventListener('dragstart', function (e) {
            const paletteItem = e.target.closest('[data-palette-type]');
            const nodeEl = e.target.closest('.cb[data-node-id]');

            if (paletteItem) {
                drag = { mode: 'new', type: paletteItem.dataset.paletteType };

            } else if (nodeEl) {
                const id = nodeEl.dataset.nodeId;
                const slot = nodeEl.closest('.cb-slot');

                if (slot) {
                    // Khối đang nằm trong một ổ => ghi nhớ vị trí cũ để gỡ ra
                    drag = {
                        mode: 'slot', id: id,
                        parentId: slot.dataset.slotParent,
                        slotName: slot.dataset.slotName
                    };
                } else {
                    drag = { mode: 'move', id: id };
                }

            } else {
                return;
            }

            // dataTransfer là bắt buộc với Firefox/Edge
            try {
                e.dataTransfer.setData('text/plain', drag.id || drag.type || 'block');
                e.dataTransfer.effectAllowed = drag.mode === 'new' ? 'copy' : 'move';
            } catch (err) { /* bỏ qua */ }

            if (nodeEl) nodeEl.classList.add('cb-dragging');
            root.classList.add('coding-is-dragging');
        });

        /* --- Kết thúc kéo: dọn dẹp trạng thái --- */
        root.addEventListener('dragend', function () {
            root.querySelectorAll('.cb-dragging').forEach(function (el) {
                el.classList.remove('cb-dragging');
            });
            clearHighlight();
            root.classList.remove('coding-is-dragging');
            drag = null;
        });

        /* --- Khi rê qua các vùng thả --- */
        root.addEventListener('dragover', function (e) {
            if (!drag) return;

            /* Danh mục khối bên trái = VÙNG XOÁ (bản 2.1) */
            const palette = e.target.closest('.coding-palette');
            if (palette && drag.mode !== 'new') {
                e.preventDefault();
                clearHighlight();
                palette.classList.add('is-over-trash');
                return;
            }

            const gap = e.target.closest('.cb-gap');
            if (gap && canDropToGap(gap)) {
                e.preventDefault();
                clearHighlight();
                gap.classList.add('is-over');
                return;
            }

            const slot = e.target.closest('.cb-slot');
            if (slot && canDropToSlot(slot)) {
                e.preventDefault();
                clearHighlight();
                slot.classList.add('is-over-slot');
            }
        });

        /* --- Rời khỏi vùng thả --- */
        root.addEventListener('dragleave', function (e) {
            const target = e.target.closest('.cb-gap, .cb-slot, .coding-palette');
            if (target) target.classList.remove('is-over', 'is-over-slot', 'is-over-trash');
        });

        /* --- Thả khối --- */
        root.addEventListener('drop', function (e) {
            e.preventDefault();
            clearHighlight();
            if (!drag) return;

            /* Thả về danh mục khối => XOÁ khối lệnh (bản 2.1) */
            const palette = e.target.closest('.coding-palette');
            if (palette && drag.mode !== 'new') {
                dropToPalette();
                drag = null;
                return;
            }

            const gap = e.target.closest('.cb-gap');
            if (gap) {
                dropToGap(gap);
                drag = null;
                return;
            }

            const slot = e.target.closest('.cb-slot');
            if (slot) {
                dropToSlot(slot);
                drag = null;
            }
        });
    }

    /** Bỏ mọi hiệu ứng highlight của vùng thả */
    function clearHighlight() {
        root.querySelectorAll('.is-over, .is-over-slot, .is-over-trash').forEach(function (el) {
            el.classList.remove('is-over', 'is-over-slot', 'is-over-trash');
        });
    }

    /* ========================================================================
     *  2. VẼ DANH MỤC KHỐI + 3 CHƯƠNG TRÌNH
     * ====================================================================== */

    /** Vẽ lại toàn bộ: danh mục, 3 chương trình và ô nhập biến. */
    function renderAll() {
        renderVarsInput();
        renderPalette();
        renderCanvas();
    }

    /** Đổ giá trị biến hiện tại vào ô nhập ở thanh công cụ. */
    function renderVarsInput() {
        const input = root.querySelector('#coding-vars-input');
        if (input) input.value = (program.vars || []).join(', ');
    }

    /**
     * Vẽ danh mục khối bên trái (chia theo nhóm màu).
     * Mỗi khối mẫu có data-palette-type và draggable=true.
     */
    function renderPalette() {
        const palette = root.querySelector('#coding-palette');
        if (!palette) return;

        palette.innerHTML = '';

        /* Dải nhắc: kéo khối từ vùng bên phải thả vào đây để xoá (bản 2.1) */
        const hint = document.createElement('div');
        hint.className = 'coding-palette-hint';
        hint.innerHTML = '🗑️ <b>Kéo khối lệnh thả vào đây để xoá</b>'
            + '<br><span>Thả khối từ vùng lập trình bên phải trở lại danh mục này.</span>';
        palette.appendChild(hint);

        Engine.CATEGORIES.forEach(function (cat) {
            const section = document.createElement('div');
            section.className = 'coding-cat';

            const title = document.createElement('div');
            title.className = 'coding-cat-title';
            title.style.background = cat.color;
            title.textContent = cat.icon + ' ' + cat.label;
            section.appendChild(title);

            const box = document.createElement('div');
            box.className = 'coding-cat-blocks';

            Object.keys(Engine.BLOCKS).forEach(function (type) {
                if (Engine.BLOCKS[type].cat !== cat.id) return;
                box.appendChild(renderPaletteBlock(type));
            });

            section.appendChild(box);
            palette.appendChild(section);
        });
    }

    /**
     * Vẽ một khối mẫu trong danh mục (chỉ để kéo, không nhập liệu).
     * @param {string} type - loại khối
     * @returns {HTMLElement} phần tử khối mẫu
     */
    function renderPaletteBlock(type) {
        const def = Engine.BLOCKS[type];

        const el = document.createElement('div');
        el.className = 'cb cb-palette cb-' + def.cat + ' cb-shape-' + def.shape;
        el.dataset.paletteType = type;
        el.draggable = true;
        el.title = 'Kéo khối này vào một chương trình bên phải';

        // Thay [tenO] bằng giá trị mặc định để người dùng dễ hình dung
        const parts = def.label.split(/\[(\w+)\]/);
        let html = '';
        parts.forEach(function (part, i) {
            if (i % 2 === 0) {
                if (part) html += escapeHtml(part);
            } else {
                const slotDef = def.slots[part] || { def: '' };
                html += '<span class="cb-pill">' + escapeHtml(String(slotDef.def)) + '</span>';
            }
        });

        el.innerHTML = '<div class="cb-row">' + html + '</div>';
        return el;
    }

    /**
     * Vẽ 3 chồng lệnh + vùng xoá.
     */
    function renderCanvas() {
        const ws = root.querySelector('#coding-workspace');
        if (!ws) return;

        ws.innerHTML = '';

        STACKS.forEach(function (stack) {
            const stackEl = document.createElement('div');
            stackEl.className = 'coding-stack';
            stackEl.dataset.stack = stack.id;

            // "Mũ" của chồng lệnh (hat block)
            const head = document.createElement('div');
            head.className = 'coding-stack-head';
            head.style.background = stack.color;
            head.innerHTML = '<span class="csh-icon">' + stack.icon + '</span>'
                + '<span>' + escapeHtml(stack.title) + '</span>';
            stackEl.appendChild(head);

            // Thân: chứa các khối + khe thả
            const body = document.createElement('div');
            body.className = 'coding-stack-body';
            body.dataset.listId = 'stack:' + stack.id;
            renderList(body, program.stacks[stack.id], 'stack:' + stack.id,
                'Kéo khối lệnh vào đây');
            stackEl.appendChild(body);

            // Gợi ý ngắn dưới mỗi chương trình
            const hint = document.createElement('div');
            hint.className = 'coding-stack-hint';
            hint.textContent = stack.hint;
            stackEl.appendChild(hint);

            ws.appendChild(stackEl);
        });

        /* BẢN 2.1: bỏ "vùng xoá" riêng. Muốn xoá khối lệnh, người dùng kéo khối
           thả trở lại danh mục khối bên trái (palette chính là vùng xoá). */
    }

    /**
     * Vẽ một danh sách khối kèm các "khe" (gap) để thả.
     *
     * @param {HTMLElement} container - phần tử cha
     * @param {Array} list - mảng node
     * @param {string} listId - 'stack:setup' | 'body:<id>' | 'else:<id>'
     * @param {string} emptyText - chữ gợi ý khi danh sách rỗng
     */
    function renderList(container, list, listId, emptyText) {
        const items = list || [];

        function makeGap(index) {
            const gap = document.createElement('div');
            gap.className = 'cb-gap' + (items.length === 0 ? ' cb-gap-empty' : '');
            gap.dataset.listId = listId;
            gap.dataset.index = index;
            if (items.length === 0 && emptyText) gap.dataset.empty = emptyText;
            return gap;
        }

        container.appendChild(makeGap(0));

        items.forEach(function (node, i) {
            container.appendChild(renderNode(node));
            container.appendChild(makeGap(i + 1));
        });
    }

    /* ========================================================================
     *  3. VẼ MỘT KHỐI LỆNH VÀ CÁC Ổ NHẬP
     * ====================================================================== */

    /**
     * Vẽ một khối lệnh (statement hoặc reporter).
     * @param {Object} node - node dữ liệu
     * @returns {HTMLElement} phần tử khối
     */
    function renderNode(node) {
        const def = Engine.BLOCKS[node.t];

        const el = document.createElement('div');
        el.className = 'cb cb-' + def.cat + ' cb-shape-' + def.shape;
        el.dataset.nodeId = node.id;
        el.draggable = true;
        el.title = 'Kéo để di chuyển';

        /* --- Dòng nhãn: "đặt [a] = [0]" ... --- */
        const row = document.createElement('div');
        row.className = 'cb-row';

        const parts = def.label.split(/\[(\w+)\]/);
        parts.forEach(function (part, i) {
            if (i % 2 === 0) {
                if (part) {
                    const span = document.createElement('span');
                    span.className = 'cb-text';
                    span.textContent = part;
                    row.appendChild(span);
                }
            } else {
                row.appendChild(renderSlot(node, part, def.slots[part]));
            }
        });
        el.appendChild(row);

        /* --- Thân của khối hình chữ C (if / if_else / repeat) --- */
        if (def.shape === 'c' || def.shape === 'c2') {
            el.appendChild(renderBodyList(node, 'body', node.body));

            if (def.shape === 'c2') {
                const label = document.createElement('div');
                label.className = 'cb-row cb-else-label';
                label.textContent = 'không thì';
                el.appendChild(label);
                el.appendChild(renderBodyList(node, 'else', node.body2));
            }

            const foot = document.createElement('div');
            foot.className = 'cb-foot';
            el.appendChild(foot);
        }

        /* BẢN 2.1: KHÔNG còn nút ✕ trên khối lệnh.
           Muốn xoá: kéo khối thả trở lại DANH MỤC KHỐI bên trái
           (xem dropToPalette() + .coding-palette.is-over-trash). */
        return el;
    }

    /**
     * Vẽ phần thân (danh sách khối con) của khối chữ C.
     * @param {Object} node - khối cha
     * @param {string} kind - 'body' hoặc 'else'
     * @param {Array} list - mảng khối con
     * @returns {HTMLElement}
     */
    function renderBodyList(node, kind, list) {
        const box = document.createElement('div');
        box.className = 'cb-body';
        renderList(box, list, kind + ':' + node.id, '');
        return box;
    }

    /**
     * Vẽ một ổ nhập. Ổ có thể chứa:
     *   - GIÁ TRỊ HẰNG  : ô số / ô chữ / hộp chọn (biến, toán tử, so sánh)
     *   - KHỐI REPORTER : khối tròn lồng bên trong ("số ngẫu nhiên 1 đến 10")
     *
     * @param {Object} node - khối chứa ổ
     * @param {string} name - tên ổ
     * @param {Object} slotDef - định nghĩa ổ (kind + def)
     * @returns {HTMLElement}
     */
    function renderSlot(node, name, slotDef) {
        const holder = document.createElement('span');
        holder.className = 'cb-slot';
        holder.dataset.slotParent = node.id;
        holder.dataset.slotName = name;

        const valueNode = node.slots[name];

        /* (a) Ổ đang chứa một reporter => vẽ reporter đó */
        if (valueNode && Engine.BLOCKS[valueNode.t]) {
            holder.classList.add('cb-slot-nested');
            holder.appendChild(renderNode(valueNode));
            return holder;
        }

        const kind = slotDef.kind;

        /* (b) Hộp chọn biến
           - Khối ĐỌC biến (var_ref) được chọn cả 2 biến hệ thống 🔒
           - Khối GHI biến (đặt/thay đổi) chỉ chọn biến người dùng tạo */
        if (kind === 'var') {
            const includeSystem = (node.t === 'var_ref');

            // Nếu ổ đang trỏ tới biến hệ thống nhưng khối này không được đọc nó
            if (!includeSystem && Engine.SYSTEM_VAR_NAMES.indexOf(valueNode.v) !== -1) {
                valueNode.v = program.vars[0] || 'a';
            }

            const select = document.createElement('select');
            select.className = 'cb-input cb-select';
            fillVarOptions(select, valueNode.v, includeSystem);

            select.addEventListener('change', function () {
                if (select.value === '__new__') {
                    const answer = window.prompt('Nhập tên biến mới (ví dụ: a, b, ketQua):', 'bien');
                    if (answer && answer.trim()) {
                        const clean = answer.trim();
                        if (program.vars.indexOf(clean) === -1) program.vars.push(clean);
                        valueNode.v = clean;
                        renderAll();     // vẽ lại để mọi hộp chọn có biến mới
                    } else {
                        select.value = valueNode.v;
                    }
                    return;
                }
                valueNode.v = select.value;
            });

            holder.appendChild(select);
            return holder;
        }

        /* (c) Hộp chọn toán tử / so sánh / logic */
        if (kind === 'op' || kind === 'cmp' || kind === 'logic') {
            const options = kind === 'op' ? Engine.MATH_OPS
                : kind === 'cmp' ? Engine.CMP_OPS
                : Engine.LOGIC_OPS;

            const select = document.createElement('select');
            select.className = 'cb-input cb-select';
            options.forEach(function (op) { select.add(new Option(op, op)); });
            select.value = valueNode.v;
            select.addEventListener('change', function () {
                valueNode.v = select.value;
            });

            holder.appendChild(select);
            return holder;
        }

        /* (d) Ô nhập số */
        if (kind === 'num') {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'cb-input cb-num';
            input.value = valueNode.v;
            input.addEventListener('input', function () {
                valueNode.v = input.value;
            });

            holder.appendChild(input);
            return holder;
        }

        /* (e) Ô nhập chữ (mặc định) */
        const text = document.createElement('input');
        text.type = 'text';
        text.className = 'cb-input cb-text-input';
        text.value = valueNode.v;
        text.addEventListener('input', function () {
            valueNode.v = text.value;
        });

        holder.appendChild(text);
        return holder;
    }

    /**
     * Đổ danh sách biến vào một hộp chọn.
     * @param {HTMLSelectElement} select - hộp chọn
     * @param {string} current - biến đang chọn
     * @param {boolean} [includeSystem=false] - có thêm 2 biến hệ thống 🔒 không
     */
    function fillVarOptions(select, current, includeSystem) {
        if (!Array.isArray(program.vars)) program.vars = [];

        const isSystem = Engine.SYSTEM_VAR_NAMES.indexOf(current) !== -1;

        // Biến đang dùng nhưng chưa khai báo => bổ sung vào danh sách
        if (current && !isSystem && program.vars.indexOf(current) === -1) {
            program.vars.push(current);
        }
        if (program.vars.length === 0) program.vars.push('a');

        select.innerHTML = '';
        program.vars.forEach(function (name) {
            select.add(new Option(name, name));
        });

        /* Nhóm biến hệ thống: chỉ xuất hiện ở khối đọc biến */
        if (includeSystem) {
            const group = document.createElement('optgroup');
            group.label = '🔒 Biến hệ thống';
            Engine.SYSTEM_VARS.forEach(function (v) {
                group.appendChild(new Option(v.icon + ' ' + v.name, v.name));
            });
            select.appendChild(group);
        }

        select.add(new Option('➕ Thêm biến mới...', '__new__'));
        select.value = current || program.vars[0];
    }

    /* ========================================================================
     *  4. XỬ LÝ KÉO THẢ (KIỂM TRA + THẢ)
     * ====================================================================== */

    /**
     * Lấy shape của khối đang bị kéo.
     * @returns {string|null} 'stack' | 'c' | 'c2' | 'reporter' | 'boolean'
     */
    function dragShape() {
        if (!drag) return null;
        if (drag.mode === 'new') {
            const def = Engine.BLOCKS[drag.type];
            return def ? def.shape : null;
        }
        const node = getDraggedNode();
        return node && Engine.BLOCKS[node.t] ? Engine.BLOCKS[node.t].shape : null;
    }

    /**
     * Lấy node dữ liệu của khối đang bị kéo (null nếu kéo từ danh mục).
     * @returns {Object|null}
     */
    function getDraggedNode() {
        if (!drag) return null;

        if (drag.mode === 'move') {
            const found = Engine.findNode(program, drag.id);
            return found ? found.node : null;
        }
        if (drag.mode === 'slot') {
            const parent = Engine.findNode(program, drag.parentId);
            return parent ? parent.node.slots[drag.slotName] : null;
        }
        return null;
    }

    /**
     * Có được thả vào "khe" giữa các khối hay không?
     * Quy tắc: chỉ khối LỆNH (stack/c/c2) mới đứng riêng được; reporter phải
     * nằm trong một ổ.
     *
     * @param {HTMLElement} gap - phần tử khe
     * @returns {boolean}
     */
    function canDropToGap(gap) {
        const shape = dragShape();
        if (!shape) return false;
        if (shape === 'reporter' || shape === 'boolean') return false;

        // Chặn thả khối vào chính thân của nó (gây đệ quy vô hạn)
        const listId = gap.dataset.listId || '';
        const ownerId = listId.indexOf(':') >= 0 ? listId.split(':')[1] : '';
        const node = getDraggedNode();
        if (node && ownerId && (ownerId === node.id || Engine.containsNode(node, ownerId))) {
            return false;
        }
        return true;
    }

    /**
     * Có được thả vào một ổ nhập hay không? (chỉ reporter/boolean)
     * @param {HTMLElement} slot - phần tử ổ
     * @returns {boolean}
     */
    function canDropToSlot(slot) {
        const shape = dragShape();
        if (shape !== 'reporter' && shape !== 'boolean') return false;

        const parentId = slot.dataset.slotParent;
        const node = getDraggedNode();

        // Không cho lồng khối vào chính nó / vào khối con của nó
        if (node && (parentId === node.id || Engine.containsNode(node, parentId))) return false;

        return true;
    }

    /**
     * Gỡ khối đang kéo khỏi vị trí cũ và trả về node.
     * - Nếu kéo từ danh mục: trả về null (sẽ tạo node mới).
     * - Ghi nhớ danh sách + chỉ số cũ trong drag.__fromList / drag.__fromIndex
     *   để tính lại vị trí chèn khi thả vào cùng danh sách.
     *
     * @returns {Object|null} node đã gỡ
     */
    function takeDraggedNode() {
        if (drag.mode === 'move') {
            const found = Engine.findNode(program, drag.id);
            if (!found) return null;
            drag.__fromList = found.list;
            drag.__fromIndex = found.index;
            found.list.splice(found.index, 1);
            return found.node;
        }

        if (drag.mode === 'slot') {
            const parent = Engine.findNode(program, drag.parentId);
            if (!parent) return null;
            const def = Engine.BLOCKS[parent.node.t];
            const node = parent.node.slots[drag.slotName];

            // Trả ổ về giá trị hằng mặc định
            parent.node.slots[drag.slotName] = Engine.makeLiteral(def.slots[drag.slotName]);
            return node;
        }

        return null;
    }

    /**
     * Thả khối vào một khe.
     * @param {HTMLElement} gap - khe đích (có data-list-id, data-index)
     */
    function dropToGap(gap) {
        const listId = gap.dataset.listId;
        const index = parseInt(gap.dataset.index, 10) || 0;
        const list = Engine.getList(program, listId);
        if (!list) return;

        let node;
        if (drag.mode === 'new') {
            node = Engine.createNode(drag.type);
        } else {
            node = takeDraggedNode();
        }
        if (!node) return;

        // Nếu khối được chuyển trong CÙNG một danh sách và đứng trước đích,
        // sau khi gỡ ra thì chỉ số đích giảm đi 1.
        let insertAt = index;
        if (drag.__fromList === list && drag.__fromIndex < index) {
            insertAt = index - 1;
        }

        Engine.insertNode(list, insertAt, node);
        afterChange();
    }

    /**
     * Thả reporter vào một ổ nhập.
     * @param {HTMLElement} slot - ổ đích (có data-slot-parent, data-slot-name)
     */
    function dropToSlot(slot) {
        const parent = Engine.findNode(program, slot.dataset.slotParent);
        if (!parent) return;

        let node;
        if (drag.mode === 'new') {
            node = Engine.createNode(drag.type);
        } else {
            node = takeDraggedNode();
        }
        if (!node) return;

        parent.node.slots[slot.dataset.slotName] = node;
        afterChange();
    }

    /**
     * XOÁ khối lệnh khi người dùng kéo nó thả trở lại danh mục khối (bản 2.1).
     * Đây là cách xoá DUY NHẤT trong vùng lập trình (đã bỏ nút ✕ và vùng 🗑️).
     */
    function dropToPalette() {
        const node = takeDraggedNode();
        if (!node) return;

        afterChange();
        showToast('🗑️ Đã xoá khối lệnh "' + nodeLabel(node) + '".');
    }

    /**
     * Lấy nhãn ngắn gọn của một khối lệnh (bỏ các ổ nhập) để hiển thị thông báo.
     * @param {Object} node - node khối lệnh
     * @returns {string} ví dụ "đặt =", "cộng điểm"
     */
    function nodeLabel(node) {
        const def = Engine.BLOCKS[node.t];
        if (!def) return '?';
        return def.label.replace(/\[(\w+)\]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Gọi sau MỌI thay đổi cấu trúc: chuẩn hoá lại, vẽ lại, báo cho editor.
     */
    function afterChange() {
        program = Engine.ensureProgram(blockRef.data);
        renderAll();

        // Báo cho bảng cấu hình biết để cập nhật dấu 🧩 trên khối
        document.dispatchEvent(new CustomEvent('quiz-coding-change'));
    }

    /* ========================================================================
     *  5. BIẾN, CHẠY THỬ, XOÁ HẾT
     * ====================================================================== */

    /**
     * Cập nhật danh sách biến từ ô nhập "a, b, ketQua".
     * @param {string} text - nội dung ô nhập
     */
    function setVariablesFromInput(text) {
        const names = String(text || '').split(',')
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s !== ''; });

        const unique = [];
        names.forEach(function (n) {
            if (unique.indexOf(n) === -1) unique.push(n);
        });

        program.vars = unique.length ? unique : ['a'];
        repairVariableReferences();
        afterChange();
    }

    /**
     * Duyệt mọi node trong chương trình (kể cả khối lồng trong ổ và trong thân).
     * @param {Function} cb - hàm nhận mỗi node
     */
    function eachNode(cb) {
        function walk(list) {
            (list || []).forEach(function (n) {
                cb(n);
                if (n.body) walk(n.body);
                if (n.body2) walk(n.body2);

                // Các reporter lồng trong ổ nhập
                Object.keys(n.slots || {}).forEach(function (k) {
                    const s = n.slots[k];
                    if (s && Engine.BLOCKS[s.t]) walk([s]);
                });
            });
        }
        ['setup', 'correct', 'wrong'].forEach(function (k) { walk(program.stacks[k]); });
    }

    /**
     * Nếu người dùng xoá một biến khỏi danh sách, mọi khối đang dùng biến đó
     * sẽ được trỏ về biến đầu tiên (tránh biến "mồ côi").
     */
    function repairVariableReferences() {
        const fallback = program.vars[0] || 'a';

        eachNode(function (node) {
            const def = Engine.BLOCKS[node.t];
            Object.keys(def.slots || {}).forEach(function (name) {
                if (def.slots[name].kind !== 'var') return;
                const slot = node.slots[name];
                if (!slot || Engine.BLOCKS[slot.t]) return;      // ổ chứa reporter

                // Biến hệ thống luôn hợp lệ, không được ghi đè
                if (Engine.SYSTEM_VAR_NAMES.indexOf(slot.v) !== -1) return;

                if (program.vars.indexOf(slot.v) === -1) slot.v = fallback;
            });
        });
    }

    /**
     * Chạy thử chương trình và hiển thị kết quả ngay dưới vùng lập trình.
     * Đây là công cụ chính để người tạo quiz kiểm tra việc random hoá.
     */
    function runPreview() {
        const out = root.querySelector('#coding-output');
        if (!out || !blockRef) return;

        const res = Engine.runPreview(blockRef);

        if (res.error) {
            out.innerHTML = '<div class="co-title">❌ Chương trình bị lỗi</div>'
                + '<div class="co-error">' + escapeHtml(res.error) + '</div>';
            out.hidden = false;
            return;
        }

        const varNames = Object.keys(res.vars);
        const varHtml = varNames.length
            ? varNames.map(function (k) {
                return '<span class="co-var"><b>' + escapeHtml(k) + '</b> = '
                    + escapeHtml(res.vars[k]) + '</span>';
            }).join('')
            : '<span class="co-empty">Chưa khai báo biến nào</span>';

        out.innerHTML =
            '<div class="co-title">▶ Kết quả chạy thử</div>'
            + '<div class="co-row"><span class="co-label">Biến</span><div class="co-vars">' + varHtml + '</div></div>'
            + '<div class="co-row"><span class="co-label">Câu hỏi</span><div class="co-text">'
            +   (escapeHtml(res.question) || '<em>(rỗng)</em>') + '</div></div>'
            + (res.noteEnabled
                ? '<div class="co-row"><span class="co-label">Ghi chú</span><div class="co-text">'
                    + (escapeHtml(res.note) || '<em>(rỗng)</em>') + '</div></div>'
                : '')
            + '<div class="co-row"><span class="co-label">Điểm khi đúng</span><div class="co-score">⭐ '
            +   escapeHtml(res.score) + ' điểm</div></div>'
            + (res.feedback
                ? '<div class="co-row"><span class="co-label">Lời nhắn khi sai</span><div class="co-text">'
                    + escapeHtml(res.feedback) + '</div></div>'
                : '');

        out.hidden = false;
        out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /**
     * Xoá toàn bộ khối trong cả 3 chương trình (có xác nhận).
     */
    function clearAll() {
        if (Engine.countBlocks(blockRef.data) === 0) {
            showToast('ℹ️ Chương trình đang trống.');
            return;
        }
        if (!window.confirm('Xoá toàn bộ khối lệnh của câu hỏi này?')) return;

        program.stacks.setup = [];
        program.stacks.correct = [];
        program.stacks.wrong = [];

        const out = root.querySelector('#coding-output');
        if (out) { out.hidden = true; out.innerHTML = ''; }

        afterChange();
        showToast('🧹 Đã xoá toàn bộ khối lệnh.');
    }

    /* ========================================================================
     *  6. API CÔNG KHAI
     * ====================================================================== */

    /**
     * Ghi chương trình hiện tại trở lại block.data (gọi khi bấm "Lưu cấu hình").
     * @returns {Object|null} chương trình đã lưu
     */
    function sync() {
        if (!blockRef) return null;
        program = Engine.ensureProgram(blockRef.data);
        blockRef.data.program = program;
        return program;
    }

    /** Vẽ lại toàn bộ giao diện (dùng cho test / khi dữ liệu bị đổi từ ngoài). */
    function refresh() {
        if (!root || !blockRef) return;
        program = Engine.ensureProgram(blockRef.data);
        renderAll();
    }

    /** Dọn dẹp khi đóng modal. */
    function unmount() {
        if (root) root.innerHTML = '';
        root = null;
        blockRef = null;
        program = null;
        drag = null;
    }

    global.QuizCodingUI = {
        STACKS: STACKS,
        mount: mount,
        sync: sync,
        refresh: refresh,
        unmount: unmount,
        /** Chạy thử và trả kết quả (dùng cho test tự động) */
        preview: function () {
            return blockRef ? Engine.runPreview(blockRef) : null;
        },
        /** Trạng thái nội bộ (dùng cho test tự động) */
        getState: function () {
            return {
                blockId: blockRef ? blockRef.id : null,
                program: program,
                dragging: drag
            };
        }
    };

})(window);
