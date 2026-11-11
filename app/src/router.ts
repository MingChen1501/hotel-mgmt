// Single history router for the /app/ migration shell
// (Refs #291, #293, LLD section 11.1).
//
// The desk screen (Refs #293) is the first real screen migration:
// `/` renders the desk dashboard SFC. The book screen (Refs #294)
// follows at `/book`, the stay screen (Refs #295) at `/stay`, the
// folio screen (Refs #296) at `/folio`, the print screen
// (Refs #297) at `/print`, the admin console (Refs #298) at
// `/admin`, and the rooms and rates management desk screen (#590) at
// `/manage`, and the read-only booking register (#648) at
// `/bookings`. Every other path still falls through to the
// placeholder (LLD section 11.1 edge U–V).
import { createRouter, createWebHistory } from 'vue-router';
import type { Router } from 'vue-router';
import AdminView from './views/AdminView.vue';
import BookingsView from './views/BookingsView.vue';
import BookView from './views/BookView.vue';
import DeskView from './views/DeskView.vue';
import FolioView from './views/FolioView.vue';
import ManageView from './views/ManageView.vue';
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
        // Read-only booking register (Refs #648): the list-and-detail
        // screen over the existing reservation, room, and stay reads.
        // The tab sits immediately after `Book`, grouping booking
        // creation with booking browsing (spec section 3; the app-only
        // `manage` route below is the shape).
        path: '/bookings',
        name: 'bookings',
        component: BookingsView,
        meta: {
          docTitleKey: 'desk.shell.doc_title_bookings',
          docTitleFallback: 'Bookings',
        },
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
        // Rooms and rates management desk screen (Refs #590): setup
        // for room types, room floors, and nightly prices. The tab
        // sits immediately after `Rooms` (owner decision O-1).
        path: '/manage',
        name: 'manage',
        component: ManageView,
        meta: { docTitleKey: 'desk.shell.doc_title_manage', docTitleFallback: 'Rooms and rates' },
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
