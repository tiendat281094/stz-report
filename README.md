# Somtam ZAAP — Sales Dashboard (streport.somtamzaap.vn)

Hosted, persistent version of the monthly Somtam ZAAP sales dashboard. BOD bookmarks one URL;
each month a new data file gets added and the site picks it up via a month dropdown. The store
filter (Cả 2 cơ sở / 70 Minh Khai / 136 Pasteur) works independently of the month selection, exactly
as in the original single-file HTML dashboards.

Same architecture as the BEPBO site at `report.somtamzaap.vn` — this is a separate repo/subdomain,
additive to it.

## How it works

```
index.html          ← fixed dashboard shell — layout/tabs/charts never change month to month
CNAME                ← "streport.somtamzaap.vn", required for GitHub Pages custom domain
data/
  manifest.json      ← lists every month in chronological order + which one loads by default
  2026-03.json …     ← one file per month, in the schema below
scripts/
  extract-month.js   ← pulls a month's data out of the original single-file HTML (see below)
```

`index.html` fetches `data/manifest.json` on load, populates the month dropdown, then fetches the
selected month's `data/YYYY-MM.json` (plus the previous month's, for the "So sánh tháng trước" and
growth tabs). No AI/analysis logic, no backend — this repo only ever receives finished JSON output.

## Monthly update procedure

Each month, the AI analysis still happens the same way it always has — **nothing changes about
that step**:

1. **Analyze the new month as usual.** Upload the MK and Pasteur POS exports to a Claude chat using
   the `stz-sales-report` skill, same as every month. It outputs the usual self-contained
   `SomtamZAAP_BaoCaoDoanh_T[MM]_[YYYY].html` file — keep sending that to BOD exactly as before.
   Before moving on, confirm the output actually has **7 tabs** (Tổng quan · Xu hướng theo ngày ·
   Phân tích giờ · Kênh & Giá trị hoá đơn · So sánh tháng trước · **Gợi ý tăng trưởng** · Nhận xét).
   The skill docs were updated to require this tab going forward — if it's missing, the skill run
   didn't follow the current template and should be redone.

2. **Extract that HTML into this site's JSON schema.** The monthly HTML embeds its data as plain JS
   `const` declarations in a `<script>` block (names follow a `DL[MM]` convention that changes every
   month, e.g. `DL7`/`DL6` in July). `scripts/extract-month.js` runs that script in a sandboxed Node
   `vm` context (stubbing `document`/`Chart`) and reads the objects back out, so the numbers are
   guaranteed to match what BOD already received — no re-deriving from the raw POS files.

   Open the new HTML's `<script>` block first and note the actual const names, then run:

   ```
   node scripts/extract-month.js SomtamZAAP_BaoCaoDoanh_T07_2026.html \
     --current=DL7 --previous=DL6 \
     --nhanxet=NHAN_XET --goiy=GOI_Y_TANG_TRUONG \
     --thang=7 --nam=2026 \
     --out=data/2026-07.json
   ```

   **This machine doesn't have Node.js installed.** Either run this step inside the same
   Claude session/sandbox used for the `stz-sales-report` analysis (it already has Node — that's
   how the first 4 months here were extracted), or install Node locally first (`brew install node`)
   if you'd rather do this step on your Mac.

3. **Update the manifest.** Add the new month to `data/manifest.json`, keeping chronological order,
   and update `"default"` to the new month's key:

   ```json
   { "key": "2026-07", "label": "Tháng 7 · 2026" }
   ```

4. **Commit and push.**

   ```
   git add data/2026-07.json data/manifest.json
   git commit -m "Add July 2026 data"
   git push
   ```

   GitHub Pages redeploys automatically within a minute or two of the push.

5. **Verify:** open `https://streport.somtamzaap.vn`, pick the new month from the dropdown, and
   click through all 3 store filters and all 7 tabs — especially "Gợi ý tăng trưởng," since it's the
   newest tab and easiest one to end up empty if a step was skipped.

## JSON schema (`data/YYYY-MM.json`)

```jsonc
{
  "meta": { "thang": 7, "nam": 2026, "so_ngay": 31, "ngay_cuoi": 31 },
  "du_lieu": {
    "ca2": { /* chi_so, theo_ngay, theo_gio, thu_trong_tuan, ngay_thuong_cuoi_tuan,
                buoi, buoi_ngay, kenh, gia_tri_hoa_don */ },
    "mk":  { "nhan": "70 Nguyễn Thị Minh Khai", /* same groups as ca2 */ },
    "pa":  { "nhan": "136 Pasteur", /* same groups as ca2 */ }
  },
  "nhan_xet": { "ca2": [ /* 8 items */ ], "mk": [...8], "pa": [...8] },
  "goi_y_tang_truong": {
    "ca2": { "lam-ngay": [...], "dat-cuoc": [...], "chinh-sua": [...], "theo-doi": [...] },
    "mk":  { /* same 4 categories */ },
    "pa":  { /* same 4 categories */ }
  } // null is fine if a month has nothing meaningful to say here — the shell hides the tab content
}
```

## Out of scope for this repo

No AI/LLM calls, no data analysis logic, no Python — static HTML/JS/CSS only. All analysis happens
in Claude chat using the `stz-sales-report` skill; this repo only receives the *output* JSON.
No backend/database — flat files in `/data` are the entire "database." No auth/login for v1.
