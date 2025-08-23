import adapter from "@sveltejs/adapter-auto";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapters#auto for a list.
    // If your environment is not supported, or you prefer a specific adapter, please adjust appropriately.
    adapter: adapter(),
  },
};

export default config;
