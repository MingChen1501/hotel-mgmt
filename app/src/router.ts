// Single history router for the /app/ migration shell
// (Refs #291, #293, LLD §11.1).
//
// The desk screen (Refs #293) is the first real screen migration:
// `/` renders the desk dashboard SFC. The book screen (Refs #294)
// follows at `/book`, the stay screen (Refs #295) at `/stay`, the
// folio screen (Refs #296) at `/folio`, and the print screen
// (Refs #297) at `/print`. Every other path still falls through to
// the placeholder (LLD §11.1 edge U–V).
import { createRouter, createWebHistory } from 'vue-router';
import type { Router } from 'vue-router';
import BookView from './views/BookView.vue';
import DeskView from './views/DeskView.vue';
import FolioView from './views/FolioView.vue';
import PlaceholderView from './views/Placeholder.vue';
import PrintView from './views/PrintView.vue';
import StayView from './views/StayView.vue';

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
        path: '/stay',
        name: 'stay',
        component: StayView,
      },
      {
        path: '/folio',
        name: 'folio',
        component: FolioView,
      },
      {
        path: '/print',
        name: 'print',
        component: PrintView,
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
