// 把 Google 服務帳號金鑰（JSON）存進 Supabase Secrets，不經過聊天、不進 Git。
// 用法：npm run sa:secret -- C:\路徑\金鑰.json
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const file = process.argv[2]
if (!file) { console.error('請給金鑰 JSON 的路徑：npm run sa:secret -- "D:/桌面/xxx.json"'); process.exit(1) }
const j = JSON.parse(readFileSync(file, 'utf8'))
if (!j.client_email || !j.private_key) { console.error('這不是服務帳號金鑰檔（缺 client_email / private_key）'); process.exit(1) }
const b64 = Buffer.from(j.private_key, 'utf8').toString('base64')
console.log('服務帳號：', j.client_email)
const r = spawnSync('npx', ['supabase', 'secrets', 'set', `GOOGLE_SA_EMAIL=${j.client_email}`, `GOOGLE_SA_KEY_B64=${b64}`, '--project-ref', 'cqbiozfappfwfcahtxfm'], { stdio: 'inherit', shell: true })
if (r.status === 0) console.log('\n✅ 已存進 Supabase。記得把公車表「共用」給上面這個信箱（編輯者），然後刪掉這個 JSON 檔。')
process.exit(r.status ?? 1)
