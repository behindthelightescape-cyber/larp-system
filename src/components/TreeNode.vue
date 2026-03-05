<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ node: Object })

const isExpanded = ref(true)
const hasChildren = computed(() => props.node?.children?.length > 0)
const isActive = computed(() => props.node?.total_exp > 0)
const toggle = () => { if (hasChildren.value) isExpanded.value = !isExpanded.value }

const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' rx='20' fill='%23333'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' dominant-baseline='middle' fill='%23888' font-size='16'%3E?%3C/text%3E%3C/svg%3E`
</script>

<template>
  <div class="t-node-wrap">
    <!-- 節點卡片 -->
    <div class="t-node-col">
      <div
        class="t-card"
        :class="[node.isRoot ? 't-card-root' : '', isActive ? 't-card-active' : '']"
        @click="toggle"
      >
        <div class="t-avatar-wrap">
          <img :src="node.picture_url || defaultAvatar" class="t-avatar" />
          <div v-if="node.isRoot" class="t-crown">👑</div>
          <div v-else class="t-status-dot" :class="isActive ? 'dot-active' : 'dot-pending'"></div>
        </div>
        <div class="t-info">
          <div class="t-name">{{ node.display_name?.slice(0, 7) }}{{ node.display_name?.length > 7 ? '…' : '' }}</div>
          <div class="t-meta">
            <span v-if="node.isRoot" class="t-badge t-badge-root">祖師</span>
            <span v-else class="t-badge">{{ node.generation }}代</span>
            <span class="t-lv">Lv.{{ node.level || 1 }}</span>
          </div>
        </div>
        <div v-if="hasChildren" class="t-toggle" :class="{ expanded: isExpanded }">▾</div>
      </div>
      <div v-if="hasChildren && isExpanded" class="t-vline-down"></div>
    </div>

    <!-- 子節點（遞迴） -->
    <div v-if="hasChildren && isExpanded" class="t-children-wrap">
      <div class="t-hline"></div>
      <div class="t-children-row">
        <div v-for="child in node.children" :key="child.id" class="t-child-col">
          <div class="t-vline-up"></div>
          <!-- 自我遞迴 -->
          <TreeNode :node="child" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.t-node-wrap { display: flex; flex-direction: column; align-items: center; }
.t-node-col { display: flex; flex-direction: column; align-items: center; }

.t-card {
  display: flex; align-items: center; gap: 8px;
  background: #161616; border: 1px solid #2a2a2a;
  border-radius: 12px; padding: 8px 10px;
  width: 130px; box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
}
.t-card-root {
  background: rgba(212,175,55,0.07);
  border-color: rgba(212,175,55,0.5);
  box-shadow: 0 0 14px rgba(212,175,55,0.15);
  width: 148px;
}
.t-card-active { border-color: rgba(46,204,113,0.25); }

.t-avatar-wrap { position: relative; flex-shrink: 0; }
.t-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #333; display: block; }
.t-card-root .t-avatar { width: 42px; height: 42px; border-color: #D4AF37; }
.t-crown { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); font-size: 13px; }
.t-status-dot { position: absolute; bottom: 1px; right: 1px; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid #111; }
.dot-active { background: #2ecc71; }
.dot-pending { background: #555; }

.t-info { flex: 1; min-width: 0; }
.t-name { color: #eee; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-card-root .t-name { color: #D4AF37; font-size: 12px; }
.t-meta { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
.t-badge { background: rgba(212,175,55,0.15); color: #D4AF37; border: 1px solid rgba(212,175,55,0.3); padding: 1px 5px; border-radius: 4px; font-size: 9px; }
.t-badge-root { background: rgba(212,175,55,0.25); }
.t-lv { color: #555; font-size: 9px; }

.t-toggle { color: #555; font-size: 14px; line-height: 1; transition: transform 0.2s; }
.t-toggle.expanded { transform: rotate(0deg); }
.t-toggle:not(.expanded) { transform: rotate(-90deg); }

.t-vline-down { width: 2px; height: 20px; background: linear-gradient(to bottom, rgba(212,175,55,0.4), rgba(212,175,55,0.1)); }
.t-vline-up   { width: 2px; height: 20px; background: linear-gradient(to bottom, rgba(212,175,55,0.1), rgba(212,175,55,0.4)); }

.t-children-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; }
.t-hline { height: 1px; width: 100%; background: rgba(212,175,55,0.2); }
.t-children-row { display: flex; flex-direction: row; align-items: flex-start; gap: 12px; padding: 0 6px; }
.t-child-col { display: flex; flex-direction: column; align-items: center; }
</style>