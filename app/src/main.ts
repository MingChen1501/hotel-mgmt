// /app/ migration shell bootstrap (Refs #291, LLD §11.1 edge F–G):
// install Pinia, mount the single-route history router.
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { attachConnectivityListeners } from './api/client';

const app = createApp(App);
app.use(createPinia());
app.use(router);
attachConnectivityListeners();

app.mount('#app');
