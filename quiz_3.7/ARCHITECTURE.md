# Kiến trúc Scratch Quiz Builder

## Sơ đồ thư mục

```text
quiz_goc/
├── index.html
├── AI_CONTEXT.md
├── ARCHITECTURE.md
├── PROJECT_STATE.md
├── TESTING_GUIDE.md
├── css/
│   ├── base.css
│   ├── blocks.css
│   ├── coding.css
│   ├── components.css
│   ├── editor.css
│   └── player.css
├── js/
│   ├── app/app.js
│   ├── coding/coding-engine.js
│   ├── coding/coding-ui.js
│   ├── core/block-types.js
│   ├── core/state.js
│   ├── core/utils.js
│   ├── player/player.js
│   ├── ui/editor.js
│   ├── ui/render.js
│   └── workspace/
│       ├── block-manager.js
│       ├── geometry.js
│       └── interactions.js
└── tests/
    ├── e2e-cdp.js
    ├── scope-check.js
    └── syntax-check.js
```

## Luồng nạp và dữ liệu

`index.html` nạp các script JavaScript tuần tự, không dùng module loader hay
bundler. Thứ tự hiện tại là: tiện ích → schema khối → trạng thái → hình học →
quản lý khối → tương tác workspace → render → editor → coding engine → coding
UI → Player → app. Các hàm và trạng thái được chia sẻ trong phạm vi toàn cục.

Một khối có dạng `{ id, type, x, y, data, el }`. `blocks[]` trong
`js/core/state.js` là nguồn dữ liệu chính. Trường `data` chứa nội dung câu hỏi,
đáp án, cấu hình hiển thị và chương trình khối lệnh tùy loại câu hỏi.

## Mô-đun JavaScript

| Tệp | Trách nhiệm |
| --- | --- |
| `js/core/utils.js` | Hàm tiện ích dùng chung, chuyển đổi HTML an toàn, thao tác dữ liệu phổ biến, **hình học SVG cho câu hỏi nối ô** (`svgPointFromClient`, `matchConnectorPoints`, `matchConnectorPath`, `syncSvgOverlaySize`) và **đồ thị cặp nối nhiều-nhiều** (`matchingNormalizeLinks`, `matchingAddLink`, `matchingRemoveLink`, `matchingRemoveLinksTo`, `matchingTargetsOf`, `matchingOwnersOf`, `matchingOwnerCount`). |
| `js/core/block-types.js` | Schema, nhãn, biểu tượng, dữ liệu mặc định (bao gồm `shuffleOptions`) và chuẩn hoá tương thích dự án cũ. `normalizeMatching()` bảo đảm `id` khái niệm duy nhất, `explanationsAll` đầy đủ và `answers` ở dạng danh sách mảng `[idKháiNiệm, giảiThích]`. |
| `js/core/state.js` | Tham chiếu DOM, danh sách khối, trạng thái chỉnh sửa, hệ số zoom và bộ đếm ID. |
| `js/workspace/geometry.js` | Chuyển tọa độ màn hình/canvas, thay đổi kích thước canvas theo zoom và xác định vùng xóa. |
| `js/workspace/block-manager.js` | Tạo, kéo, sắp xếp, xóa khối; xử lý xem trước double-click và mở cấu hình triple-click/nút bánh răng. |
| `js/workspace/interactions.js` | Kéo mẫu từ toolbox, thả khối, pan vùng làm việc và Ctrl + lăn chuột để zoom. |
| `js/ui/render.js` | Dựng khối trong workspace, sân khấu xem trước và danh sách thuộc tính. Stage có thể giữ lựa chọn khối để dựng thẻ Player thu nhỏ, chỉ đọc. |
| `js/ui/editor.js` | Dựng biểu mẫu cấu hình, lưu toggle xáo trộn đáp án cùng dữ liệu câu hỏi và quản lý modal/tab. Editor Cloze và Dropdown đặt nội dung có placeholder trong nhóm câu hỏi; Dropdown chỉ cấu hình lựa chọn theo từng chỗ trống. Editor Hotspot hỗ trợ vùng hình chữ nhật/hình tròn và lưu `shape` cùng tọa độ phần trăm. Editor nối ô dựng hai cột, dùng bảng tra cứu phần tử và vẽ đường nối bằng hình học SVG dùng chung. |
| `js/coding/coding-engine.js` | Định nghĩa dữ liệu chương trình khối lệnh và thực thi các stack theo sự kiện câu hỏi. `applyToData()` render placeholder mà không phá schema Matching hoặc mảng `blanks[].answers[]` của Cloze; giữ thêm đáp án đơn đầu tiên để tương thích dữ liệu cũ. |
| `js/coding/coding-ui.js` | Dựng giao diện lập trình Scratch-like và hỗ trợ thao tác khối lệnh. |
| `js/player/player.js` | Chuyển câu hỏi thành thẻ Player, dựng vùng trả lời, chấm điểm, đồng hồ và kết quả. Cloze so khớp câu trả lời đã trim và không phân biệt hoa/thường, đánh dấu từng ô đúng/sai sau nộp và hiển thị gợi ý vàng bằng chữ hoặc danh sách thả. Hotspot tính giao hình học chính xác cho hình chữ nhật/hình tròn và tô đáp án vàng, lựa chọn đỏ, phần giao xanh sau nộp. Trắc nghiệm xáo trộn chỉ số lựa chọn bằng Fisher–Yates và giữ nguyên ánh xạ đáp án; phản hồi đúng/sai chỉ đổi viền. Ordering dùng Pointer Events, tách ô kéo sang `document.body` để giữ tọa độ viewport, khe giữ chỗ để đổi vị trí tức thời, FLIP cho hàng lân cận/khi thả và Bubble Sort để trình bày đáp án sau khi sai. Matching dựng hai cột với **1 nút / ô** (lớp `.match-2n-player`), quản lý các cặp nối **nhiều-nhiều** qua bộ hàm dùng chung, có dây nháp bám con trỏ và vẽ SVG bằng hình học dùng chung. |
| `js/app/app.js` | Khởi tạo, sự kiện điều hướng, tab, menu, cài đặt và lưu/nhập/xuất dự án. |

Khi thêm loại câu hỏi, cần cập nhật schema, danh sách khối, render Builder,
biểu mẫu Editor, thu thập dữ liệu, vùng trả lời Player và kiểm thử tương ứng.

## Mô-đun CSS

| Tệp | Trách nhiệm |
| --- | --- |
| `css/base.css` | Reset, biến/giao diện nền, bố cục ba cột, thanh trên cùng và canvas. |
| `css/blocks.css` | Kiểu khối câu hỏi và hiệu ứng trong workspace. |
| `css/editor.css` | Modal và các điều khiển biểu mẫu cấu hình. |
| `css/player.css` | Thẻ Player, câu trả lời, Matching, giao diện sân khấu và kết quả. |
| `css/components.css` | Thành phần dùng chung như nút, tab, menu, toast và danh sách. |
| `css/coding.css` | Bảng lập trình khối lệnh. |

Matching Player dùng lưới CSS hai cột thay vì float. SVG overlay nằm tuyệt đối
trên lưới và nhận tọa độ từ nút nối thực tế, do đó thay đổi độ dài văn bản hoặc
kích thước màn hình không làm điểm nối rời khỏi nút.

### Hình học đường nối (Matching) — bản 2.4

Đường nối được vẽ trong **user space của SVG**, còn `getBoundingClientRect()`
trả về toạ độ đã bị biến đổi khi vùng chứa nằm trong một phép `scale`. Hai hệ
toạ độ này lệch nhau ngay khi modal cấu hình chạy animation `sbPopIn`
(scale `.6 → 1.06 → 1`) hoặc bản xem trước sân khấu dùng `transform: scale(...)`.

Vì vậy dự án dùng một đường đi duy nhất cho cả editor lẫn Player:

```text
toạ độ viewport (clientX/clientY)
        │  getScreenCTM().inverse()
        ▼
user space của thẻ <svg> overlay  ──►  thuộc tính "d" của <path>
```

| Hàm (trong `js/core/utils.js`) | Vai trò |
| --- | --- |
| `svgPointFromClient(svg, x, y)` | Đổi một điểm viewport sang user space của SVG (đảo ma trận affine của `getScreenCTM()`). |
| `matchConnectorPoints(svg, trái, phải)` | Trả về 4 toạ độ hai đầu đoạn nối (mép phải cúc trái ↔ mép trái cúc phải). |
| `matchConnectorPath(x1, y1, x2, y2)` | Dựng lệnh `d` của cung cong nối hai cột. |
| `syncSvgOverlaySize(svg, vùngChứa)` | Đặt kích thước overlay theo kích thước **bố cục** để 1 user unit = 1 px. |

Nhờ vậy đường nối bám chặt vào điểm nối ở mọi tỉ lệ, kể cả khi vùng chứa đang
chạy animation — không cần vẽ lại thủ công khi animation kết thúc.

### Vòng đời dữ liệu Matching

```text
block.data.pairs[]  { id, concept, explanations[] }
        │  deepClone  (prepareRuntimeBlock)
        ▼
bản sao runtime  ── applyToData() ──► render placeholder vào concept/explanations
        │                                (GIỮ NGUYÊN id và cấu trúc pairs)
        ▼
Player dựng hai cột  ◄── normalizeBlockData(d, 'matching')  (idempotent)
        │
        ▼
data.answers = DANH SÁCH MẢNG các cặp nối (runtime)
        [['c1', 'Giải thích A'], ['c1', 'Giải thích B'], ['c2', 'Giải thích A']]
                 ▲
                 └── thêm / gỡ qua matchingAddLink() / matchingRemoveLink()
```

`normalizeBlockData()` loay hoay đảm bảo `id` của mỗi khái niệm là duy nhất,
`explanationsAll` chứa đủ mọi giải thích đang được gắn (thiếu một giải thích
thì cột phải thiếu ô và không vẽ được đường nối) và `answers` ở đúng định
dạng danh sách mảng.

### Quan hệ nối ô nhiều-nhiều (bản 2.6)

`data.answers` là **danh sách mảng** các cặp nối `[idKháiNiệm, nộiDungGiảiThích]`.
Mỗi cặp là **một dây nối riêng**, nên:

* một khái niệm nối được **N** giải thích (N dây cùng xuất phát từ một nút);
* một giải thích nối được **N** khái niệm (N dây cùng neo vào một nút);
* **thêm** một cặp nối **không gỡ** bất kỳ cặp nào đã có.

| Hàm (trong `js/core/utils.js`) | Vai trò |
| --- | --- |
| `matchingNormalizeLinks(raw)` | Chuẩn hoá về danh sách mảng; đọc được cả định dạng cũ `{id: [exp, …]}`. |
| `matchingAddLink(links, id, exp)` | Thêm một cặp nối (bỏ qua nếu đã tồn tại). |
| `matchingRemoveLink(links, id, exp)` | Gỡ đúng một cặp nối. |
| `matchingRemoveLinksTo(links, exp)` | Gỡ mọi cặp nối đi tới một giải thích. |
| `matchingTargetsOf(links, id)` | Các giải thích đang nối với một khái niệm. |
| `matchingOwnersOf(links, exp)` | Các khái niệm đang nối với một giải thích. |
| `matchingOwnerCount(links, exp)` | Đếm số khái niệm đang nối với một giải thích. |

Chấm điểm so sánh **tập các cặp** `khái niệm|giải thích` nên tự động đúng với
quan hệ nhiều-nhiều: đúng khi tập cặp người chơi tạo ra trùng khít tập cặp
đáp án của tác giả.

Khi người chơi nộp câu trả lời trong Player, `buildMatchingAreaV3()` phân loại các
cặp theo đáp án cấu hình rồi vẽ lại SVG: cặp đã nối chính xác dùng
`.match-line.is-correct` (xanh), cặp người chơi nối sai dùng
`.match-line.is-wrong` (đỏ), và mỗi cặp đúng còn thiếu được vẽ bổ sung bằng
`.match-line.is-missing` (vàng). Các cặp còn thiếu chỉ được dựng sau khi nộp;
việc này không thay đổi đáp án runtime hay giao diện Editor.

### Tương tác nối ô trong Player

| Thao tác | Kết quả |
| --- | --- |
| Bấm nút bên trái | Chọn khái niệm + hiện dây nháp bám theo con trỏ. |
| Rê chuột / kéo sang nút phải | Dây nháp bám đúng nút phải đang rê; nút đích được tô sáng. |
| **Kéo từ nút trái sang nút phải** | **Thêm** cặp nối — các dây cũ giữ nguyên. |
| **Kéo từ nút phải sang nút trái** | **Thêm** cặp nối theo chiều ngược lại. |
| Kéo ra ngoài | Hủy thao tác, **không** xoá dữ liệu nối. |
| Bấm nút trái rồi bấm nút phải | Bật/tắt cặp nối giữa đúng hai ô đó. |
| Bấm nút phải đang nối (không chọn khái niệm) | Gỡ **mọi** cặp nối của nút đó. |
| Bấm nút phải chưa nối | Báo *"Kéo từ ô khái niệm bên trái sang ô này để nối."* |
| Nộp câu trả lời | Dây đúng xanh, dây sai đỏ; dây đáp án còn thiếu được bổ sung màu vàng. |

Nút bên trái hiện số giải thích đang nối; ô bên phải có huy hiệu số khái niệm
đang nối (`.match-badge`).

### Phân tách Editor ↔ Player cho câu hỏi nối ô (bản 2.5)

Hai giao diện cùng phục vụ một loại câu hỏi nhưng **cố tình khác nhau**:

| | Trình chỉnh sửa (`js/ui/editor.js`) | Chế độ chơi (`js/player/player.js`) |
| --- | --- | --- |
| Mục đích | Tác giả soạn cặp khái niệm – giải thích | Người chơi ghép cặp |
| Nút trên ô khái niệm | N cúc tròn (mỗi cúc = 1 giải thích đã nối) **+ 1 cúc "+"** | **Đúng 1 nút** làm điểm neo |
| Nút trên ô giải thích | 1 nút | 1 nút |
| Dây nối | Vẽ khi tác giả ghép cặp | Vẽ khi người chơi kéo; **1-n nhiều dây từ cùng một nút** |
| Lớp đánh dấu | `.match-2n-area.editor-match-2n` | `.match-2n-area.match-2n-player` |

Ranh giới này được giữ bằng **lớp đánh dấu `.match-2n-player`**: mọi kiểu CSS
riêng cho giao diện "1 nút / ô" đều gắn với lớp này, nên chúng không bao giờ
áp dụng lên giao diện thiết lập trong Editor.

```text
            ┌────────────────────────────┬─────────────────────────────┐
            │   TRÌNH CHỈNH SỬA          │      CHẾ ĐỘ CHƠI            │
            ├────────────────────────────┼─────────────────────────────┤
   khái niệm │  [1][2][+]  (nút "+" để    │      [1]  (1 nút duy nhất)  │
            │            thêm giải thích)  │      ↑ neo của mọi dây nối │
   giải thích│  [A]                      │      [A]  (1 nút duy nhất)  │
            └────────────────────────────┴─────────────────────────────┘
              .editor-match-2n                    .match-2n-player
              (KHÔNG đổi)                          (bản 2.5)
```

### Câu hỏi điền từ (Cloze)

Trong Editor, một textarea duy nhất trong nhóm “Tên / nội dung câu hỏi” nhận
nội dung đoạn văn với placeholder `{{1}}`, `{{2}}`, ...; không còn ô nhập tên
riêng hay trường “Nội dung đoạn văn” tách biệt cho Cloze. Danh sách đáp án theo
từng ô và nút thêm dòng nằm trong cùng nhóm. Khi thu thập dữ liệu, nội dung
textarea được lưu vào cả `data.question` và `data.paragraph` để tương thích với
luồng hiển thị và dữ liệu cũ; mỗi dòng đáp án được tách theo dấu chấm phẩy và
lưu vào `data.blanks[i].answers`. Dòng rỗng không bị loại bỏ, tránh làm lệch
chỉ số khi một chỗ trống chưa có đáp án.

Trong Player, số thứ tự placeholder ánh xạ tới `data.blanks[N - 1]`. Đáp án
người chơi và đáp án cấu hình đều được `trim()` rồi chuẩn hóa chữ thường trước
khi so khớp với từng phần tử của mảng đáp án hợp lệ. Sau khi nộp, ô đúng có
trạng thái xanh; ô sai hoặc trống có trạng thái đỏ. Một đáp án chuẩn được trình
bày bằng nhãn màu vàng, nhiều đáp án được đưa vào `<select>` màu vàng. Kể cả
khi mọi ô đều trống, người chơi vẫn có thể nộp để nhận phản hồi.
Vì đoạn văn được render trong vùng trả lời, tiêu đề câu hỏi Cloze bị ẩn để
không lặp lại nội dung có placeholder bên trên các ô điền.

`QuizCoding.applyToData()` render toàn bộ `blanks[].answers[]` vào bản runtime
và giữ `answer` đầu tiên làm bí danh tương thích dữ liệu cũ. Nếu chỉ giữ trường
đơn `answer`, phần chấm của Player sẽ không nhận được mảng đáp án, khiến câu
trả lời đúng bị đánh dấu sai và không có đáp án để dựng gợi ý.

### Câu hỏi chọn từ trong danh sách (Dropdown)

Editor dùng textarea “Nội dung câu hỏi” trong nhóm cấu hình chung, với
placeholder `{{1}}`, `{{2}}`, ... để xác định vị trí các danh sách chọn. Phần
cấu hình riêng chỉ chứa lựa chọn và radio đáp án đúng cho từng chỗ trống; không
có trường đoạn văn riêng, danh sách từ dùng chung hoặc thao tác sao chép chung.
Khi lưu, nội dung được ghi vào `data.question` và `data.paragraph` để Player và
dự án cũ tiếp tục tương thích. Các trường danh sách chung cũ vẫn được chuẩn hóa
khi mở dữ liệu cũ nhưng không xuất hiện trong Editor mới.

### Câu hỏi chọn vùng trên ảnh (Hotspot)

Mỗi `data.regions[]` giữ tọa độ `x`, `y`, `w`, `h` theo phần trăm và `shape`
(`rectangle` hoặc `circle`). Editor đổi được hình dạng theo từng vùng; vùng
tròn giữ tỉ lệ chiều rộng/chiều cao theo tỷ lệ khung ảnh để hiển thị tròn trên
ảnh có kích thước bất kỳ.

Player dựng ba lớp sau khi nộp: đáp án màu vàng, vùng người chơi màu đỏ và phần
giao màu xanh. Nhãn mỗi vùng ở lớp người chơi lấy trực tiếp từ `regions[].label`
cùng vùng đáp án, để tên trong Player trùng với nội dung cấu hình. Phần trăm
giao để chấm được tính từ diện tích thật, không từ
hộp bao: giao hai hình chữ nhật dùng diện tích giao hình chữ nhật, giao hai
hình tròn dùng công thức hình học hai hình tròn, giao hình tròn với hình chữ
nhật tích phân chính xác các dây cung theo từng đoạn. Lớp giao hiển thị bằng
mặt nạ hai hình lồng nhau để giữ nguyên biên dạng hình học.

Ordering Player đưa hàng kéo tạm ra `document.body` làm phần tử cố định theo
viewport, tránh sai lệch do tổ tiên có transform; hiệu ứng transform/animation
đầu vào được tắt trong lúc kéo để giữ đúng tọa độ ban đầu. Một khe giữ chỗ được
đưa qua các hàng thật theo tâm hàng kéo; FLIP chuyển động các hàng lân cận rồi
cho hàng kéo snap vào khe khi thả. Khi đúng, tất cả hàng chuyển xanh và bounce
đồng thời; khi sai, cả danh sách chuyển đỏ và shake, sau đó Bubble Sort trình
bày thứ tự đúng rồi chuyển các hàng sang xanh. CSS hỗ trợ
`prefers-reduced-motion`.

## Kiểm thử

- `tests/syntax-check.js`: kiểm tra tài nguyên, cú pháp JavaScript và thứ tự
  nạp script.
- `tests/e2e-cdp.js`: kiểm thử tương tác trình duyệt qua Chrome DevTools
  Protocol, bao gồm double-click/triple-click và bố cục Matching Player.
- `tests/scope-check.js`: kiểm tra phạm vi và cấu trúc theo các quy tắc dự án.

Lần chạy hiện tại: kiểm tra cú pháp và phạm vi đạt; E2E đạt 217/223. Dropdown
xác nhận nội dung trong trường câu hỏi, không còn phần đoạn văn/danh sách chung
và các lựa chọn theo từng ô. Hotspot xác nhận đổi/lưu hình tròn, nhãn Player
trùng Editor, phản hồi ba màu và hình tròn–chữ nhật không tính vùng ngoài đường
tròn là phần giao. Cloze
và Matching tiếp tục đạt các kiểm tra đã nêu. Sáu kiểm tra chưa đạt
đều là lỗi thanh thời gian đã có từ trước. Chi tiết nằm ở `tests/last-run.txt`.
