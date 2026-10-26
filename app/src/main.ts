// /app/ migration shell bootstrap (Refs #291, LLD §11.1 edge F–G):
// install Pinia, mount the single-route history router.
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { attachConnectivityListeners } from './api/client';
import { t } from './i18n';

const app = createApp(App);
app.use(createPinia());
app.use(router);
// Catalogue layer (Refs #292): the shell-wide `$t` is the same
// `t()` wrapper screen slices use; no routes change in this slice.
app.config.globalProperties.$t = t;
attachConnectivityListeners();

app.mount('#app');
