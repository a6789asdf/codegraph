import Vue from 'vue';
import Vuex from 'vuex';
import project from './modules/project';
import graph from './modules/graph';
import search from './modules/search';
import quality from './modules/quality';

Vue.use(Vuex);

export default new Vuex.Store({
  modules: {
    project,
    graph,
    search,
    quality,
  },
});
