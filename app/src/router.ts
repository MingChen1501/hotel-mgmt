// Single-route history router for the /app/ migration shell
// (Refs #291, LLD §11.1).
//
// Exactly one route exists in this slice: a catch-all rendering the
// placeholder view. History-mode deep links, reloads, unknown paths,
// and the reserved `/app/print/...` namespace all boot the
// placeholder (LLD §11.1 edge U–V); real screen routes and the print
// route land in follow-up issues.
import { createRouter, createWebHistory } from 'vue-router';
import type { Router } from 'vue-router';
import PlaceholderView from './views/Placeholder.vue';

export function createAppRouter(): Router {
  return createRouter({
    history: createWebHistory('/app/'),
    routes: [
      {
        path: '/:pathMatch(.*)*',
        name: 'placeholder',
        component: PlaceholderView,
      },
    ],
  });
}

const router = createAppRouter();

export default router;
