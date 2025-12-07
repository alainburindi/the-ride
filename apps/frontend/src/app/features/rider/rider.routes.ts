import { Routes } from '@angular/router';

export const RIDER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/rider-dashboard.component').then((m) => m.RiderDashboardComponent),
  },
];
