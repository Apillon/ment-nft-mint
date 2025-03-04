<script lang="ts" setup>
import UploadSVG from '~/assets/images/upload.svg';
import colors from '~/tailwind.colors';
import { useAccount } from 'use-wagmi';
import { AirdropStatus } from '~/lib/values/general.values';

definePageMeta({
  layout: 'admin',
});
useHead({
  title: 'Mint your MENT Token',
});

const message = useMessage();
const userStore = useUserStore();
const { isConnected } = useAccount();
const { handleError } = useErrors();

let recipientInterval: any = null;
const data = ref<UserInterface[]>([]);
const statistics = ref<StatisticsInterface | null>(null);
const modalUploadCsvVisible = ref<boolean>(false);

const isLoggedIn = computed(() => isConnected.value && userStore.jwt);

onMounted(async () => {
  if (isLoggedIn.value) {
    await getUsers();
    await getStatistics();
  }
});

onUnmounted(() => {
  clearInterval(recipientInterval);
});

watch(
  () => isLoggedIn.value,
  async _ => {
    if (isLoggedIn.value) {
      await getUsers();
      await getStatistics();
    }
  }
);

function onFileUploaded(csvData: CsvItem[]) {
  modalUploadCsvVisible.value = false;

  const userData: UserInterface[] = csvData.map(item => {
    return {
      airdrop_status: AirdropStatus.PENDING,
      email: item.email,
      email_sent_time: null,
      email_start_send_time: null,
      wallet: null,
    } as UserInterface;
  });

  if (!Array.isArray(data.value) || data.value.length === 0) {
    data.value = userData;
  } else {
    userData.forEach(item => {
      if (emailAlreadyExists(item.email)) {
        message.warning(`Email: ${item.email} is already on the list`);
      } else {
        data.value.unshift(item as UserInterface);
      }
    });
  }
}

function emailAlreadyExists(email: string) {
  return data.value.some(item => item.email === email);
}

async function getUsers() {
  const res = await $api.get<UsersResponse>('/users', { itemsPerPage: 10000 });
  if (data.value.length === 0 || data.value.length === res.data.items.length) {
    data.value = res.data.items;
  } else {
    res.data.items.forEach(item => {
      const recipient = data.value.find(r => r.email === item.email);
      if (recipient) {
        recipient.airdrop_status = item.airdrop_status;
        recipient.id = item.id;
        recipient.email = item.email;
        recipient.email_sent_time = item.email_sent_time;
        recipient.email_start_send_time = item.email_start_send_time;
        recipient.tx_hash = item.tx_hash;
        recipient.wallet = item.wallet;
      } else {
        data.value.unshift(item);
      }
    });
  }

  /** Users pooling */
  checkUnfinishedRecipients();
}

async function getStatistics() {
  const res = await $api.get<StatisticsResponse>('/users/statistics');
  statistics.value = res.data;
}

function addRecipient() {
  data.value.push({
    airdrop_status: AirdropStatus.PENDING,
    email: '',
    email_sent_time: null,
    email_start_send_time: null,
    wallet: null,
  });
}

function onUserRemove(email: string) {
  data.value = data.value.filter(item => item.email !== email);
}
function onUserAdded(user: UserInterface) {
  data.value.push(JSON.parse(JSON.stringify(user)));
  saveRecipients();
}

async function saveRecipients() {
  const uploadItems = data.value.filter(item => !item.id && item.email);

  if (!userStore.jwt) {
    message.warning('Please login first to proceed with this action');
    return;
  } else if (!uploadItems || uploadItems.length === 0) {
    message.warning('Upload CSV file and add some recipients first.');
    return;
  }

  try {
    await $api.post('/users/create', { users: uploadItems });
    await getUsers();
    await getStatistics();

    message.success('Recipients are successfully added.');
  } catch (e) {
    handleError(e);
  }
}

/** Recipients polling */
function checkUnfinishedRecipients() {
  const unfinishedRecipient = data.value.find(
    item => item.airdrop_status === AirdropStatus.PENDING
  );
  if (unfinishedRecipient === undefined) {
    return;
  }

  clearInterval(recipientInterval);
  recipientInterval = setInterval(async () => {
    await getUsers();
    const recipient = data.value.find(item => item.airdrop_status === AirdropStatus.PENDING);
    if (!recipient || recipient.airdrop_status >= AirdropStatus.EMAIL_SENT) {
      clearInterval(recipientInterval);
    }
  }, 10000);
}
</script>

<template>
  <div v-if="!isConnected" class="mx-auto">
    <div class="text-lg mb-4">Email airdrop</div>
    <ConnectWallet admin />
  </div>
  <div v-else>
    <div class="w-full my-12 mx-auto">
      <h3 class="my-8">NFT Recipient Stock</h3>

      <Statistics v-if="statistics" :statistics="statistics" />
      <TableUsers v-if="data" :users="data" @add-user="onUserAdded" @remove-user="onUserRemove" />

      <n-space class="w-full my-8" size="large" align="center" justify="space-between">
        <n-space size="large">
          <Btn type="primary" class="text-black" @click="getUsers()">
            <span class="text-black">Refresh</span>
          </Btn>
          <Btn :color="colors.blue" class="text-black" @click="modalUploadCsvVisible = true">
            <span class="text-black">Upload CSV</span>
          </Btn>
          <Btn type="secondary" @click="addRecipient">
            <span class="text-black">Add recipient</span>
          </Btn>
        </n-space>

        <div v-if="data && data.length" class="flex gap-4 items-center">
          <Btn
            :color="colors.blue"
            class="text-black"
            :disabled="!data || data.length === 0"
            @click="saveRecipients()"
          >
            <span class="text-black">Save recipients</span>
          </Btn>
        </div>
      </n-space>
    </div>

    <modal
      :show="modalUploadCsvVisible"
      @close="() => (modalUploadCsvVisible = false)"
      @update:show="modalUploadCsvVisible = false"
    >
      <div class="max-w-md w-full md:px-6 my-12 mx-auto">
        <div class="mb-5 text-center">
          <img :src="UploadSVG" class="mx-auto" width="203" height="240" alt="airdrop" />
          <h3 class="my-8 text-center">Upload your CSV file with recipients’ addresses</h3>
          <p class="text-center">
            Select and upload the CSV file containing addresses to which you wish to distribute
            NFTs.
          </p>
          <Btn type="builders" class="text-black" size="tiny" href="/files/example.csv">
            Download CSV sample
          </Btn>
        </div>
        <FormUpload @close="modalUploadCsvVisible = false" @proceed="onFileUploaded" />
      </div>
    </modal>
  </div>
</template>
