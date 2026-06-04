<template>
  <div id="app">
    <a-layout style="min-height: 100vh">
      <a-layout-sider v-model="collapsed" collapsible :trigger="null" width="220" theme="dark">
        <div class="logo">
          <h2 style="color: #fff; margin: 16px; white-space: nowrap">
            {{ collapsed ? 'CG' : 'CodeGraph' }}
          </h2>
        </div>
        <a-menu theme="dark" mode="inline" :selected-keys="[currentRoute]">
          <a-menu-item key="dashboard" @click="$router.push('/')">
            <a-icon type="dashboard" />
            <span>仪表盘</span>
          </a-menu-item>
          <a-menu-item key="search" @click="$router.push('/search')">
            <a-icon type="search" />
            <span>搜索查询</span>
          </a-menu-item>
          <a-menu-item key="graph" @click="$router.push('/graph')">
            <a-icon type="apartment" />
            <span>图谱可视化</span>
          </a-menu-item>
          <a-menu-item key="routes" @click="$router.push('/routes')">
            <a-icon type="api" />
            <span>路由与桥接</span>
          </a-menu-item>
          <a-menu-item key="quality" @click="$router.push('/quality')">
            <a-icon type="tool" />
            <span>代码质量</span>
          </a-menu-item>
        </a-menu>
      </a-layout-sider>
      <a-layout>
        <a-layout-header style="background: #fff; padding: 0 24px; display: flex; align-items: center; justify-content: space-between">
          <div style="display: flex; align-items: center">
            <a-icon
              :type="collapsed ? 'menu-unfold' : 'menu-fold'"
              style="font-size: 18px; cursor: pointer"
              @click="collapsed = !collapsed"
            />
            <a-breadcrumb style="margin-left: 16px">
              <a-breadcrumb-item>
                <router-link to="/">CodeGraph</router-link>
              </a-breadcrumb-item>
              <a-breadcrumb-item>{{ pageTitle }}</a-breadcrumb-item>
            </a-breadcrumb>
          </div>
          <project-selector />
        </a-layout-header>
        <a-layout-content style="margin: 24px">
          <router-view />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </div>
</template>

<script>
import ProjectSelector from './components/ProjectSelector.vue';

export default {
  name: 'App',
  components: { ProjectSelector },
  data() {
    return {
      collapsed: false,
    };
  },
  computed: {
    currentRoute() {
      const name = this.$route.name;
      if (name === 'dashboard' || name === 'home') return 'dashboard';
      return name || 'dashboard';
    },
    pageTitle() {
      const titles = {
        dashboard: '仪表盘',
        search: '搜索查询',
        graph: '图谱可视化',
        routes: '路由与桥接',
        quality: '代码质量',
      };
      return titles[this.$route.name] || 'CodeGraph';
    },
  },
};
</script>

<style>
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.logo h2 {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
