<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'

// The demo is the built standalone viewer (dist/viewer) loading a synthetic contract fixture: the same bundle hosts
// ship, under the same rules. Nothing here talks to a backend.
const fixtures = [
  { page: 'index.html', label: 'Blog · combined (Eloquent)' },
  { page: 'drift.html', label: 'Drift · combined (SQLAlchemy)' },
  { page: 'shop.html', label: 'Shop · declared (SQLAlchemy)' },
  { page: 'postgresql.html', label: 'PostgreSQL indexes' },
  { page: 'mysql.html', label: 'MySQL indexes' },
  { page: 'sqlite.html', label: 'SQLite indexes' },
  { page: 'connections.html', label: 'Three connections' },
  { page: 'compare.html', label: 'Tenant schemas compared' },
  { page: 'compare-incomplete.html', label: 'Incomplete comparison' },
  { page: 'migrations.html', label: 'Migration status' },
  { page: 'inferred.html', label: 'Inferred associations' },
]
// The viewer picks its theme from this localStorage key (src/viewer/theme.ts), which the same-origin demo shares with
// the site, and reads it only on load: write it, then (re)load the demo.
const THEME_KEY = 'laranex-schema-viewer-theme'

const { isDark } = useData()
const frame = ref(null)
const page = ref(fixtures[0].page)
const ready = ref(false)
const active = ref(false)
const src = computed(() => withBase(`/demo/${page.value}`))
function storeTheme() {
  try { localStorage.setItem(THEME_KEY, isDark.value ? 'dark' : 'light') } catch { /* storage may be unavailable */ }
}
function loaded() { if (active.value) ready.value = true }
watch(isDark, () => {
  storeTheme()
  if (ready.value) frame.value?.contentWindow?.location.reload()
})
// The demo loads only on the client, after the theme is stored, so a prerendered page never shows it in the other theme.
onMounted(() => { storeTheme(); active.value = true })
</script>

<template>
  <section class="lx-demo" aria-label="Synthetic schema demonstration">
    <div class="lx-demo-bar">
      <span><i></i><i></i><i></i><b>INTERACTIVE DEMO</b></span>
      <label class="lx-demo-pick">Schema
        <select v-model="page" @change="ready = false">
          <option v-for="f in fixtures" :key="f.page" :value="f.page">{{ f.label }}</option>
        </select>
      </label>
    </div>
    <iframe ref="frame" :src="active ? src : undefined" title="Interactive ERD of a synthetic schema" loading="lazy" @load="loaded"></iframe>
    <div class="lx-demo-footer"><span>{{ ready ? 'Drag to explore · scroll to zoom · select for details · press S for shortcuts' : 'Loading the demo when it comes into view…' }}</span><a :href="src" target="_blank" rel="noopener">Open full screen ↗</a></div>
  </section>
</template>
