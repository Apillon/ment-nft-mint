<template>
  <n-upload
    v-if="!uploadedFile"
    :show-file-list="false"
    accept=".csv, application/vnd.ms-excel"
    class="w-full"
    :custom-request="uploadFileRequest"
  >
    <Btn type="secondary" size="large"> Select CSV file </Btn>
  </n-upload>
  <template v-else>
    <div class="flex text-left">
      <div class="border border-bg-lighter flex-1 px-4 py-2 rounded-lg flex items-center">
        <span class="icon-file text-xl align-sub mr-3"></span>
        <span>{{ uploadedFile.name }}</span>
      </div>
      <div class="">
        <button
          class="flex justify-center items-center h-12 w-12 ml-4 p-3"
          @click="uploadedFile = null"
        >
          <span class="icon-delete text-xl"></span>
        </button>
      </div>
    </div>
    <Notification v-if="!hasRequiredColumns" type="error" class="mt-4 text-left">
      Invalid file format. Please upload a valid CSV file with column "email".
    </Notification>
  </template>

  <div class="flex gap-8 mt-9">
    <Btn type="secondary" @click="$emit('close')"> Close </Btn>
    <Btn
      class="flex-auto"
      type="primary"
      :color="colors.blue"
      :disabled="!uploadedFile || !hasRequiredColumns || !fileData || fileData.length === 0"
      @click="$emit('proceed', fileData)"
    >
    <span class="text-black">Start New Airdrop</span>
    </Btn>
  </div>
</template>

<script lang="ts" setup>
import type { UploadCustomRequestOptions } from 'naive-ui';
import type { FileInfo } from 'naive-ui/es/upload/src/interface';
import colors from '~/tailwind.colors';

defineEmits(['close', 'proceed']);

const message = useMessage();
const { vueApp } = useNuxtApp();
const $papa = vueApp.config.globalProperties.$papa;

const uploadedFile = ref<FileInfo | null>(null);
const fileData = ref<CsvItem[] | null>(null);
const fileColumns = ref<String[]>([]);
const requiredColumns = ['email'];

const hasRequiredColumns = computed<boolean>(() =>
  requiredColumns.every(item => fileColumns.value.includes(item))
);

function uploadFileRequest({ file, onError, onFinish }: UploadCustomRequestOptions) {
  if (file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
    console.warn(file.type);
    message.warning('File must be of CSV type.');

    /** Mark file as failed */
    onError();
    return;
  }

  parseUploadedFile(file.file);
  uploadedFile.value = file;
  onFinish();
}

function parseUploadedFile(file?: File | null) {
  if (!file) {
    return;
  }

  $papa.parse(file, {
    header: true,
    delimiter: '\n',
    skipEmptyLines: true,
    complete: async (results: CsvFileData) => {
      if (results.errors && results.errors.length) {
        uploadedFile.value = null;
        message.warning(results.errors[0].message);
      } else if (results.data.length) {
        fileData.value = results.data;
        fileColumns.value = results.meta.fields;
      }
    },
    error: function (error: string) {
      console.log(error);
      uploadedFile.value = null;
    },
  });
}
</script>
