<template>
  <a-layout style="min-height: 100vh">
    <AppSidebar />
    <a-layout style="margin-left: 240px">
      <AppTopbar />
      <a-layout-content style="padding: 24px 28px; background: #f5f5f5; min-height: calc(100vh - 52px)">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
</script>
