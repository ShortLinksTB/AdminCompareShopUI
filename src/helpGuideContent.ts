export type HelpGuide = {
  eyebrow: string;
  title: string;
  steps: readonly string[];
  notes: readonly { text: string; danger?: boolean }[];
  permission?: string;
};

export const helpGuides: Record<string, HelpGuide> = {
  "/": {
      "eyebrow": "OVERVIEW",
      "title": "Dashboard",
      "steps": [
          "Xem 4 chỉ số chính ở đầu trang: Products active, Offers active, Partner shops, Sync success rate.",
          "Theo dõi biểu đồ \"Traffic & affiliate clicks\" và đổi khoảng thời gian (7/30/90 ngày) ở ô chọn góc phải.",
          "Xem \"Data health\" để biết tình trạng pipeline tổng thể (nguồn đang chạy, offer cần review, sync job lỗi).",
          "Bấm \"Xem tất cả →\" ở \"Offers cần review\" hoặc \"Matching queue\" để sang trang xử lý chi tiết."
      ],
      "notes": [
          {
              "text": "Sync success rate giảm mạnh (dưới ~95%) là dấu hiệu nhiều nguồn dữ liệu đang lỗi — vào Sync Jobs kiểm tra ngay, đừng chỉ nhìn số trên Dashboard."
          },
          {
              "text": "Data health dưới 90% nghĩa là đang có incident ảnh hưởng dữ liệu hiển thị cho người dùng cuối — ưu tiên xử lý trước các việc khác trong ca trực.",
              "danger": true
          }
      ]
  },
  "/products": {
      "eyebrow": "CATALOG",
      "title": "Products",
      "steps": [
          "Dùng ô tìm kiếm để lọc theo tên sản phẩm, brand hoặc SKU; dùng bộ lọc trạng thái và \"Filters\" để thu hẹp danh sách.",
          "Tick chọn nhiều sản phẩm để hiện thanh bulk action (Archive, Assign category) ở đầu bảng.",
          "Bấm \"+ New product\" để tạo Product chuẩn mới.",
          "Bấm vào một dòng để mở Product Detail và chỉnh sửa thông tin/specifications."
      ],
      "notes": [
          {
              "text": "Archive một sản phẩm chỉ ẩn khỏi trang so sánh công khai, không xóa các Offer đang gắn với nó — nên xử lý/ẩn offer liên quan trước để tránh hiển thị dữ liệu mồ côi."
          },
          {
              "text": "Sản phẩm ở trạng thái \"Draft\" chưa hiển thị cho người dùng cuối, chỉ \"Active\" mới public."
          }
      ]
  },
  "/products/:id": {
      "eyebrow": "PRODUCT DETAIL",
      "title": "Product Detail",
      "steps": [
          "Sửa thông tin cơ bản: tên, brand, category, status ở khối form phía trên.",
          "Thêm/sửa Specifications — đây là dữ liệu dùng để so sánh và gợi ý matching.",
          "Xem \"Product health\" và lịch sử audit activity ở cột phải.",
          "Xem nhanh các Offer đang gắn với sản phẩm, bấm \"Manage offers →\" để sang trang Offers & Prices đầy đủ."
      ],
      "notes": [
          {
              "text": "Sửa Specifications có thể ảnh hưởng thuật toán gợi ý matching tự động — sau khi lưu, nên kiểm tra lại hàng chờ ở Product Matching để chắc chắn không tạo gợi ý sai."
          },
          {
              "text": "Archive là hành động ảnh hưởng hiển thị công khai ngay lập tức — xác nhận kỹ trước khi bấm, đặc biệt với sản phẩm đang có nhiều offer active."
          }
      ]
  },
  "/offers": {
      "eyebrow": "CATALOG & PRICING",
      "title": "Offers & Prices",
      "steps": [
          "Dùng Toolbar để tìm theo sản phẩm/shop và lọc theo trạng thái (Active, Stale, Outlier).",
          "Bấm \"+ Import offers\" để nạp offer hàng loạt từ nguồn dữ liệu.",
          "Xem từng dòng offer: giá cuối, giá gốc, tồn kho, nguồn dữ liệu (source)."
      ],
      "notes": [
          {
              "text": "Offer \"Stale\" (quá hạn cập nhật theo ngưỡng cấu hình ở Settings) sẽ tự động bị ẩn khỏi kết quả so sánh — không cần xóa, chỉ cần đồng bộ lại nguồn."
          },
          {
              "text": "Offer \"Outlier\" là giá lệch bất thường so với mức giá trung vị — rất có thể là lỗi nhập liệu từ phía nguồn, cần kiểm tra thủ công trước khi để offer này hiển thị cho người dùng.",
              "danger": true
          }
      ]
  },
  "/matching": {
      "eyebrow": "CATALOG",
      "title": "Product Matching",
      "steps": [
          "Mỗi thẻ là một listing đang chờ duyệt, kèm danh sách tối đa 5 sản phẩm gợi ý theo % tương đồng.",
          "Chọn radio ở sản phẩm khớp nhất, hoặc bấm \"Không có sản phẩm phù hợp\" nếu không có lựa chọn nào đúng.",
          "Bấm \"Duyệt\" để xác nhận gộp listing vào sản phẩm đã chọn.",
          "Danh sách tự làm mới mỗi 30 giây; có thể bấm \"↻ Làm mới\" để cập nhật ngay."
      ],
      "notes": [
          {
              "text": "% tương đồng chỉ mang tính tham khảo, không phải độ chắc chắn tuyệt đối — luôn đọc tên và brand trước khi duyệt.",
              "danger": true
          },
          {
              "text": "Duyệt sai sẽ gộp nhầm offer vào Product khác, làm sai lệch dữ liệu so sánh giá hiển thị cho người dùng — thao tác này không có nút \"hoàn tác\" nhanh, phải sửa lại thủ công ở Product Detail.",
              "danger": true
          },
          {
              "text": "Nếu duyệt bị lỗi mạng, lựa chọn vẫn được giữ nguyên trên màn hình — chỉ cần bấm \"Thử lại\", không cần chọn lại từ đầu."
          }
      ]
  },
  "/shops": {
      "eyebrow": "AFFILIATE & DATA",
      "title": "Partner Shops",
      "steps": [
          "Xem lưới các partner shop: loại hình, số product/offer đang có, trạng thái kết nối, lần sync gần nhất.",
          "Bấm \"+ Add shop\" để thêm đối tác mới.",
          "Dùng menu \"•••\" trên mỗi thẻ để xem thêm thao tác quản lý shop."
      ],
      "notes": [
          {
              "text": "Shop ở trạng thái \"Failed\" nghĩa là giá/tồn kho của shop đó đang không được cập nhật cho người dùng — kiểm tra ngay ở Data Sources hoặc Sync Jobs liên quan, đừng để kéo dài."
          }
      ]
  },
  "/data-sources": {
      "eyebrow": "AFFILIATE & DATA",
      "title": "Data Sources",
      "steps": [
          "Mỗi thẻ là một nguồn dữ liệu: loại (API/Affiliate feed/CSV), lịch chạy, trạng thái credential, lần sync gần nhất.",
          "Bấm \"Configure\" để sửa thông tin kết nối/lịch chạy.",
          "Bấm \"Run sync\" để chạy đồng bộ ngay, không chờ lịch."
      ],
      "notes": [
          {
              "text": "Credential ở trạng thái \"Expired\" sẽ khiến mọi lần sync thất bại kể cả khi chạy thủ công — phải cập nhật lại credential trước, \"Run sync\" lúc này chỉ tốn thời gian.",
              "danger": true
          },
          {
              "text": "Nguồn kiểu \"Manual upload\" (CSV) không tự chạy theo lịch — phải có người upload file tay mỗi lần cần cập nhật."
          }
      ]
  },
  "/sync-jobs": {
      "eyebrow": "AFFILIATE & DATA",
      "title": "Sync Jobs",
      "steps": [
          "Xem 3 chỉ số nhanh: success rate, số bản ghi đã sync, số job lỗi cần chú ý.",
          "Với job \"Failed\", bấm \"Retry\" để chạy lại; với job khác bấm \"View log\" để xem chi tiết.",
          "Bấm \"↻ Run sync\" ở góc trên để khởi chạy một job mới."
      ],
      "notes": [
          {
              "text": "Job lỗi không tự retry — nếu để lâu, dữ liệu giá hiển thị cho người dùng sẽ ngày càng lệch so với thực tế của shop.",
              "danger": true
          },
          {
              "text": "Không nên bấm \"Retry\" khi một job cùng nguồn đang ở trạng thái \"Running\" — dễ tạo chạy trùng (duplicate) và làm lệch số liệu records."
          }
      ]
  },
  "/affiliate-links": {
      "eyebrow": "AFFILIATE & DATA",
      "title": "Affiliate Links",
      "steps": [
          "Xem trạng thái redirect của từng affiliate link và hiệu suất (click, chuyển đổi) theo shop/sản phẩm."
      ],
      "notes": [
          {
              "text": "Trang chưa có permission riêng ở backend (ví dụ affiliate_links.read) nên hiện không nằm trong menu chính — chỉ truy cập được qua đường dẫn trực tiếp /affiliate-links. Trước khi thêm vào menu cho admin thường, cần bổ sung permission tương ứng.",
              "danger": true
          }
      ],
      "permission": "🔒 Chưa gắn permission — mọi admin đã đăng nhập đều xem được qua URL trực tiếp."
  },
  "/price-history": {
      "eyebrow": "CATALOG & PRICING",
      "title": "Price History",
      "steps": [
          "Xem biểu đồ xu hướng giá thấp nhất trong 6 tháng gần nhất của sản phẩm.",
          "Xem bảng lịch sử giá theo ngày, shop, mức thay đổi và sự kiện liên quan (voucher, price update, promotion).",
          "Bấm \"Export report\" để xuất báo cáo biến động giá."
      ],
      "notes": [
          {
              "text": "Biến động giá tăng/giảm đột ngột nên đối chiếu với Offers & Prices để loại trừ khả năng lỗi nhập liệu từ Data Source trước khi kết luận là biến động thị trường thật."
          }
      ]
  },
  "/price-alerts": {
      "eyebrow": "CUSTOMER",
      "title": "Price Alerts",
      "steps": [
          "Xem 3 chỉ số: alert đang active, số alert được kích hoạt hôm nay, tỷ lệ gửi thông báo thành công.",
          "Xem bảng chi tiết: giá mục tiêu khách đặt, giá hiện tại, số người theo dõi, lần thông báo gần nhất."
      ],
      "notes": [
          {
              "text": "Delivery rate giảm bất thường thường do lỗi ở hệ thống gửi email/push, không liên quan tới dữ liệu giá — nên phối hợp đội hạ tầng/notification kiểm tra thay vì sửa dữ liệu Offer."
          },
          {
              "text": "Trạng thái \"Pending\" nghĩa là giá hiện tại chưa chạm giá mục tiêu của khách, đây là trạng thái bình thường chứ không phải lỗi hệ thống."
          }
      ]
  },
  "/categories": {
      "eyebrow": "SYSTEM",
      "title": "Categories",
      "steps": [
          "Trang hiện là module mock, dùng để xem trước giao diện trước khi nối API thật."
      ],
      "notes": [
          {
              "text": "Thao tác trên trang này hiện chưa lưu vào hệ thống thật — đây là mock đang chờ nối API, không dùng để thao tác dữ liệu thật.",
              "danger": true
          }
      ]
  },
  "/banned-items": {
      "eyebrow": "COMPLIANCE",
      "title": "Banned items",
      "steps": [
          "Dùng bộ lọc Active/Revoked, loại đối tượng (Brand/Product) và ô tìm kiếm để lọc danh sách.",
          "Bấm \"+ Add\" để cấm một Brand hoặc Product mới — nhập lý do cấm trong form.",
          "Bấm vào một item đang Active để Revoke (gỡ cấm) khi không còn cần thiết."
      ],
      "notes": [
          {
              "text": "Cấm theo Brand sẽ ẩn toàn bộ sản phẩm thuộc brand đó khỏi trang so sánh công khai — tác động rộng hơn nhiều so với cấm từng Product, cần cân nhắc kỹ trước khi chọn target type \"Brand\".",
              "danger": true
          },
          {
              "text": "Chỉ tài khoản có quyền compliance.manage mới thêm/gỡ cấm được; tài khoản chỉ có compliance.read sẽ chỉ xem được danh sách."
          }
      ],
      "permission": "🔒 Cần quyền compliance.read để xem, compliance.manage để thêm/gỡ cấm."
  },
  "/blog": {
      "eyebrow": "CONTENT",
      "title": "Blog CMS",
      "steps": [
          "Dùng ô tìm kiếm để lọc bài viết theo tiêu đề.",
          "Bấm \"+ New article\" để tạo bài mới, \"Edit\" để sửa bài có sẵn.",
          "Theo dõi cột \"SEO score\" để đánh giá chất lượng bài trước khi publish."
      ],
      "notes": [
          {
              "text": "Bài ở trạng thái \"Draft\" hoặc \"Review\" chưa hiển thị cho người dùng — chỉ \"Published\" mới public trên trang chính."
          },
          {
              "text": "SEO score thấp (dưới khoảng 80/100) nên được tối ưu lại nội dung/metadata trước khi chuyển sang Published."
          }
      ]
  },
  "/analytics": {
      "eyebrow": "REPORTING",
      "title": "Analytics & Revenue",
      "steps": [
          "Đổi khoảng thời gian xem báo cáo ở ô chọn góc phải (30/90 ngày).",
          "Xem 4 chỉ số chính: product views, affiliate clicks, conversion rate, revenue.",
          "Xem \"Top products\" theo số click và \"Revenue by partner shop\" để biết đối tác đóng góp doanh thu nhiều nhất."
      ],
      "notes": [
          {
              "text": "Revenue hiển thị là số liệu \"đã đối soát\" (đã được affiliate network xác nhận cuối cùng); số click/view là ước tính gần-thời-gian-thực và có thể lệch nhẹ so với số đối soát sau này — không dùng số click/view để làm báo cáo tài chính chính thức.",
              "danger": true
          }
      ]
  },
  "/seo": {
      "eyebrow": "CONTENT",
      "title": "SEO Management",
      "steps": [
          "Dùng ô tìm kiếm để lọc theo route hoặc từ khóa.",
          "Xem trạng thái Index (Indexed/Noindex) và canonical của từng route.",
          "Bấm \"Edit\" để sửa metadata/canonical cho route."
      ],
      "notes": [
          {
              "text": "Route đang \"Noindex\" hoặc canonical \"Missing\" sẽ không được Google index — cần set canonical đầy đủ trước khi chuyển route đó sang Index."
          },
          {
              "text": "Thay đổi SEO (title, canonical, index) thường mất vài ngày để Google crawl và cập nhật lại kết quả tìm kiếm, không có hiệu lực ngay lập tức."
          }
      ]
  },
  "/users": {
      "eyebrow": "SYSTEM",
      "title": "Users & Roles",
      "steps": [
          "Xem danh sách tài khoản admin kèm role (Super Admin/Operator/Editor/Viewer) và trạng thái hoạt động.",
          "Bấm \"+ Invite user\" để mời thành viên admin mới.",
          "Dùng menu \"•••\" trên mỗi dòng để sửa role hoặc disable tài khoản."
      ],
      "notes": [
          {
              "text": "Role \"Super Admin\" có toàn quyền, kể cả quản lý tài khoản admin khác — chỉ cấp cho người thực sự cần, hạn chế tối đa số lượng Super Admin.",
              "danger": true
          },
          {
              "text": "Disable một tài khoản không xóa lịch sử thao tác của họ trong Audit Logs — dữ liệu audit vẫn được giữ nguyên."
          }
      ],
      "permission": "🔒 Cần quyền users.manage để truy cập trang này."
  },
  "/audit-logs": {
      "eyebrow": "SYSTEM",
      "title": "Audit Logs",
      "steps": [
          "Dùng ô tìm kiếm để lọc theo actor (người thao tác), action hoặc resource.",
          "Đọc cột \"Kết quả\" (Success/Failed) để biết thao tác có thành công hay không."
      ],
      "notes": [
          {
              "text": "Audit Logs chỉ ghi lại lịch sử, không có chức năng hoàn tác (rollback) — nếu phát hiện thao tác sai, phải vào đúng trang chức năng (vd Offers, Products) để sửa thủ công."
          },
          {
              "text": "Log \"Failed\" liên quan đến sync job nên được đối chiếu thêm ở trang Sync Jobs để xử lý tận gốc, Audit Logs chỉ cho biết đã xảy ra lỗi chứ không cho retry tại đây."
          }
      ]
  },
  "/feature-flags": {
      "eyebrow": "SYSTEM",
      "title": "Feature Flags",
      "steps": [
          "Bật/tắt từng module bằng switch ở cuối mỗi dòng.",
          "Bấm \"Enable all\" để bật toàn bộ module cùng lúc."
      ],
      "notes": [
          {
              "text": "Thay đổi chỉ được lưu trong trình duyệt hiện tại (localStorage) — không đồng bộ sang admin khác hay máy khác, mỗi người cần tự cấu hình lại nếu đổi máy/trình duyệt.",
              "danger": true
          },
          {
              "text": "Tắt một flag chỉ ẩn mục đó khỏi menu điều hướng, không thu hồi quyền truy cập thật — nếu tài khoản vẫn còn permission tương ứng, họ vẫn vào được trang qua URL trực tiếp."
          }
      ]
  },
  "/settings": {
      "eyebrow": "SYSTEM",
      "title": "Settings",
      "steps": [
          "Mục \"General\": chọn đơn vị tiền tệ hiển thị, timezone mặc định, ngưỡng coi offer là \"Stale\".",
          "Mục \"Data quality\": bật/tắt Outlier detection, Auto matching suggestions, Notify failed sync.",
          "Bấm \"Save settings\" để lưu thay đổi."
      ],
      "notes": [
          {
              "text": "\"Stale offer threshold\" ảnh hưởng trực tiếp đến khi nào một Offer bị đánh dấu \"Stale\" ở trang Offers & Prices — đặt quá thấp sẽ ẩn offer vẫn còn hợp lệ, đặt quá cao sẽ hiển thị giá cũ cho người dùng.",
              "danger": true
          },
          {
              "text": "Tắt \"Notify failed sync\" nghĩa là sẽ không còn nhận cảnh báo khi Sync Jobs gặp lỗi — chỉ tắt khi có người khác đang chủ động theo dõi Sync Jobs bằng cách khác."
          }
      ],
      "permission": "🔒 Cần quyền settings.manage để lưu thay đổi."
  },
};
