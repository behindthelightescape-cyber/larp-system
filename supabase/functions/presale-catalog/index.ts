import { corsFor, db, getSettings, jsonRes, SITE_ORIGINS } from '../_shared/presale.ts'

// GET（免登入）：上架中的預售品項＋折抵級距，給官網即時顯示價格。
// 回傳：{ items:[{id,script_name,title,price,later_price,max_extra,groups,image_url,sale_start,sale_end,on_sale}], tiers:[{min_qty,discount_per_item}], open, test_mode }

Deno.serve(async (req) => {
  const cors = corsFor(req, SITE_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return jsonRes(cors, { error: 'Method not allowed' }, 405)

  try {
    const [{ data: items, error: e1 }, { data: tiers, error: e2 }, settings] = await Promise.all([
      db.from('presale_items')
        .select('id, script_name, title, price, later_price, max_extra, group_key, image_url, sale_start, sale_end')
        .eq('is_active', true).order('sort_order'),
      db.from('presale_tiers').select('min_qty, discount_per_item').order('min_qty'),
      getSettings(),
    ])
    if (e1 || e2) throw new Error((e1 ?? e2)!.message)

    const now = Date.now()
    const out = (items ?? []).map((i) => {
      const started = !i.sale_start || Date.parse(i.sale_start) <= now
      const ended = !!i.sale_end && Date.parse(i.sale_end) < now
      const { group_key, ...rest } = i
      return {
        ...rest,
        groups: (group_key ?? '').split(',').map((g: string) => g.trim()).filter(Boolean),
        on_sale: (started || settings.test_mode) && !ended,
      }
    })
    return jsonRes(cors, {
      items: out,
      tiers: tiers ?? [],
      open: out.some((i) => i.on_sale),
      test_mode: settings.test_mode,
    }, 200, { 'Cache-Control': 'public, max-age=60' })
  } catch (err) {
    console.error('presale-catalog 失敗:', err)
    return jsonRes(cors, { error: '讀取預售資料失敗' }, 500)
  }
})
