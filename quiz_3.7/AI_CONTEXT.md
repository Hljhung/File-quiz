# Ngữ cảnh dành cho AI — Scratch Quiz Builder

## Tổng quan dự án

Scratch Quiz Builder là trình tạo và chơi câu hỏi trực quan, được xây dựng bằng
HTML5, CSS3 và JavaScript thuần. Ứng dụng chạy trực tiếp trên trình duyệt, không
dùng framework, thư viện giao diện, bundler hoặc máy chủ ứng dụng.

Các tệp JavaScript được nạp dưới dạng classic script trong `index.html`, dùng
chung phạm vi toàn cục. Thứ tự nạp script là thứ tự phụ thuộc; khi thêm module
hoặc hàm dùng chung, cần giữ đúng thứ tự này.

## Quy ước bắt buộc

- Giao diện, nội dung hiển thị và chú thích mới trong mã nguồn phải dùng tiếng
  Việt; giữ nguyên tên API, cú pháp và thuật ngữ kỹ thuật cần thiết.
- Tiếp tục dùng HTML5, CSS3 và Vanilla JavaScript; không thêm thư viện ngoài
  hoặc framework.
- Tuân theo cách tổ chức module và quy ước hiện có; cập nhật trực tiếp các bề
  mặt liên quan để không làm sai lệch hành vi giữa Builder, Player và tài liệu.
- Kiểm thử đúng hành vi được yêu cầu bằng các bài kiểm tra hiện có phù hợp.

## Quy tắc bắt buộc về cập nhật tài liệu

**Mỗi khi AI đọc file này, AI bắt buộc phải cập nhật lại toàn bộ các file tài
liệu của dự án (`AI_CONTEXT.md`, `ARCHITECTURE.md`, `PROJECT_STATE.md`,
`TESTING_GUIDE.md`) sau khi hoàn thành việc viết/sửa code.**

Sau mỗi phiên có thay đổi mã nguồn, hãy rà soát và cập nhật cả bốn tệp để chúng
phản ánh chính xác kiến trúc, trạng thái tính năng, quy ước và cách kiểm thử mới.
Không chỉ cập nhật tệp có vẻ liên quan; nếu không có thay đổi mã nguồn thì không
cần tạo nội dung nhật ký giả.

## Mô hình ứng dụng

- `index.html` chứa khung giao diện ba cột, vùng Player và thứ tự nạp module.
- `js/core/` định nghĩa schema loại câu hỏi, trạng thái và tiện ích chung.
- `js/workspace/` quản lý khối câu hỏi, tọa độ, kéo thả, pan và zoom.
- `js/ui/` dựng nội dung khối, sân khấu, thuộc tính và biểu mẫu chỉnh sửa.
- `js/coding/` cung cấp mô hình/thông dịch và giao diện lập trình khối lệnh.
- `js/player/` dựng câu hỏi, nhận câu trả lời và xử lý tính điểm.
- `js/app/` khởi tạo ứng dụng, menu, chuyển chế độ và lưu/nhập/xuất dự án.
- `css/` chia kiểu theo nền tảng, khối, trình chỉnh sửa, Player, thành phần và
  khu vực lập trình.
- `tests/` chứa kiểm tra cú pháp/cấu trúc và kiểm thử end-to-end qua Chrome CDP.

## Hành vi cần lưu ý

- `blocks[]` là nguồn dữ liệu chính; thứ tự sau khi sắp xếp quyết định thứ tự
  câu hỏi khi chơi.
- Nhấn hai lần vào khối trong workspace hiển thị bản xem trước Player thu nhỏ
  cho đúng khối tại `#stage-area`.
- Nhấn ba lần hoặc dùng nút bánh răng mở bảng cấu hình. Double-click không được
  làm mất bộ đếm triple-click; kéo khối không được kích hoạt thao tác click.
- Câu hỏi Matching trong Player giữ hai cột cân đối; điểm nối lấy từ bounding box
  thực tế của hai nút rồi quy đổi sang hệ toạ độ SVG (xem ghi chú bên dưới).
- Câu hỏi Matching giữ nguyên schema `{ id, concept, explanations[] }` ở mọi
  giai đoạn (kể cả bản sao runtime). `applyToData()` của engine chỉ render
  placeholder vào `concept`/`explanations`/`explanationsAll` và giữ nguyên `id`;
  tuyệt đối không ghi đè `pairs` thành `{ left, right }` (sẽ mất `id` và
  `concept`, làm Player dựng ra hai cột rỗng và không nối được nhiều cặp).
- Mọi đường nối Matching (cả editor lẫn Player) vẽ bằng hàm dùng chung
  `matchConnectorPoints()` / `matchConnectorPath()` trong `js/core/utils.js`.
  Hàm này đổi toạ độ viewport sang user space của SVG bằng `getScreenCTM()`
  nên đường nối không bao giờ bị lệch, kể cả khi vùng chứa đang được scale
  (modal cấu hình chạy animation `sbPopIn`; bản xem trước sân khấu dùng
  `transform: scale(...)`). TUYỆT ĐỐI không dùng thẳng số đo từ
  `getBoundingClientRect()` để đưa vào thuộc tính `d` của `<path>`.
- Matching trong Player hỗ trợ bấm-chọn lẫn kéo-thả để nối; khi đang chọn có
  đường nối nháp (`.match-line.is-preview`) bám theo con trỏ. Người chơi nối
  được đủ các cặp, bấm lại ô tròn đã nối để bỏ nối, và một giải thích đang
  nối với khái niệm khác sẽ được chuyển sang khái niệm mới (không kẹt).
- **PHÂN CÁCH EDITOR / PLAYER cho câu hỏi nối ô (bản 2.5) — quy tắc bắt buộc:**
  · *Trình chỉnh sửa* (`js/ui/editor.js`) GIỮ NGUYÊN giao diện cấu hình cặp
    khái niệm – giải thích: mỗi khái niệm có N cúc tròn (mỗi cúc là một giải
    thích đã nối) **+ 1 cúc tròn "+"** để tác giả thêm giải thích mới.
  · *Chế độ chơi* (`js/player/player.js`) dùng giao diện riêng: **mỗi ô
    match-box chỉ có ĐÚNG 1 nút tròn** làm điểm neo. Dây nối xuất phát từ nút
    của ô bên trái, bám theo con trỏ khi kéo và được neo chính xác vào nút của
    ô đích bên phải khi ghép cặp xong.
  · Lớp `.match-2n-player` đánh dấu vùng chơi; **mọi kiểu CSS của giao diện
    "1 nút / ô" phải gắn với lớp này** để không bao giờ lan sang Editor.
    TUYỆT ĐỐI không dùng `.match-2n-area` trần cho kiểu dành riêng cho Player.
- **Quan hệ nối ô NHIỀU-NHIỀU ở Player View (bản 2.6) — quy tắc bắt buộc:**
  · `block.data.answers` lưu các cặp nối dưới dạng **DANH SÁCH MẢNG**, mỗi
    phần tử là `[idKháiNiệm, nộiDungGiảiThích]`:
    `[['c1','Gải thích A'], ['c1','Gải thích B'], ['c2','Gải thích A']]`.
    Nhờ vậy một khái niệm nối được N giải thích và một giải thích cũng nối
    được N khái niệm.
  · **Thêm một cặp nối KHÔNG BAO GIỜ gỡ cặp nào đã có.** Kéo từ nút trái sang
    nút phải (hoặc ngược lại) chỉ vẽ thêm dây; các dây cũ giữ nguyên.
  · Mọi thao tác đọc/ghi danh sách cặp nối phải đi qua các hàm dùng chung
    `matchingNormalizeLinks()` / `matchingAddLink()` / `matchingRemoveLink()` /
    `matchingRemoveLinksTo()` / `matchingTargetsOf()` / `matchingOwnersOf()` /
    `matchingOwnerCount()` trong `js/core/utils.js`. TUYỆT ĐỐI không tự viết
    lại logic nối ở nơi khác và không được dùng lại kiểu "1-1" (gỡ nối cũ
    khi nối mới) — đó là hành vi cũ đã bị loại bỏ.
  · Định dạng cũ `{ idKháiNiệm: [giải thích, ...] }` vẫn được đọc và tự
    chuyển sang định dạng mới (xem `normalizeMatching()` và `migrateBlockData()`).
- **Phản hồi Matching sau khi nộp:** chỉ trong Player View, dây người chơi đã
  vẽ được tô xanh nếu đúng hoặc đỏ nếu sai; mỗi cặp đúng còn thiếu được vẽ thêm
  thành dây vàng. Không hiển thị các dây đáp án còn thiếu trước khi nộp và không
  thay đổi giao diện Matching trong Editor. Các trạng thái dùng lớp
  `.is-correct`, `.is-wrong` và `.is-missing` trên `.match-line`.
- **Cloze trong Editor và Player:** Editor dùng một textarea nội dung với
  placeholder `{{N}}`, cùng danh sách đáp án theo từng ô và nút thêm đáp án
  trong nhóm “Tên / nội dung câu hỏi”; không dựng trường tên hoặc trường
  “Nội dung đoạn văn” riêng. Khi lưu, nội dung được ghi vào `data.question` và
  `data.paragraph` để Player và dự án cũ tương thích. Giữ nguyên các dòng đáp
  án trống để vị trí đáp án luôn khớp với số thứ tự placeholder. Player ẩn phần
  tiêu đề chứa lại chính đoạn văn để không hiển thị nội dung lặp.
- **Dropdown trong Editor:** nội dung chứa `{{N}}` nằm ngay trong trường
  “Tên / nội dung câu hỏi”; mỗi chỗ trống có danh sách lựa chọn và đáp án đúng
  riêng. Không dựng trường đoạn văn riêng, danh sách từ dùng chung hay nút sao
  chép danh sách chung. `paragraph` và các trường dùng chung cũ vẫn được đọc để
  tương thích dự án đã lưu.
- **Hotspot hình tròn và phản hồi Player:** mỗi vùng lưu `shape` là `circle`
  hoặc `rectangle`; Editor cho phép đổi hình dạng và giữ vùng tròn chuẩn theo
  tỉ lệ ảnh. Sau khi nộp, đáp án hiện màu vàng, vùng người chơi màu đỏ và phần
  giao màu xanh. Tính điểm theo diện tích giao hình học chính xác cho hình chữ
  nhật–hình chữ nhật, hình tròn–hình tròn và hình tròn–hình chữ nhật; không
  thay phần giao bằng hộp chữ nhật bao ngoài.
- **Tên vùng Hotspot:** nhãn đã đặt trong Editor được sao chép sang vùng của
  người chơi và hiển thị nguyên vẹn trong Player; không thay bằng ký tự thứ tự.
- `QuizCoding.applyToData()` phải giữ nguyên và render toàn bộ
  `blanks[].answers[]` trên bản runtime Cloze (đồng thời giữ `answer` đầu tiên
  cho tương thích ngược). Không được chỉ chuyển một đáp án `answer`: Player
  chấm theo `blanks[N - 1].answers`, nên làm mất mảng này khiến câu đúng bị
  chấm sai và không dựng được gợi ý đáp án.
- Player chấm từng ô sau khi trim khoảng trắng đầu/cuối và không phân biệt
  hoa/thường. Ô trống vẫn được nộp và đánh dấu đỏ; ô sai hoặc trống hiện đáp án
  vàng dạng chữ nếu chỉ có một đáp án, hoặc danh sách thả màu vàng nếu có nhiều.
- Bản xem trước trong sân khấu chỉ để quan sát, các điều khiển bị vô hiệu hóa.
- Trắc nghiệm có tùy chọn `shuffleOptions` để xáo trộn lựa chọn khi chơi; mặc
  định tắt để bảo toàn thứ tự của dự án cũ. Xáo trộn chỉ thay đổi thứ tự chỉ số
  hiển thị, không thay đổi mảng dữ liệu gốc hoặc ánh xạ đáp án đúng.
- Không hiển thị số lượng đáp án đúng trong giao diện cấu hình/sân khấu hoặc
  Player. Phản hồi trắc nghiệm chỉ đổi màu viền: xanh cho đáp án đúng, đỏ cho
  lựa chọn sai đã chọn; giữ nguyên nền và kích thước ô.
- Câu hỏi sắp xếp: khi kéo, hàng được chuyển tạm vào `document.body` với
  `position: fixed` để tọa độ con trỏ không bị ảnh hưởng bởi transform của
  vùng Player; tắt transform/animation đầu vào và giữ nguyên tọa độ đang hiển
  thị. `.sort-placeholder` giữ khe đích trong danh sách. Kéo qua tâm hàng khác
  sẽ chuyển khe trực tiếp; FLIP làm các hàng xung quanh trượt mượt. Khi thả,
  hàng snap vào khe. Trả lời đúng làm tất cả hàng đồng loạt chuyển xanh và nảy;
  sai tô đỏ, lắc cả danh sách rồi Bubble Sort trình bày đáp án. Tôn trọng giảm
  chuyển động.

## Kết quả kiểm tra gần nhất

`node tests/syntax-check.js` và `node tests/scope-check.js` đều đạt. E2E lần
gần nhất đạt 217/223. Dropdown xác nhận nội dung nằm trong nhóm câu hỏi và
không còn trường đoạn văn/danh sách chung; từng chỗ trống giữ lựa chọn riêng.
Hotspot xác nhận Editor đổi và lưu được hình tròn, Player giữ nhãn khớp Editor,
hiển thị đáp án vàng, vùng người chơi đỏ và phần giao xanh; ca tròn–chữ nhật loại đúng vùng nằm ngoài
đường tròn. Cloze và Matching tiếp tục đạt các kiểm tra đã có. Sáu kiểm tra
chưa đạt vẫn liên quan đến thanh thời gian. Xem
`TESTING_GUIDE.md` và `tests/last-run.txt`.
