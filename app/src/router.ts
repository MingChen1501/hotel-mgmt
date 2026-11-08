// Single history router for the /app/ migration shell
// (Refs #291, #293, LLD section 11.1).
//
// The desk screen (Refs #293) is the first real screen migration:
// `/` renders the desk dashboard SFC. The book screen (Refs #294)
// follows at `/book`, the stay screen (Refs #295) at `/stay`, the
// folio screen (Refs #296) at `/folio`, the print screen
// (Refs #297) at `/print`, and the admin console (Refs #298) at
// `/admin`. Every other path still falls through to
// the placeholder (LLD section 11.1 edge U–V).
import { createRouter, createWebHistory } from 'vue-router';
import type { Router } from 'vue-router';
import AdminView from './views/AdminView.vue';
import BookView from './views/BookView.vue';
import DeskView from './views/DeskView.vue';
import FolioView from './views/FolioView.vue';
import OnboardingView from './views/OnboardingView.vue';
import PlaceholderView from './views/Placeholder.vue';
import PrintView from './views/PrintView.vue';
import RoomsView from './views/RoomsView.vue';
import StayView from './views/StayView.vue';

// Per-route document titles (Refs #495 S2): the SPA shell serves one
// static title from `app/index.html` for every screen while each of
// the seven design boards carries its own `<title>` (Main `Bảng lễ
// tân`, Book `Đặt phòng`, Stay `Nhận phòng`, Folio `Hoá đơn`, Rooms
// `Sơ đồ phòng`, Onboarding `Thiết lập lần đầu`, Admin `Quản trị`).
// The shell applies the route's catalogue title on navigation (see
// `App.vue`), so the served document title matches the design board
// per screen. Routes outside the design batch (print, placeholder)
// carry no title meta and fall back to the default below.
export interface DocTitleMeta {
  docTitleKey?: unknown;
  docTitleFallback?: unknown;
}

export const DEFAULT_DOC_TITLE = {
  key: 'desk.shell.doc_title_default',
  fallback: 'Hotel Management — Desk',
} as const;

export function createAppRouter(): Router {
  return createRouter({
    history: createWebHistory('/app/'),
    routes: [
      {
        path: '/',
        name: 'desk',
        component: DeskView,
        meta: { docTitleKey: 'desk.shell.doc_title_desk', docTitleFallback: 'Desk board' },
      },
      {
        path: '/book',
        name: 'book',
        component: BookView,
        meta: { docTitleKey: 'desk.shell.doc_title_book', docTitleFallback: 'Book a room' },
      },
      {
        path: '/stay',
        name: 'stay',
        component: StayView,
        meta: { docTitleKey: 'desk.shell.doc_title_stay', docTitleFallback: 'Check-in / check-out' },
      },
      {
        path: '/onboarding',
        name: 'onboarding',
        component: OnboardingView,
        meta: {
          docTitleKey: 'desk.shell.doc_title_onboarding',
          docTitleFallback: 'First-time setup',
        },
      },
      {
        path: '/rooms',
        name: 'rooms',
        component: RoomsView,
        meta: { docTitleKey: 'desk.shell.doc_title_rooms', docTitleFallback: 'Room map' },
      },
      {
        path: '/folio',
        name: 'folio',
        component: FolioView,
        meta: { docTitleKey: 'desk.shell.doc_title_folio', docTitleFallback: 'Folio' },
      },
      {
        path: '/print',
        name: 'print',
        component: PrintView,
      },
      {
        path: '/admin',
        name: 'admin',
        component: AdminView,
        meta: { docTitleKey: 'desk.shell.doc_title_admin', docTitleFallback: 'Admin board' },
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
