import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
  },
  {
    path: '/graph',
    name: 'graph',
    component: () => import('@/views/GraphView.vue'),
  },
  {
    path: '/routes',
    name: 'routes',
    component: () => import('@/views/RoutesView.vue'),
  },
  {
    path: '/quality',
    name: 'quality',
    component: () => import('@/views/QualityView.vue'),
  },
];

const router = new VueRouter({
  mode: 'history',
  base: '/',
  routes,
});

export default router;
