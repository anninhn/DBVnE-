# VNExpress Brand Color Palette

> Nguồn: Figma — QUY CHUẨN GRAPHIC VNE

---

## 01 — Màu nhận diện thương hiệu

| Màu | Hex |
|-----|-----|
| Đỏ brand | `#A9324E` |
| Xanh đậm | `#314057` |
| Xám nền | `#E4E3E8` |

---

## 02 — Hệ màu chính cơ bản bậc 1

6 màu gốc + 4 mức nền + 5 mức trắng/đen.

### 6 màu chính

| Tên | Hex | Dùng cho |
|-----|-----|----------|
| Xanh lá | `#88AD8D` | Success, positive, environment |
| Xanh nhạt | `#9FCDDC` | Info, links, secondary |
| Xanh đậm | `#314057` | Headings, nav, text chính |
| Đỏ brand | `#A9324E` | CTA, highlight, breaking news |
| Cam | `#E5813B` | Warning, featured, energy |
| Vàng | `#EDCF76` | Highlight, badge, attention |

### Màu nền

| Hex | Dùng cho |
|-----|----------|
| `#E4E3E8` | Sidebar, panels, nền brand |
| `#E9E8EC` | Section background |
| `#F4F4F6` | Card background |
| `#F9F9FB` | Page background sáng nhất |

### Trắng / Đen

| Hex | Dùng cho |
|-----|----------|
| `#3D3D3D` | Text chính |
| `#7A7A7B` | Text phụ, caption |
| `#B7B7B7` | Placeholder, disabled |
| `#F9F9FB` | Nền sáng |
| `#FFFFFF` | Nền trắng |

---

## 03 — Hệ màu chính bậc 2 (6 sắc thái mỗi màu)

Mỗi màu gốc có 6 levels: 500 (đậm nhất) → 50 (nhạt nhất).

### Vàng — `#EDCF76`

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 500 | `#EDCF76` | `--vne-yellow-500` |
| 400 | `#F0D78F` | `--vne-yellow-400` |
| 300 | `#F3E0A8` | `--vne-yellow-300` |
| 200 | `#F6E8C3` | `--vne-yellow-200` |
| 100 | `#FAF2DE` | `--vne-yellow-100` |
| 50 | `#FDF9EF` | `--vne-yellow-50` |

### Cam — `#E5813B`

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 500 | `#E5813B` | `--vne-orange-500` |
| 400 | `#EA9757` | `--vne-orange-400` |
| 300 | `#EFAE7B` | `--vne-orange-300` |
| 200 | `#F4C8A0` | `--vne-orange-200` |
| 100 | `#F9E1CB` | `--vne-orange-100` |
| 50 | `#FDF1E7` | `--vne-orange-50` |

### Đỏ — `#A9324E`

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 500 | `#A9324E` | `--vne-red-500` |
| 400 | `#B55B65` | `--vne-red-400` |
| 300 | `#C37E81` | `--vne-red-300` |
| 200 | `#D2A2A3` | `--vne-red-200` |
| 100 | `#E5CCCA` | `--vne-red-100` |
| 50 | `#F5EAE9` | `--vne-red-50` |

### Xanh đậm — `#314057`

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 500 | `#314057` | `--vne-navy-500` |
| 400 | `#51586D` | `--vne-navy-400` |
| 300 | `#717586` | `--vne-navy-300` |
| 200 | `#9798A6` | `--vne-navy-200` |
| 100 | `#C3C3CB` | `--vne-navy-100` |
| 50 | `#E1E0E5` | `--vne-navy-50` |

### Xanh nhạt — `#9FCDDC`

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 500 | `#9FCDDC` | `--vne-cyan-500` |
| 400 | `#B1D5E2` | `--vne-cyan-400` |
| 300 | `#C0DCE7` | `--vne-cyan-300` |
| 200 | `#CFE4EC` | `--vne-cyan-200` |
| 100 | `#EDF4F7` | `--vne-cyan-100` |
| 50 | `#F3F8FA` | `--vne-cyan-50` |

### Xanh lá — `#88AD8D`

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 500 | `#88AD8D` | `--vne-green-500` |
| 400 | `#9DB99F` | `--vne-green-400` |
| 300 | `#B2C7B3` | `--vne-green-300` |
| 200 | `#C9D7C9` | `--vne-green-200` |
| 100 | `#E1E8E0` | `--vne-green-100` |
| 50 | `#F1F4F0` | `--vne-green-50` |

### Nền

| Step | Hex | CSS Variable |
|------|-----|-------------|
| 300 | `#E4E3E8` | `--vne-bg-300` |
| 200 | `#E9E8EC` | `--vne-bg-200` |
| 100 | `#F4F4F6` | `--vne-bg-100` |
| 50 | `#F9F9FB` | `--vne-bg-50` |

---

## 04 — Hệ phối màu

### A/ Màu đồng sắc (Monochromatic)

Sử dụng cùng một tông màu với các giá trị sáng tối khác nhau. Chỉ dùng một màu hoặc các sắc thái của cùng một màu.

| Màu gốc | Sắc thái | Nền |
|---------|----------|-----|
| `#EDCF76` | `#F0D78F` `#F3E0A8` `#F6E8C3` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |
| `#E5813B` | `#EA9757` `#EFAE7B` `#F4C8A0` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |
| `#A9324E` | `#B55B65` `#C37E81` `#D2A2A3` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |
| `#314057` | `#51586D` `#717586` `#9798A6` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |
| `#9FCDDC` | `#B1D5E2` `#C0DCE7` `#CFE4EC` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |
| `#88AD8D` | `#9DB99F` `#B2C7B3` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |

### B/ Màu tương đồng (Analogous)

Màu kề nhau trên bánh xe màu. Màu đậm dùng nhấn nhá, thu hút chú ý.

**Warm analogous:**

| Nhóm | Màu |
|------|-----|
| Vàng | `#EDCF76` `#F0D78F` `#F3E0A8` |
| Cam | `#E5813B` `#EA9757` `#EFAE7B` |
| Đỏ | `#A9324E` `#B55B65` `#C37E81` |

**Cool analogous:**

| Nhóm | Màu |
|------|-----|
| Xanh nhạt | `#9FCDDC` `#B1D5E2` `#C0DCE7` |
| Xanh lá | `#88AD8D` `#9DB99F` `#B2C7B3` |
| Xanh đậm | `#51586D` `#717586` |

### C/ Màu tương phản (Contrasting)

Warm vs Cool — tạo chiều sâu và nổi bật.

| Warm | Cool |
|------|------|
| `#EDCF76` `#F0D78F` `#F3E0A8` `#F6E8C3` | `#88AD8D` `#9DB99F` `#B2C7B3` `#C9D7C9` |
| `#E5813B` `#EA9757` `#EFAE7B` `#F4C8A0` | `#9FCDDC` `#B1D5E2` `#C0DCE7` `#CFE4EC` |
| `#A9324E` `#B55B65` `#C37E81` `#D2A2A3` | `#314057` `#51586D` `#717586` `#9798A6` |

### D/ Bộ phối 3 màu (Triadic)

Kết hợp 3 nhóm màu tạo sự phong phú nhưng hài hòa.

| Bộ 1 | Bộ 2 |
|------|------|
| Vàng + Xanh lá + Xanh nhạt | Vàng + Xanh đậm + Đỏ |
| Cam + Đỏ + Xanh nhạt | Cam + Đỏ + Xanh đậm |

### E/ Bộ phối 4 màu (Tetradic)

| Phong cách | Bộ màu |
|------------|--------|
| Tương phản nhẹ nhàng | `#314057` + `#9FCDDC` + `#E5813B` + `#EDCF76` |
| Tương phản nhẹ nhàng | `#EDCF76` + `#E5813B` + `#EDCF76` + `#88AD8D` |
| Tương phản nhẹ nhàng | `#9FCDDC` + `#314057` + `#314057` + `#9FCDDC` |
| Ấn tượng / màu mạnh | `#314057` + `#E4E3E8` + `#A9324E` + `#314057` |
| Ấn tượng / màu mạnh | `#9FCDDC` + `#E5813B` + `#EDCF76` + `#88AD8D` |
| Ấn tượng / màu mạnh | `#E4E3E8` + `#314057` + `#E4E3E8` + `#9FCDDC` |
| Ấn tượng / màu mạnh | `#314057` + `#E4E3E8` + `#314057` + `#A9324E` |
| Ấn tượng / màu mạnh | `#A9324E` + `#88AD8D` + `#A9324E` + `#314057` |
| Sáng màu | `#88AD8D` + `#E4E3E8` + `#E4E3E8` + `#88AD8D` |
| Sáng màu | `#9FCDDC` + `#EDCF76` + `#E5813B` + `#E4E3E8` |
| Sáng màu | `#314057` + `#88AD8D` + `#EDCF76` + `#9FCDDC` |
| Sáng màu | `#E4E3E8` + `#9FCDDC` + `#A9324E` + `#E5813B` |
| Sáng màu | `#EDCF76` + `#9FCDDC` + `#E4E3E8` + `#E4E3E8` |
| Sáng màu | `#9FCDDC` + `#E4E3E8` + `#314057` + `#9FCDDC` |
| Sáng màu | `#314057` + `#EDCF76` + `#E5813B` + `#E5813B` |
| Sáng màu | `#E4E3E8` + `#E5813B` + `#A9324E` + `#A9324E` |

---

## 05 — Gợi ý màu cho biểu đồ (Charts)

| Vai trò | Màu chính | Sắc thái |
|---------|-----------|----------|
| **Main Red** — Actions, Warning | `#A9324E` | `#B55B65` `#C37E81` `#D2A2A3` `#E5CCCA` `#F5EAE9` |
| **Orange** — Secondary | `#E5813B` | `#EA9757` `#EFAE7B` `#F4C8A0` `#F9E1CB` `#FDF1E7` |
| **Yellow** — Attention | `#EDCF76` | `#F0D78F` `#F3E0A8` `#F6E8C3` `#FAF2DE` `#FDF9EF` |
| **Green** — Tick, Good | `#88AD8D` | `#9DB99F` `#B2C7B3` `#C9D7C9` `#E1E8E0` `#F1F4F0` |
| **Cyan** — Boxes | `#9FCDDC` | `#B1D5E2` `#C0DCE7` `#CFE4EC` `#EDF4F7` `#F3F8FA` |
| **Navy** — Labels | `#314057` | `#51586D` `#717586` `#9798A6` `#C3C3CB` `#E1E0E5` |
| **Black** — Text | `#3D3D3D` | `#7A7A7B` |
| **Background** | `#F4F4F6` | `#E4E3E8` `#E9E8EC` `#F4F4F6` `#F9F9FB` |

---

## Tailwind Config

```js
// tailwind.config.ts
colors: {
  vne: {
    // 6 màu chính — full scale
    yellow: {
      50: '#FDF9EF',
      100: '#FAF2DE',
      200: '#F6E8C3',
      300: '#F3E0A8',
      400: '#F0D78F',
      500: '#EDCF76',
    },
    orange: {
      50: '#FDF1E7',
      100: '#F9E1CB',
      200: '#F4C8A0',
      300: '#EFAE7B',
      400: '#EA9757',
      500: '#E5813B',
    },
    red: {
      50: '#F5EAE9',
      100: '#E5CCCA',
      200: '#D2A2A3',
      300: '#C37E81',
      400: '#B55B65',
      500: '#A9324E',
    },
    navy: {
      50: '#E1E0E5',
      100: '#C3C3CB',
      200: '#9798A6',
      300: '#717586',
      400: '#51586D',
      500: '#314057',
    },
    cyan: {
      50: '#F3F8FA',
      100: '#EDF4F7',
      200: '#CFE4EC',
      300: '#C0DCE7',
      400: '#B1D5E2',
      500: '#9FCDDC',
    },
    green: {
      50: '#F1F4F0',
      100: '#E1E8E0',
      200: '#C9D7C9',
      300: '#B2C7B3',
      400: '#9DB99F',
      500: '#88AD8D',
    },

    // Nền
    bg: {
      50: '#F9F9FB',
      100: '#F4F4F6',
      200: '#E9E8EC',
      300: '#E4E3E8',
    },

    // Trắng / đen
    gray: {
      100: '#F9F9FB',
      300: '#B7B7B7',
      500: '#7A7A7B',
      900: '#3D3D3D',
    },

    white: '#FFFFFF',
  },
}
```

## CSS Variables

```css
:root {
  /* Vàng */
  --vne-yellow-500: #EDCF76;
  --vne-yellow-400: #F0D78F;
  --vne-yellow-300: #F3E0A8;
  --vne-yellow-200: #F6E8C3;
  --vne-yellow-100: #FAF2DE;
  --vne-yellow-50: #FDF9EF;

  /* Cam */
  --vne-orange-500: #E5813B;
  --vne-orange-400: #EA9757;
  --vne-orange-300: #EFAE7B;
  --vne-orange-200: #F4C8A0;
  --vne-orange-100: #F9E1CB;
  --vne-orange-50: #FDF1E7;

  /* Đỏ */
  --vne-red-500: #A9324E;
  --vne-red-400: #B55B65;
  --vne-red-300: #C37E81;
  --vne-red-200: #D2A2A3;
  --vne-red-100: #E5CCCA;
  --vne-red-50: #F5EAE9;

  /* Xanh đậm */
  --vne-navy-500: #314057;
  --vne-navy-400: #51586D;
  --vne-navy-300: #717586;
  --vne-navy-200: #9798A6;
  --vne-navy-100: #C3C3CB;
  --vne-navy-50: #E1E0E5;

  /* Xanh nhạt */
  --vne-cyan-500: #9FCDDC;
  --vne-cyan-400: #B1D5E2;
  --vne-cyan-300: #C0DCE7;
  --vne-cyan-200: #CFE4EC;
  --vne-cyan-100: #EDF4F7;
  --vne-cyan-50: #F3F8FA;

  /* Xanh lá */
  --vne-green-500: #88AD8D;
  --vne-green-400: #9DB99F;
  --vne-green-300: #B2C7B3;
  --vne-green-200: #C9D7C9;
  --vne-green-100: #E1E8E0;
  --vne-green-50: #F1F4F0;

  /* Nền */
  --vne-bg-300: #E4E3E8;
  --vne-bg-200: #E9E8EC;
  --vne-bg-100: #F4F4F6;
  --vne-bg-50: #F9F9FB;

  /* Trắng / đen */
  --vne-gray-900: #3D3D3D;
  --vne-gray-500: #7A7A7B;
  --vne-gray-300: #B7B7B7;
  --vne-white: #FFFFFF;
}
```
