// Single history router for the /app/ migration shell
// (Refs #291, #293, LLD §11.1).
//
// The desk screen (Refs #293) is the first real screen migration:
// `/` renders the desk dashboard SFC. The book screen (Refs #294)
// follows at `/book`. Every other path still falls
// through to the placeholder (LLD §11.1 edge U–V); the remaining
// screen routes and the print route land in follow-up issues.
import { createRouter, createWebHistory } from 'vue-router';
import type { Router } from 'vue-router';
import BookView from './views/BookView.vue';
import DeskView from './views/DeskView.vue';
import PlaceholderView from './views/Placeholder.vue';

export function createAppRouter(): Router {
  return createRouter({
    history: createWebHistory('/app/'),
    routes: [
      {
        path: '/',
        name: 'desk',
        component: DeskView,
      },
      {
        path: '/book',
        name: 'book',
        component: BookView,
      },
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
