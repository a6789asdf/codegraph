import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/projects',
  },
  {
    path: '/projects',
    name: 'Projects',
    component: () => import('@/views/Projects.vue'),
  },
  {
    path: '/projects/:id',
    component: () => import('@/views/ProjectLayout.vue'),
    children: [
      { path: '', redirect: (to: any) => `/projects/${to.params.id}/dashboard` },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'search', name: 'Search', component: () => import('@/views/SearchView.vue') },
      { path: 'graph', name: 'Graph', component: () => import('@/views/GraphView.vue') },
      { path: 'routes', name: 'Routes', component: () => import('@/views/RoutesView.vue') },
      { path: 'quality', name: 'Quality', component: () => import('@/views/QualityView.vue') },
      { path: 'impact', name: 'Impact', component: () => import('@/views/ImpactAnalysis.vue') },
      { path: 'architecture', name: 'Architecture', component: () => import('@/views/Architecture.vue') },
      { path: 'architecture/communities/:communityId', name: 'CommunityDetail', component: () => import('@/views/CommunityDetail.vue') },
      { path: 'flows', name: 'Flows', component: () => import('@/views/Flows.vue') },
      { path: 'flows/:flowId', name: 'FlowDetail', component: () => import('@/views/FlowDetail.vue') },
      { path: 'review', name: 'Review', component: () => import('@/views/Review.vue') },
      { path: 'refactor', name: 'Refactor', component: () => import('@/views/Refactor.vue') },
      { path: 'wiki', name: 'Wiki', component: () => import('@/views/Wiki.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
