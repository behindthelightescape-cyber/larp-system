<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import QRCode from 'qrcode' 
import JSZip from 'jszip'    

// 🚀 1. 接收從 AdminView 傳來的權限與場館資訊
const props = defineProps({
  branch: {
    type: String,
    default: '西門館1.0'
  }
})

const emit = defineEmits(['update-stats'])
const gameExp = ref(100)
const allScripts = ref([])
const searchQuery = ref('')
const searchResults = ref([])
const selectedScript = ref(null)

const showDropdown = ref(false)

const gmName = ref('')
const gameTime = ref('')
const gameMemory = ref('')

// 🚀 2. 初始化目前選擇的場館 (老闆預設選 1.0，店長就鎖死他自己的店)
const selectedBranch = ref(props.branch === 'ALL' ? '西門館1.0' : props.branch)

const batchQueue = ref([])
const isGenerating = ref(false)
const generatedImages = ref([])

onMounted(async () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  gameTime.value = now.toISOString().slice(0, 16)
  
  await loadScripts()
})

const loadScripts = async () => {
  const { data } = await supabase.from('scripts').select('*').order('id', { ascending: false })
  allScripts.value = data || []
}

const filterScripts = () => {
  showDropdown.value = true 
  const val = searchQuery.value.trim().toLowerCase()
  
  if (!val) {
    searchResults.value = allScripts.value 
    return
  }
  searchResults.value = allScripts.value.filter(s => s.title.toLowerCase().includes(val))
}

const selectScript = (script) => {
  selectedScript.value = script
  searchQuery.value = script.title
  gameMemory.value = script.default_story_memory || ''
  
  // 🚀 關鍵：選擇劇本時，自動把該劇本的 base_exp 帶入！(如果沒設就預設 100)
  gameExp.value = script.base_exp || 50 
  
  showDropdown.value = false 
}

const closeDropdown = () => {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

const addToQueue = () => {
  if (!selectedScript.value || !gmName.value || !gameTime.value) {
    return alert('劇本、GM 名稱或時間沒填完整！')
  }

  const d = new Date(gameTime.value)
  const dt = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  const ft = `${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`

  batchQueue.value.push({
    sid: selectedScript.value.id,
    sn: selectedScript.value.title,
    gm: gmName.value,
    t: gameTime.value,
    dt,
    ft,
    mem: gameMemory.value,
    branchName: selectedBranch.value, // 🚀 3. 把場館資訊一起塞進待辦清單
    exp: gameExp.value
  })

  gmName.value = ''
}

const removeFromQueue = (index) => {
  batchQueue.value.splice(index, 1)
}

const processBatch = async () => {
  if (batchQueue.value.length === 0) return

  isGenerating.value = true
  generatedImages.value = [] 

  try {
    const LIFF_BASE_URL = 'https://liff.line.me/2009161687-icfQU9r6'

    for (const item of batchQueue.value) {
      // 1. 先建立遊戲，拿到唯一的 ID
      const { data, error } = await supabase
        .from('games')
        .insert([{
          script_id: item.sid, 
          gm_name: item.gm, 
          play_time: new Date(item.t), 
          status: 'open', 
          story_memory: item.mem,
          branch_name: item.branchName,
          base_exp: item.exp
        }])
        .select()
      
      if (error) throw error

      const newGameId = data[0].id
      
      // 🚀 2. 關鍵修補：把 game_id 寫進這場遊戲的 qr_payload 欄位！
      await supabase.from('games').update({ qr_payload: newGameId }).eq('id', newGameId)

      // 3. 繼續畫圖
      const url = `${LIFF_BASE_URL}?game_id=${newGameId}` // 👈 注意：我把 action=join 拿掉了，保持網址乾淨
      const imgDataUrl = await generateLabelQR(url, item.sn, item.gm, item.dt, item.branchName)
      
      const safeName = item.sn.replace(/[\\/:*?"<>|]/g, "_")
      generatedImages.value.push({
        name: `${item.ft}_${item.branchName}_${safeName}_${item.gm}.png`,
        data: imgDataUrl
      })
    }

    batchQueue.value = []
    emit('update-stats')
    alert('✅ 所有場次建檔與 QR Code 繪製完成！')

  } catch (error) {
    console.error("生成失敗：", error)
    alert("伺服器炸了，這 bug 找四哥：" + error.message)
  } finally {
    isGenerating.value = false
  }
}

// 🚀 5. QR Code 上面直接印出場館名稱
const generateLabelQR = async (text, scriptName, gmName, timeStr, branchName) => {
  const qrDataUrl = await QRCode.toDataURL(text, { width: 250, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
  
  return new Promise((resolve) => {
    const img = new Image()
    img.src = qrDataUrl
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = 300
      canvas.height = 430

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 300, 430)

      ctx.drawImage(img, 25, 20)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#000000'
      ctx.font = scriptName.length > 10 ? 'bold 18px "Microsoft JhengHei", sans-serif' : 'bold 22px "Microsoft JhengHei", sans-serif'
      ctx.fillText(scriptName, 150, 295)

      ctx.fillStyle = '#555555'
      ctx.font = '18px "Microsoft JhengHei", sans-serif'
      ctx.fillText(`GM: ${gmName}`, 150, 325)

      ctx.fillStyle = '#D4AF37'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(timeStr, 150, 365)

      ctx.fillStyle = '#cccccc'
      ctx.font = '12px sans-serif'
      // 🚀 繪製場館專屬 Logo 字樣
      ctx.fillText(`📍 ${branchName} - 劇光燈 LARP`, 150, 400)

      resolve(canvas.toDataURL("image/png"))
    }
  })
}

const downloadAllZip = async () => {
  const zip = new JSZip()
  const folder = zip.folder("QR_Codes")
  
  generatedImages.value.forEach(img => {
    const base64Data = img.data.split(',')[1] 
    folder.file(img.name, base64Data, { base64: true })
  })

  const blob = await zip.generateAsync({ type: "blob" })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `LARP_QR_${Date.now()}.zip`
  link.click()
}
</script>

<template>
  <div class="game-manager-container">
    
    <div class="form-section">
      <div class="form-grid">
        <div class="form-group full">
          <label>🔍 選擇劇本</label>
          <div class="search-wrapper">
            <input 
              v-model="searchQuery" 
              @input="filterScripts"
              @focus="filterScripts"
              @blur="closeDropdown"
              type="text" 
              class="admin-input select-input" 
              placeholder="點擊展開所有劇本，或直接輸入關鍵字搜尋..." 
              autocomplete="off"
            >
            <span class="dropdown-arrow">▼</span>

            <div v-show="showDropdown && searchResults.length > 0" class="search-results">
              <div 
                v-for="s in searchResults" 
                :key="s.id" 
                class="search-item"
                @click="selectScript(s)"
              >
                <span class="script-title-item">{{ s.title }}</span>
                <span class="script-limit">{{ s.player_limit || '' }}</span>
              </div>
            </div>
            <div v-show="showDropdown && searchResults.length === 0" class="search-results empty">
              找不到這本劇本喔！
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>📍 開場館別</label>
          <select v-if="props.branch === 'ALL'" v-model="selectedBranch" class="admin-input">
            <option value="西門館1.0">西門館 1.0</option>
            <option value="西門館2.0">西門館 2.0</option>
          </select>
          <input v-else type="text" class="admin-input" :value="props.branch" disabled style="color: #888; background: #1a1a1a;">
        </div>

        <div class="form-group">
          <label>帶場 GM</label>
          <input v-model="gmName" type="text" class="admin-input" placeholder="例如: 小四">
        </div>

        <div class="form-group full">
          <label>開場時間 (掃碼圖片將強制轉為24小時制)</label>
          <input v-model="gameTime" type="datetime-local" class="admin-input">
        </div>

        <div class="form-group">
          <label>✨ 本場發放 EXP (活動可加碼)</label>
          <input v-model="gameExp" type="number" class="admin-input" style="color: #D4AF37; font-weight: bold; font-size: 1.1rem;">
        </div>

        <div class="form-group full">
          <label>📜 預設手札 (載入劇本後可手動修改)</label>
          <textarea v-model="gameMemory" class="admin-input" rows="3" placeholder="這裡會自動載入劇本預設手札..."></textarea>
        </div>
      </div>
      
      <button class="btn btn-gold" @click="addToQueue">➕ 加入清單</button>
    </div>

    <div v-if="batchQueue.length > 0" class="queue-section mt-4">
      <h4 style="color: #D4AF37; margin-bottom: 10px;">待生成清單 ({{ batchQueue.length }})</h4>
      <div class="batch-list">
        <div v-for="(item, index) in batchQueue" :key="index" class="batch-item">
          <div class="item-info">
            <strong>{{ item.sn }}</strong>
            <span class="item-sub">📍 {{ item.branchName }} | GM: {{ item.gm }} | <span style="color:#D4AF37;">{{ item.dt }}</span></span>
          </div>
          <button class="btn-mini-red" @click="removeFromQueue(index)">✕</button>
        </div>
      </div>

      <button class="btn btn-green full-width mt-3" @click="processBatch" :disabled="isGenerating">
        {{ isGenerating ? '⚡ 魔法繪製中...' : '⚡ 確認生成 QR Code' }}
      </button>
    </div>

    <div v-if="generatedImages.length > 0" class="result-section mt-4">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h4 style="color: #2ecc71; margin: 0;">✅ 生成完畢</h4>
        <button class="btn btn-blue btn-small" @click="downloadAllZip">📦 下載 ZIP 包</button>
      </div>
      
      <div class="preview-grid">
        <div v-for="(img, idx) in generatedImages" :key="idx" class="preview-card">
          <img :src="img.data" class="qr-preview-img">
          <div class="preview-name">{{ img.name }}</div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.game-manager-container { display: flex; flex-direction: column; }

.form-section { background: #111; padding: 25px; border-radius: 12px; border: 1px solid #222; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.form-group { display: flex; flex-direction: column; position: relative; }
.form-group.full { grid-column: span 2; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 0.9rem; font-weight: bold; }
.admin-input { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-size: 1rem; font-family: inherit;}
.admin-input:focus { border-color: #D4AF37; outline: none; }
textarea.admin-input { resize: vertical; }

/* 下拉選單樣式升級 */
.search-wrapper { position: relative; }
.select-input { padding-right: 30px; cursor: pointer; }
.dropdown-arrow { position: absolute; right: 12px; top: 14px; color: #888; font-size: 0.8rem; pointer-events: none; }
.search-results { position: absolute; top: 100%; left: 0; right: 0; margin-top: 5px; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; max-height: 250px; overflow-y: auto; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
.search-item { padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
.search-item:hover { background: #D4AF37; color: black; }
.script-title-item { font-weight: bold; }
.script-limit { font-size: 0.8rem; color: #aaa; }
.search-item:hover .script-limit { color: #333; }
.search-results.empty { padding: 15px; text-align: center; color: #888; }

select.admin-input { appearance: none; cursor: pointer; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23D4AF37%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 15px top 50%; background-size: 12px auto; padding-right: 40px; }

.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; width: 100%; }
.btn-gold:hover { background: #e5c358; }
.btn-green { background: #2ecc71; color: black; font-size: 1.1rem; padding: 15px;}
.btn-green:hover { background: #27ae60; }
.btn-blue { background: #3498db; color: white; }
.btn-blue:hover { background: #2980b9; }
.btn-small { padding: 8px 15px; font-size: 0.9rem; }
.btn-mini-red { background: #331111; color: #ff5555; border: 1px solid #552222; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-mini-red:hover { background: #ff5555; color: white; }

.full-width { width: 100%; }
.mt-3 { margin-top: 15px; }
.mt-4 { margin-top: 25px; }

.queue-section { background: #1a1a1a; padding: 20px; border-radius: 12px; border: 1px solid #333; }
.batch-item { background: #222; padding: 12px 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid #D4AF37; display: flex; justify-content: space-between; align-items: center; }
.item-info { display: flex; flex-direction: column; gap: 4px; }
.item-sub { font-size: 0.85rem; color: #888; }

.result-section { background: #111; padding: 20px; border-radius: 12px; border: 1px dashed #2ecc71; }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; }
.preview-card { background: #fff; padding: 10px; border-radius: 8px; text-align: center; }
.qr-preview-img { width: 100%; height: auto; border-radius: 4px; border: 1px solid #eee; }
.preview-name { font-size: 0.7rem; color: #666; margin-top: 8px; word-break: break-all; }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; gap: 15px; }
  .form-group.full { grid-column: span 1; }
  .preview-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
}
</style>