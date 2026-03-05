<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ node: Object })

const isExpanded = ref(true)
const hasChildren = computed(() => props.node?.children?.length > 0)
const isActive = computed(() => props.node?.total_exp > 0)
const toggle = () => { if (hasChildren.value) isExpanded.value = !isExpanded.value }

const genColors = ['#D4AF37', '#a78bfa', '#60a5fa', '#34d399', '#f87171', '#fb923c']
const genColor = computed(() => {
  const g = props.node?.generation ?? 0
  return genColors[g % genColors.length]
})
</script>

<template>
  <div class="t-node-wrap">
    <div class="t-node-col">
      <div
        class="t-card"
        :class="[node.isRoot ? 't-card-root' : '', isActive ? 't-card-active' : '']"
        :style="!node.isRoot ? { '--gen-color': genColor } : {}"
        @click="toggle"
      >
        <!-- 左側代數色條 -->
        <div v-if="!node.isRoot" class="t-gen-bar" :style="{ background: genColor }"></div>

        <div class="t-info">
          <!-- 名字行 -->
          <div class="t-name" :style="node.isRoot ? { color: '#D4AF37' } : {}">
            {{ node.display_name?.slice(0, 9) }}{{ node.display_name?.length > 9 ? '…' : '' }}
          </div>

          <!-- 標籤行 -->
          <div class="t-meta">
            <span v-if="node.isRoot" class="t-badge" style="background:rgba(212,175,55,0.2);color:#D4AF37;border-color:rgba(212,175,55,0.4)">
              👑 宗主
            </span>
            <template v-else>
              <span class="t-badge" :style="{ color: genColor, borderColor: genColor + '55', background: genColor + '18' }">
                {{ node.generation }}代
              </span>
              <span class="t-status" :class="isActive ? 'status-on' : 'status-off'">
                {{ isActive ? '出師' : '見習' }}
              </span>
            </template>
            <span class="t-lv">Lv.{{ node.level || 1 }}</span>
          </div>
        </div>

        <!-- 展開箭頭 -->
        <div v-if="hasChildren" class="t-toggle" :class="{ expanded: isExpanded }">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
      </div>

      <!-- 向下連線 -->
      <div v-if="hasChildren && isExpanded" class="t-vline-down"></div>
    </div>

    <!-- 子節點 -->
    <div v-if="hasChildren && isExpanded" class="t-children-wrap">
      <div class="t-hline"></div>
      <div class="t-children-row">
        <div v-for="child in node.children" :key="child.id" class="t-child-col">
          <div class="t-vline-up"></div>
          <TreeNode :node="child" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.t-node-wrap { display: flex; flex-direction: column; align-items: center; }
.t-node-col  { display: flex; flex-direction: column; align-items: center; }

.t-card {
  display: flex; align-items: center; gap: 0;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  overflow: hidden;
  width: 138px;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.t-card:active { background: #1c1c1c; }

.t-card-root {
  background: rgba(212,175,55,0.06);
  border-color: rgba(212,175,55,0.45);
  box-shadow: 0 0 16px rgba(212,175,55,0.1);
  width: 148px;
}
.t-card-active { border-color: rgba(46,204,113,0.2); }

/* 左側代數色條 */
.t-gen-bar {
  width: 3px;
  align-self: stretch;
  flex-shrink: 0;
  opacity: 0.8;
}

.t-info {
  flex: 1;
  min-width: 0;
  padding: 9px 8px 8px 9px;
}

.t-name {
  color: #e8e8e8;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.2px;
  margin-bottom: 5px;
}

.t-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.t-badge {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  border: 1px solid;
  white-space: nowrap;
}

.t-status {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}
.status-on  { background: rgba(46,204,113,0.12); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3); }
.status-off { background: rgba(255,255,255,0.05); color: #555; border: 1px solid #333; }

.t-lv { color: #444; font-size: 9px; margin-left: auto; white-space: nowrap; }

.t-toggle {
  color: #444;
  padding: 0 8px;
  align-self: stretch;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: color 0.2s;
}
.t-card:hover .t-toggle { color: #888; }
.t-toggle svg { transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); }
.t-toggle:not(.expanded) svg { transform: rotate(-90deg); }
.t-toggle.expanded svg { transform: rotate(0deg); }

/* 連線 */
.t-vline-down { width: 1px; height: 18px; background: linear-gradient(to bottom, rgba(212,175,55,0.35), rgba(212,175,55,0.08)); }
.t-vline-up   { width: 1px; height: 18px; background: linear-gradient(to bottom, rgba(212,175,55,0.08), rgba(212,175,55,0.35)); }

.t-children-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; }
.t-hline { height: 1px; width: 100%; background: rgba(212,175,55,0.15); }
.t-children-row { display: flex; flex-direction: row; align-items: flex-start; gap: 10px; padding: 0 5px; }
.t-child-col { display: flex; flex-direction: column; align-items: center; }
</style>