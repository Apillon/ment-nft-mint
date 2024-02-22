<script lang="ts" setup>
import SuperRareJpg from '~/assets/images/superrare.jpg';

const { isMd } = useScreen();

useHead({
  title: 'Mint your MENT Token',
});
</script>

<template>
  <div class="my-10 flex flex-col gap-x-12 gap-y-8 md:flex-row lg:my-14 max-w-4xl mx-auto">
    <div class="max-w-md w-full lg:w-1/2">
      <span class="mb-2 inline-block text-xs font-bold uppercase tracking-[0.2em]">
        The Shape of MENT to Come
      </span>
      <h1>Sign up and win one of 200 MENT tokens</h1>

      <p class="body-lg">
        By signing up, you’ll be in the game for the hottest perks in the form of MENT token
      </p>
      <FormSighUp btn-text="Sign up" />
    </div>
    <div class="flex-cc relative min-w-[20rem] w-full lg:w-1/2">
      <img
        v-if="isMd"
        :src="SuperRareJpg"
        class="mx-auto"
        width="461"
        height="461"
        alt="Super rare NFT"
      />
      <Btn
        class="!text-black mt-3"
        size="large"
        type="secondary"
        href="https://moonbeans.io/collections/ment"
      >
        View MENT Token collection
        <NuxtIcon name="arrow" class="absolute right-6 icon-auto" />
      </Btn>
    </div>
  </div>
</template>
