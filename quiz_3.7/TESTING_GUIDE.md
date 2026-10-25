# Hướng dẫn kiểm thử

## Yêu cầu

- Node.js để chạy bộ kiểm tra cú pháp và E2E.
- Google Chrome để chạy kiểm thử end-to-end qua Chrome DevTools Protocol.
- Không cần cài thư viện hoặc framework giao diện.

## Kiểm tra nhanh cú pháp và cấu trúc

Mở terminal tại thư mục gốc dự án và chạy:

```powershell
node tests/syntax-check.js
```

Lệnh xác nhận các tài nguyên CSS/JavaScript được tham chiếu tồn tại, toàn bộ
JavaScript trong `js/` hợp lệ cú pháp, các module bắt buộc có mặt và script
được nạp theo đúng thứ tự phụ thuộc.

## Kiểm thử end-to-end

```powershell
node tests/e2e-cdp.js
```

Nếu Chrome không nằm ở đường dẫn mặc định của bộ test, đặt `CHROME_PATH` thành
đường dẫn đầy đủ tới tệp thực thi Chrome rồi chạy lại.

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e-cdp.js
```

Kết quả được in ra terminal và ghi vào `tests/last-run.txt`. Bộ test kiểm tra
khởi động ứng dụng, thao tác Builder/Editor/Player, lưu dữ liệu và các tương
tác chính; kiểm tra Matching trong Player và double-click xem trước cũng nằm
trong bộ này.

Kết quả lần chạy gần nhất: 217/223 kiểm tra đạt. Các kiểm tra Dropdown xác nhận
nội dung trong nhóm “Tên / nội dung câu hỏi”, không có trường đoạn văn hoặc danh
sách từ dùng chung, và lựa chọn được cấu hình theo từng chỗ trống. Hotspot xác
nhận Editor đổi/lưu hình tròn và Player hiển thị vùng đáp án vàng, vùng người
chơi đỏ, phần giao xanh; nhãn vùng người chơi khớp tên đã đặt trong Editor.
Kiểm tra hình tròn–chữ nhật cũng loại vùng nằm ngoài đường tròn khỏi phần giao.
Toàn bộ kiểm tra về nối ô đều
đạt — gồm mở lại bảng cấu hình nối ô lần thứ hai (đường nối bám đúng cúc tròn,
sai lệch 0.00px), Editor giữ nguyên giao diện cấu hình (vẫn có cúc "+"), Player
View mỗi ô chỉ có đúng 1 button, dây nối xuất phát từ nút trái và neo vào nút
phải (sai lệch 0.00px), dây nháp bám theo con trỏ, nối đủ các cặp mà không bị
kẹt, quan hệ 1-n vẫn dùng chung một nút, **quan hệ nhiều-nhiều giữ nguyên các
dây nối cũ**, dữ liệu cặp nối lưu dạng danh sách mảng và dự án cũ (định dạng
object) vẫn mở được. Kiểm tra phản hồi sau khi nộp cũng xác nhận dây đúng màu
xanh, dây sai màu đỏ và dây đáp án còn thiếu màu vàng. Sáu kiểm tra chưa đạt đều
là lỗi thanh thời gian có từ trước (trạng thái đầy, đếm ngược, thời gian còn
lại, trạng thái chốt, điểm trên thanh và làm mới ở câu tiếp theo) — không liên
quan tới các thay đổi Dropdown/Hotspot, Cloze hoặc Matching. Xem chi tiết tại
`tests/last-run.txt`; không xem bộ E2E là đạt toàn phần cho tới khi điều tra các
lỗi thanh thời gian.

Kiểm tra xem trước xác nhận đúng loại câu hỏi được chọn, tỷ lệ thu nhỏ nhỏ hơn
1 và các điều khiển bị khóa. Kiểm tra Matching xác nhận hai cột cân đối, các
điểm tròn hướng vào khoảng nối, thao tác tạo đường SVG, đường nối không bị lệch
khi mở lại cấu hình lần hai, giao diện "1 nút/ô" chỉ có ở Player View, quan hệ
nhiều-nhiều giữ nguyên dây nối cũ, và người chơi nối được đủ các cặp.

## Checklist kiểm thử thủ công

### Builder và xem trước sân khấu

- [ ] Mở `index.html`, xác nhận toolbox, workspace và `#stage-area` hiển thị.
- [ ] Kéo một khối vào workspace; sân khấu mặc định hiển thị thông tin câu hỏi.
- [ ] Double-click thân một khối: sân khấu hiển thị thẻ Player thu nhỏ của đúng
  câu hỏi; các nút trong bản xem trước không thao tác được.
- [ ] Double-click khối khác: sân khấu chuyển sang câu hỏi được chọn.
- [ ] Triple-click khối: modal cấu hình mở đúng khối; double-click không mở
  modal ở lần nhấn thứ hai.
- [ ] Kéo khối rồi thả: khối di chuyển như cũ, không mở xem trước/modal.
- [ ] Xóa khối đang được xem trước: sân khấu trở về câu hỏi còn lại hoặc trạng
  thái trống hợp lệ.

### Matching trong Player

- [ ] Tạo câu hỏi Matching có nhiều khái niệm và giải thích dài/ngắn khác nhau.
- [ ] Chạy quiz và xác nhận khái niệm/giải thích nằm trong hai cột cân đối,
      **nội dung khái niệm hiển thị đầy đủ** (không phải hai cột rỗng).
- [ ] Xác nhận các điểm tròn hướng vào khoảng trống giữa hai cột, không chồng
  lên chữ và không bị lệch khỏi hộp.
- [ ] Xác nhận **mỗi ô match-box chỉ có ĐÚNG 1 nút tròn** (không phải nhiều nút
      như trong trình chỉnh sửa).
- [ ] **Kéo** từ nút ô bên trái sang nút ô bên phải: dây nối xuất phát từ nút
      trái, bám theo con trỏ trong lúc kéo, neo đúng vào nút phải khi thả.
- [ ] Rê qua nút đích thì nút đó được tô sáng và dây neo vào chính nó.
- [ ] Thả ra ngoài (không vào nút nào) thì dây nháp biến mất, không tạo nối rác.
- [ ] Bấm nút trái rồi bấm nút phải cũng nối được (cách bấm thay cho kéo).
- [ ] Nối **đủ tất cả các cặp** (không phải chỉ cặp đầu tiên): sau mỗi cặp vẫn
      bấm/kéo được các ô khái niệm còn lại, không bị thông báo lỗi và không kẹt.
- [ ] **Quan hệ nhiều-nhiều:** nối thêm một giải thích cho cùng một khái niệm →
      dây nối **cũ vẫn còn**, dây mới được thêm vào (không bị ghi đè).
- [ ] **Quan hệ nhiều-nhiều:** nối cùng một giải thích cho nhiều khái niệm →
      dây nối **cũ vẫn còn**, ô giải thích đó có nhiều dây cùng neo vào.
- [ ] Kéo từ nút **bên phải** sang nút bên trái cũng tạo thêm cặp nối.
- [ ] Nút bên trái hiện số giải thích đang nối; ô bên phải có huy hiệu số
      khái niệm đang nối.
- [ ] Bấm nút phải đang nối nhiều khái niệm → gỡ **hết** các cặp của nút đó.
- [ ] Chọn một khái niệm rồi bấm nút phải → bật/tắt đúng cặp nối giữa hai ô.
- [ ] Thử cửa sổ trình duyệt hẹp và rộng; hai cột vẫn ổn định, văn bản tự xuống
  dòng và đường nối bám theo điểm.
- [ ] Nộp câu trả lời và xác nhận dây đã nối đúng chuyển xanh, dây sai chuyển
      đỏ, mỗi cặp đúng còn thiếu được vẽ thêm dây vàng.
- [ ] Trước khi nộp không hiển thị dây đáp án còn thiếu; sau khi nộp các ô bị
      khóa và không thể thay đổi câu trả lời.

### Điền từ vào đoạn văn (Cloze)

- [ ] Mở Editor Cloze và xác nhận chỉ có một textarea nội dung dùng placeholder
      `{{N}}`, thay thế trường tên riêng và trường “Nội dung đoạn văn”; danh sách
      đáp án và nút thêm dòng cùng nằm trong nhóm “Tên / nội dung câu hỏi”.
- [ ] Lưu Editor, tạo bản runtime và xác nhận các mảng đáp án hợp lệ vẫn được
      giữ nguyên trong `blanks[].answers`.
- [ ] Xác nhận Player chỉ hiển thị đoạn văn một lần, không lặp lại nội dung
      placeholder ở tiêu đề câu hỏi.
- [ ] Chạy câu hỏi và nhập đáp án đúng có khoảng trắng đầu/cuối, chữ hoa/thường
      khác với đáp án cấu hình; xác nhận hệ thống vẫn chấm đúng.
- [ ] Nhập một đáp án trong mảng nhiều đáp án được chấp nhận; xác nhận ô chuyển
      xanh.
- [ ] Nộp câu trả lời sai hoặc bỏ trống một ô; xác nhận ô chuyển đỏ và hiện
      đáp án chuẩn màu vàng ngay cạnh ô.
- [ ] Với một đáp án hợp lệ, xác nhận gợi ý vàng hiển thị bằng chữ; với nhiều
      đáp án, xác nhận danh sách thả màu vàng liệt kê đủ đáp án.
- [ ] Để trống tất cả ô rồi nộp; xác nhận câu vẫn được nộp và mọi ô chuyển đỏ
      với gợi ý đáp án phù hợp.

### Chọn từ trong danh sách (Dropdown)

- [ ] Mở cấu hình và xác nhận textarea nội dung nằm trong nhóm “Tên / nội dung
      câu hỏi”, dùng `{{1}}`, `{{2}}`, ... để chèn các danh sách chọn.
- [ ] Xác nhận không còn trường đoạn văn riêng, danh sách từ dùng chung hoặc
      nút sao chép danh sách chung.
- [ ] Cấu hình lựa chọn và đáp án đúng riêng cho từng chỗ trống; thêm/xóa chỗ
      trống và xác nhận thứ tự placeholder khớp với cấu hình.
- [ ] Gõ thêm `{{N}}` vào nội dung câu hỏi; xác nhận Editor tự tạo nhóm lựa
      chọn cho placeholder mới.
- [ ] Lưu, mở lại và chạy Player; nội dung hiển thị đúng một lần, mỗi chỗ trống
      có danh sách riêng và sau khi nộp được khóa, phản hồi đúng/sai rõ ràng.

### Chọn vùng trên ảnh (Hotspot)

- [ ] Mở cấu hình Hotspot, đổi một vùng chữ nhật thành hình tròn rồi đổi lại;
      xác nhận hình dạng hiển thị và kích thước vẫn hợp lý trên ảnh ngang/dọc.
- [ ] Lưu cấu hình, mở lại và xác nhận `shape` cùng tọa độ/kích thước được giữ.
- [ ] Chạy câu hỏi, kéo vùng người chơi đến vị trí đáp án và nộp; xác nhận đáp
      án vàng, vùng người chơi đỏ và phần giao xanh hiển thị đồng thời.
- [ ] Đặt tên vùng có nhiều từ trong Editor; xác nhận tên hiển thị trên vùng
      kéo thả của Player trùng chính xác với tên đã lưu.
- [ ] Thử vùng tròn–tròn, chữ nhật–chữ nhật và tròn–chữ nhật; xác nhận phần
      giao theo đúng đường biên, không tô xanh toàn bộ hộp bao của hình tròn.
- [ ] Thử vùng trùng hoàn toàn, giao một phần và không giao; xác nhận ngưỡng
      giao vẫn quyết định kết quả chấm, còn lớp màu thể hiện hình học giao thật.

### Matching trong trình chỉnh sửa (Editor)

- [ ] Giao diện **KHÔNG đổi** so với bản trước: mỗi khái niệm có N cúc tròn
      **+ 1 cúc "+"** để thêm giải thích mới (không phải kiểu "1 nút/ô" của
      Player View).
- [ ] Tạo cặp nối ô, **đóng** bảng cấu hình rồi **mở lại lần thứ hai**: các
      đường nối cũ vẫn hiển thị đúng vị trí, bám sát mép cúc tròn (không bị lệch
      khi modal đang chạy animation mở cửa).
- [ ] Sửa lại nội dung khái niệm / giải thích: đường nối vẫn bám đúng sau khi
      gõ.
- [ ] Thêm / xoá khái niệm và giải thích: đường nối được vẽ lại tương ứng.
- [ ] Bấm lại cúc tròn đã nối để tách cặp; lưu cấu hình rồi mở lại vẫn giữ
      đúng số cặp đã nối.

### Trắc nghiệm

- [ ] Tạo câu hỏi trắc nghiệm và xác nhận công tắc xáo trộn mặc định tắt.
- [ ] Bật xáo trộn, lưu rồi mở lại cấu hình; xác nhận trạng thái được giữ.
- [ ] Chạy câu hỏi với xáo trộn bật và tắt; kiểm tra thứ tự lựa chọn thay đổi
  khi bật và giữ nguyên thứ tự gốc khi tắt.
- [ ] Kiểm tra chấm đúng ở cả chế độ chọn một và chọn nhiều sau khi xáo trộn.
- [ ] Xác nhận cấu hình và màn hình chơi không hiển thị số lượng đáp án đúng.
- [ ] Nộp câu trả lời và xác nhận chỉ viền chuyển xanh/đỏ, nền không đổi.

### Câu hỏi sắp xếp

- [ ] Kéo một hàng lên/xuống; hàng nổi bóng đổ, bám con trỏ theo chiều dọc và
  một khe giữ chỗ xuất hiện tại vị trí ban đầu.
- [ ] Kéo qua tâm các hàng khác; khe đích đổi vị trí tức thời và các hàng bị
  đi qua trượt mượt để nhường chỗ.
- [ ] Khi bắt đầu kéo, xác nhận ô không nhảy khỏi vị trí/con trỏ ban đầu.
- [ ] Thả hàng; hàng snap vào khe đích, thứ tự được cập nhật và đánh số lại.
- [ ] Nộp thứ tự đúng; tất cả hàng có nền/viền xanh và bounce nhẹ.
- [ ] Nộp thứ tự sai; cả danh sách chuyển đỏ và lắc trước khi Bubble Sort hiển
  thị thứ tự đúng, sau đó chuyển xanh.
- [ ] Bật cài đặt giảm chuyển động của hệ điều hành và xác nhận animation được
  rút ngắn.

### Hồi quy cơ bản

- [ ] Mở modal bằng nút bánh răng và lưu cấu hình.
- [ ] Bắt đầu, dừng và quay lại Builder.
- [ ] Lưu dự án, tải lại dự án đã lưu và xác nhận dữ liệu câu hỏi còn nguyên.
