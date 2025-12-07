import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'rider',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['RIDER'] },
    loadChildren: () => import('./features/rider/rider.routes').then((m) => m.RIDER_ROUTES),
  },
  {
    path: 'driver',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['DRIVER'] },
    loadChildren: () => import('./features/driver/driver.routes').then((m) => m.DRIVER_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN'] },
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];
