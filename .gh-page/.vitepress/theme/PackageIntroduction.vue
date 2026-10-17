<script setup>
import { ref } from 'vue'
import { withBase } from 'vitepress'

const command = 'npm install laranex-schema-viewer-ui'
const message = ref('Copy command')
async function copy() {
  try {
    await navigator.clipboard.writeText(command)
    message.value = 'Copied'
  } catch {
    message.value = 'Select and copy the command below'
  }
}
</script>

<template>
  <header class="lx-package">
    <p class="lx-eyebrow">ONE CONTRACT, ONE VIEWER, EVERY FRAMEWORK</p>
    <h1>Laranex<i>.</i><br /><span>Schema Viewer UI</span></h1>
    <p class="lx-lead">The shared ERD viewer and the <code>laranex-schema</code> contract<br />behind the Laravel, Python and Node.js schema viewers.</p>
    <div class="lx-tags"><span>React Flow</span><span>ELK layout</span><span>laranex-schema 2.0</span><span>JSON Schema</span><span class="accent">No Node.js at runtime</span><span>MIT</span></div>
    <div class="lx-terminal">
      <div class="lx-terminal-bar"><i></i><i></i><i></i><span>install</span><button @click="copy" :aria-label="message">{{ message === 'Copied' ? 'Copied ✓' : 'Copy' }}</button></div>
      <div class="lx-install"><span aria-hidden="true">$</span><code>{{ command }}</code></div>
    </div>
    <p class="lx-caption">A React component, a standalone static bundle for Laravel and Python hosts, and the contract: types, JSON Schema, validator, graph builder and conformance fixtures.</p>
    <span class="sr-only" role="status">{{ message }}</span>
    <div class="lx-actions"><a class="lx-button primary" :href="withBase('/quick-start.html')">Get started <span aria-hidden="true">→</span></a><a class="lx-button secondary" :href="withBase('/demo.html')">Explore the live demo</a></div>
  </header>
</template>
