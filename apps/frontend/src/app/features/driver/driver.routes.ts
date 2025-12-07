import { Routes } from '@angular/router';

export const DRIVER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/driver-dashboard.component').then((m) => m.DriverDashboardComponent),
  },
];
