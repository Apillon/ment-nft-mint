<template>
  <div v-if="text" class="flex">
    <n-ellipsis class="align-bottom" :line-clamp="1">{{ text }}</n-ellipsis>
    <button class="ml-2" @click="copyToClipboard(text)">
      <span class="icon-copy"></span>
    </button>
  </div>
</template>

<script lang="ts" setup>
defineProps({
  text: { type: String, default: '' },
});
</script>
