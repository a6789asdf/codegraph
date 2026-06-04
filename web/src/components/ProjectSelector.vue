<template>
  <a-select
    v-model="currentProject"
    style="width: 300px"
    placeholder="选择项目..."
    show-search
    :filter-option="filterOption"
    @change="onProjectChange"
  >
    <a-select-option v-for="p in projects" :key="p.path" :value="p.path">
      {{ p.name }}
      <span style="color: #999; font-size: 12px; margin-left: 8px">{{ p.path }}</span>
    </a-select-option>
  </a-select>
</template>

<script>
import { mapState } from 'vuex';

export default {
  name: 'ProjectSelector',
  computed: {
    ...mapState('project', ['projects']),
    currentProject: {
      get() {
        return this.$store.state.project.currentProject;
      },
      set() {},
    },
  },
  watch: {
    projects: {
      handler(projects) {
        if (projects.length > 0 && this.$store.state.project.currentProject === null) {
          this.$store.dispatch('project/selectProject', projects[0].path);
        }
      },
      immediate: true,
    },
  },
  mounted() {
    this.$store.dispatch('project/fetchProjects');
  },
  methods: {
    onProjectChange(path) {
      this.$store.dispatch('project/selectProject', path);
    },
    filterOption(input, option) {
      const text = option.key + (option.children?.[0]?.text || '');
      return text.toLowerCase().includes(input.toLowerCase());
    },
  },
};
</script>
